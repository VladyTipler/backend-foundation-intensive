import { db } from '../../src/db.js';

if (!process.argv.includes('--yes')) {
  console.error('❌ Refusing destructive reset.');
  console.error('Run: npm run db:reset -- --yes');
  process.exit(1);
}

await db.query('DROP SCHEMA public CASCADE');
await db.query('CREATE SCHEMA public');

console.log('✅ public schema recreated.');
console.log('Now recreate your course tables/migrations yourself.');

await db.end();
