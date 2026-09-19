import path from 'node:path';
import { LabError } from './config.mjs';
import { readJson, writeJson, withStateLock } from './state.mjs';
import { connectDatabase, checkSchema, transaction, insertRows, counts } from './database.mjs';

export const REF_DATE = '2026-01-01T00:00:00.000Z';
export const STATUSES = ['new', 'screening', 'interview', 'offer', 'rejected'];
const companies = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Wayne Labs', 'Stark Industries'];

// No DDL, TRUNCATE, DELETE or UPDATE. A private ledger remembers returned IDs,
// so renaming a fixture in an exercise does not recreate its former version.
async function ensureFixtures(client, state, table, natural, columns, specs) {
  const ledger = state.records[table] ||= {};
  const oldIds = specs.map(s => ledger[s.key]).filter(Boolean);
  const wanted = specs.map(s => s.values[columns.indexOf(natural)]);
  const rows = (await client.query(`SELECT * FROM public."${table}" WHERE "${natural}"=ANY($1::text[]) OR id=ANY($2::bigint[])`, [wanted, oldIds])).rows;
  const byId = new Map(rows.map(r => [String(r.id), r]));
  const byNatural = new Map();
  for (const row of rows) {
    const list = byNatural.get(row[natural]) || [];
    list.push(row); byNatural.set(row[natural], list);
  }
  const found = new Map();
  const pending = [];
  let preserved = 0;
  for (const spec of specs) {
    if (ledger[spec.key]) {
      const row = byId.get(ledger[spec.key]);
      if (row) found.set(spec.key, row);
      // Deliberately deleted records stay deleted; no resurrection on day change.
      else preserved++;
      continue;
    }
    const naturalValue = spec.values[columns.indexOf(natural)];
    const matches = byNatural.get(naturalValue) || [];
    if (matches.length > 1) throw new LabError(`Неоднозначные учебные записи в ${table}. Помощник не выбирает и не удаляет дубликат вместо тебя.`);
    if (matches.length === 1) {
      ledger[spec.key] = String(matches[0].id); found.set(spec.key, matches[0]);
    } else pending.push(spec);
  }
  const inserted = await insertRows(client, table, columns, pending.map(s=>s.values), '*', table === 'users' ? 'ON CONFLICT (email) DO NOTHING' : '');
  const pendingByNatural = new Map(pending.map(s => [s.values[columns.indexOf(natural)], s.key]));
  for (const row of inserted) {
    const key = pendingByNatural.get(row[natural]);
    ledger[key] = String(row.id); found.set(key, row);
  }
  // An API may have inserted the same email while we were preparing fixtures.
  if (table === 'users' && inserted.length !== pending.length) {
    const concurrent = (await client.query('SELECT * FROM public.users WHERE email=ANY($1::text[])', [pending.map(s=>s.values[0])])).rows;
    for (const row of concurrent) {
      const key = pendingByNatural.get(row.email); ledger[key] = String(row.id); found.set(key, row);
    }
  }
  state.preservedMissing += preserved;
  return found;
}
async function ensureApplications(client, state, specs) {
  const ledger = state.records.applications ||= {};
  const pending = specs.filter(s => !ledger[s.key]);
  if (!pending.length) return;
  await insertRows(client, 'applications', ['user_id','job_id','status','created_at'], pending.map(s=>s.values), 'id', 'ON CONFLICT (user_id,job_id) DO NOTHING');
  const users = [...new Set(pending.map(s=>s.values[0]))];
  const jobs = [...new Set(pending.map(s=>s.values[1]))];
  const existing = (await client.query('SELECT id,user_id,job_id FROM public.applications WHERE user_id=ANY($1::bigint[]) AND job_id=ANY($2::bigint[])', [users,jobs])).rows;
  const ids = new Map(existing.map(r=>[`${r.user_id}:${r.job_id}`, String(r.id)]));
  for (const spec of pending) {
    const id = ids.get(`${spec.values[0]}:${spec.values[1]}`);
    if (id) ledger[spec.key] = id;
  }
}
export async function withDataset(config, fn) {
  return withStateLock(config.stateDir, async () => {
    const client = await connectDatabase(config);
    try {
      const identity = await checkSchema(client);
      const file = path.join(config.stateDir, 'fixtures-v1.json');
      const stored = await readJson(file, null);
      const state = stored && JSON.stringify(stored.identity) === JSON.stringify(identity)
        ? stored : { version: 1, identity, records: {} };
      state.preservedMissing = 0;
      const before = await counts(client);
      const result = await transaction(client, () => fn(client, state));
      // Persist only a committed transaction. On a write failure report honestly.
      await writeJson(file, state);
      const after = await counts(client);
      return { ...result, before, after, added: Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-before[k]])), preservedMissing: state.preservedMissing };
    } finally { await client.end(); }
  });
}
export async function prepareDataset(config, scenario = 'base', indexCount = 100000) {
  if (!['base','nplusone','indexes'].includes(scenario)) throw new LabError('Неизвестный учебный набор.');
  if (!Number.isInteger(indexCount) || indexCount < 100 || indexCount > 200000) throw new LabError('Размер индексного набора: 100–200000.');
  const { faker } = await import('@faker-js/faker');
  faker.seed(scenario === 'indexes' ? 101 : scenario === 'nplusone' ? 777 : 42);
  faker.setDefaultRefDate(REF_DATE);
  return withDataset(config, async (client,state) => {
    const userCount = scenario === 'nplusone' ? 20 : 100;
    const userSpecs = Array.from({length:userCount}, (_,i) => ({
      key: `${scenario === 'nplusone' ? 'nplusone' : 'base'}:u:${i}`,
      values: [scenario === 'nplusone' ? `nplus-author-${i+1}@example.test` : `student${i+1}@example.com`, faker.person.fullName()],
    }));
    const users = await ensureFixtures(client,state,'users','email',['email','name'],userSpecs);
    const liveUsers = [...users.values()];
    if (!liveUsers.length) throw new LabError('Учебные пользователи удалены ранее. Подготовка не восстанавливает удалённое молча; используй отдельную свежую учебную БД.');
    const totalJobs = scenario === 'indexes' ? indexCount : scenario === 'nplusone' ? 100 : 1000;
    const jobSpecs = Array.from({length:totalJobs}, (_,i) => {
      const company = scenario === 'indexes'
        ? (i % 100 === 0 ? 'Lab Rare Index Co' : i % 5 !== 0 ? 'Lab Common Index Co' : companies[i%companies.length])
        : companies[i%companies.length];
      const title = `[LAB ${scenario} ${String(i+1).padStart(6,'0')}] ${i%4 === 0 ? 'Backend Developer' : faker.person.jobTitle()}`;
      // Matching timestamps deliberately exercise stable pagination with id tie-breaks.
      const date = new Date(Date.parse(REF_DATE) - Math.floor(i/5)*60000).toISOString();
      return {key:`${scenario}:j:${i}`,values:[title,company,String(liveUsers[i%liveUsers.length].id),date]};
    });
    const jobs = await ensureFixtures(client,state,'jobs','title',['title','company','created_by','created_at'],jobSpecs);
    if (scenario === 'base') {
      const liveJobs = [...jobs.values()];
      const pairs = new Set(); const apps = [];
      const add = (u,j,status) => {
        if (!u || !j) return;
        const key=`${u.id}:${j.id}`; if (pairs.has(key)) return;
        pairs.add(key); apps.push({key:`base:a:${key}`, values:[String(u.id),String(j.id),status,REF_DATE]});
      };
      // At least 12 applications on each of two jobs: HAVING >= 5 is observable.
      for (let i=0;i<12;i++) { add(liveUsers[i],liveJobs[0],'new'); add(liveUsers[i],liveJobs[1],'screening'); }
      for (let i=0;apps.length<300 && i<2000;i++) add(liveUsers[i%liveUsers.length],liveJobs[(i*7)%liveJobs.length],STATUSES[i%STATUSES.length]);
      await ensureApplications(client,state,apps);
    }
    if (scenario === 'indexes') await client.query('ANALYZE public.jobs');
    return { scenario, sampleJobs: [...jobs.values()].slice(0,2).map(j=>({id:String(j.id),title:j.title,company:j.company})), referenceDate: REF_DATE };
  });
}
export async function prepareOwnedData(config, owners, size = 30) {
  if (!Number.isInteger(size) || size < 1 || size > 1000) throw new LabError('Личный набор ограничен 1–1000 откликами на аккаунт.');
  return withDataset(config, async (client,state) => {
    const summary=[];
    for (const [index,owner] of owners.entries()) {
      const user=(await client.query('SELECT id,email FROM public.users WHERE id=$1 AND email=$2',[owner.id,owner.email])).rows[0];
      if (!user) throw new LabError('API и DATABASE_URL указывают на разные данные или аккаунт удалён. Подготовка остановлена.');
      const marker=`[LAB owner ${user.id}]`;
      const ownJobs=await ensureFixtures(client,state,'jobs','title',['title','company','created_by','created_at'],[
        {key:`owned:${user.id}:normal`,values:[`${marker} Backend Developer`,'Acme',String(user.id),REF_DATE]},
        {key:`owned:${user.id}:csv`,values:[`${marker} O'Reilly, "CSV"`,'Lab CSV, Co',String(user.id),REF_DATE]},
        {key:`owned:${user.id}:text`,values:[`${marker} <b>это текст</b>`,'=1+1',String(user.id),REF_DATE]},
      ]);
      const candidates=(await client.query('SELECT id FROM public.jobs ORDER BY id LIMIT $1',[size])).rows;
      const jobs=[...new Set([...ownJobs.values()].map(j=>String(j.id)).concat(candidates.map(j=>String(j.id))))].slice(0,size);
      const specs=jobs.map((id,i)=>({key:`owned:${user.id}:${id}`,values:[String(user.id),id,STATUSES[(i+index)%STATUSES.length],REF_DATE]}));
      await ensureApplications(client,state,specs);
      const total=(await client.query('SELECT count(*)::int AS n FROM public.applications WHERE user_id=$1',[String(user.id)])).rows[0].n;
      summary.push({email:user.email, id:String(user.id), applications:total});
    }
    return {scenario:'owned',owners:summary};
  });
}
