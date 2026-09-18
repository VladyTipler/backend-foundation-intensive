import { db } from '../../src/db.js';

const result = await db.query(
  `SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name`,
);

console.log('Database connection: OK');
console.log('Public tables:');

if (!result.rowCount) {
  console.log('- none yet (this is normal before Day 1 schema exercises)');
} else {
  for (const row of result.rows) console.log(`- ${row.table_name}`);
}

await db.end();
