import { LabError, validateDatabase } from './config.mjs';

export const required = {
  users: ['id', 'email', 'name'],
  jobs: ['id', 'title', 'company', 'created_by', 'created_at'],
  applications: ['id', 'user_id', 'job_id', 'status', 'created_at'],
};
export async function connectDatabase(config) {
  validateDatabase(config.database);
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: config.database, application_name: 'job-tracker-lab-preparation',
    connectionTimeoutMillis: 4000, statement_timeout: 20000, lock_timeout: 3000,
    query_timeout: 25000,
  });
  try { await client.connect(); }
  catch (error) { await client.end().catch(() => {}); throw error; }
  return client;
}
export async function checkSchema(client) {
  const columns = (await client.query(`SELECT table_name, column_name, data_type, is_nullable, column_default, is_identity
    FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])`, [Object.keys(required)])).rows;
  const missing = [];
  for (const [table, names] of Object.entries(required)) {
    for (const name of names) if (!columns.some(c => c.table_name === table && c.column_name === name)) missing.push(`${table}.${name}`);
  }
  if (missing.length) throw new LabError(`Сначала создай структуру в Дне 1. Не хватает: ${missing.join(', ')}. Таблицы и миграции помощник не создаёт.`);
  for (const table of Object.keys(required)) {
    const id = columns.find(c => c.table_name === table && c.column_name === 'id');
    if (!['integer', 'bigint'].includes(id.data_type) || (!id.column_default && id.is_identity !== 'YES')) {
      throw new LabError(`${table}.id должен выдаваться PostgreSQL автоматически (identity/serial). Фиксированные номера нам не нужны.`);
    }
  }
  for (const [table, field] of [['users','email'], ['users','name'], ['jobs','title'], ['jobs','company']]) {
    if (!['text', 'character varying'].includes(columns.find(c => c.table_name === table && c.column_name === field).data_type)) {
      throw new LabError(`Ожидаем текстовое поле ${table}.${field}. Для другой модели нужен адаптер данных, не автоматическая переделка схемы.`);
    }
  }
  const constraints = (await client.query(`SELECT c.conrelid::regclass::text AS table_name,
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(n, ord)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.ord) AS cols
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    WHERE n.nspname='public' AND c.contype IN ('u','p')`)).rows;
  const hasUnique = (table, names) => constraints.some(c => c.table_name.replace('public.', '') === table && c.cols.length === names.length && names.every(n => c.cols.includes(n)));
  if (!hasUnique('users', ['email']) || !hasUnique('applications', ['user_id', 'job_id'])) {
    throw new LabError('Нужны UNIQUE(users.email) и UNIQUE(applications.user_id, applications.job_id) из Дня 1. Наличие полей не заменяет ограничения.');
  }
  const extraRequired = columns.filter(c => !required[c.table_name].includes(c.column_name) && c.is_nullable === 'NO' && !c.column_default && c.is_identity !== 'YES');
  if (extraRequired.length) throw new LabError(`Есть дополнительные обязательные поля без default: ${extraRequired.map(c => `${c.table_name}.${c.column_name}`).join(', ')}. Для password_hash курс использует nullable-миграцию для старых пользователей. Не отключай ограничения молча.`);
  const identity = (await client.query(`SELECT current_database() AS database, d.oid::text AS database_oid,
    (SELECT jsonb_object_agg(relname, oid::text) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1::text[])) AS tables
    FROM pg_database d WHERE d.datname=current_database()`, [Object.keys(required)])).rows[0];
  return identity;
}
export async function transaction(client, fn) {
  await client.query('BEGIN');
  try {
    // Serializes helper writes, not normal student API requests.
    await client.query('SELECT pg_advisory_xact_lock(74208119)');
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}
export async function insertRows(client, table, columns, rows, returning, conflict = '') {
  const allowed = {
    users: ['email', 'name'], jobs: ['title', 'company', 'created_by', 'created_at'],
    applications: ['user_id', 'job_id', 'status', 'created_at'],
  };
  if (!allowed[table] || columns.some(c => !allowed[table].includes(c))) throw new LabError('Недопустимая внутренняя операция набора данных.');
  const output = [];
  for (let offset=0; offset<rows.length; offset+=500) {
    const batch = rows.slice(offset, offset+500);
    const values = batch.flat();
    const placeholders = batch.map((row,i) => `(${row.map((_,j) => `$${i*columns.length+j+1}`).join(',')})`);
    if (batch.length) output.push(...(await client.query(`INSERT INTO public."${table}" (${columns.map(c=>`"${c}"`).join(',')}) VALUES ${placeholders.join(',')} ${conflict} RETURNING ${returning}`, values)).rows);
  }
  return output;
}
export async function counts(client) {
  return (await client.query(`SELECT (SELECT count(*) FROM public.users)::int AS users,
    (SELECT count(*) FROM public.jobs)::int AS jobs, (SELECT count(*) FROM public.applications)::int AS applications`)).rows[0];
}
