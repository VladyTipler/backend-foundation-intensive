import { db } from '../../src/db.js';

const preferredOrder = [
  'user_roles',
  'applications',
  'saved_jobs',
  'jobs',
  'companies',
  'profiles',
  'users',
  'roles',
];

const existing = await db.query(
  `SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
);

const names = new Set(existing.rows.map((row) => row.table_name));
const targets = preferredOrder.filter((name) => names.has(name));

if (!targets.length) {
  console.log('Nothing to clean: no known course tables exist yet.');
} else {
  const quoted = targets.map((name) => `"${name}"`).join(', ');
  await db.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  console.log(`✅ Cleaned: ${targets.join(', ')}`);
}

await db.end();
