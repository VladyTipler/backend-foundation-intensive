import { faker } from '@faker-js/faker';
import { db } from '../../src/db.js';
import { assertSchema, closeDb } from '../lib/schema.js';
import { insertRows } from '../lib/seed-utils.js';

faker.seed(42);

const ok = await assertSchema([
  { table: 'users', columns: ['id', 'email', 'name'] },
  { table: 'jobs', columns: ['id', 'title', 'company', 'created_by', 'created_at'] },
  { table: 'applications', columns: ['id', 'user_id', 'job_id', 'status', 'created_at'] },
]);

if (!ok) {
  await closeDb();
  process.exit(1);
}

await db.query('TRUNCATE applications, jobs, users RESTART IDENTITY CASCADE');

const users = Array.from({ length: 100 }, (_, i) => [
  `student${i + 1}@example.com`,
  faker.person.fullName(),
]);

await insertRows('users', ['email', 'name'], users);

const companies = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Wayne Labs', 'Stark Industries'];
const jobs = Array.from({ length: 1000 }, (_, i) => [
  faker.person.jobTitle(),
  companies[i % companies.length],
  (i % 100) + 1,
  faker.date.recent({ days: 180 }),
]);

await insertRows('jobs', ['title', 'company', 'created_by', 'created_at'], jobs);

const statuses = ['new', 'screening', 'interview', 'offer', 'rejected'];
const applications = Array.from({ length: 300 }, (_, i) => [
  (i % 100) + 1,
  (i * 7 % 1000) + 1,
  statuses[i % statuses.length],
  faker.date.recent({ days: 120 }),
]);

await insertRows('applications', ['user_id', 'job_id', 'status', 'created_at'], applications);

console.log('✅ Base dataset ready: 100 users, 1000 jobs, 300 applications.');
await closeDb();
