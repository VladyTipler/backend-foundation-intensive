import { faker } from '@faker-js/faker';
import { db } from '../../src/db.js';
import { assertSchema, closeDb } from '../lib/schema.js';
import { insertRows } from '../lib/seed-utils.js';

faker.seed(101);

const ok = await assertSchema([
  { table: 'users', columns: ['id', 'email', 'name'] },
  { table: 'jobs', columns: ['id', 'title', 'company', 'created_by', 'created_at'] },
]);

if (!ok) {
  await closeDb();
  process.exit(1);
}

await db.query('TRUNCATE jobs, users RESTART IDENTITY CASCADE');

const userCount = 5000;
const jobCount = 200000;

const users = Array.from({ length: userCount }, (_, i) => [
  `index-user-${i + 1}@example.com`,
  faker.person.fullName(),
]);

await insertRows('users', ['email', 'name'], users, 1000);
const companies = [
  'Google',
  'Acme',
  'Globex',
  'Initech',
  'Umbrella',
  'Wayne Labs',
  'Stark Industries',
  'Soylent',
];

const jobs = Array.from({ length: jobCount }, (_, i) => [
  faker.person.jobTitle(),
  i < 2000 ? 'Google' : companies[(i % (companies.length - 1)) + 1],
  (i % userCount) + 1,
  faker.date.recent({ days: 365 }),
]);

await insertRows('jobs', ['title', 'company', 'created_by', 'created_at'], jobs, 1000);

console.log(`✅ Index dataset ready: ${userCount} users, ${jobCount} jobs.`);
console.log('Google rows: 2000 (~1%). Good for comparing Seq Scan vs Index Scan.');
await closeDb();
