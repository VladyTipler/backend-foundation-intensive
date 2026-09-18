import { faker } from '@faker-js/faker';
import { db } from '../../../src/db.js';
import { assertSchema, closeDb } from '../../lib/schema.js';
import { insertRows } from '../../lib/seed-utils.js';

faker.seed(777);

const ok = await assertSchema([
  { table: 'users', columns: ['id', 'email', 'name'] },
  { table: 'jobs', columns: ['id', 'title', 'company', 'created_by', 'created_at'] },
]);

if (!ok) {
  await closeDb();
  process.exit(1);
}

await db.query('TRUNCATE jobs, users RESTART IDENTITY CASCADE');

const users = Array.from({ length: 20 }, (_, i) => [
  `author-${i + 1}@example.com`,
  faker.person.fullName(),
]);

await insertRows('users', ['email', 'name'], users);
const jobs = Array.from({ length: 100 }, (_, i) => [
  faker.person.jobTitle(),
  ['Acme', 'Globex', 'Initech'][i % 3],
  (i % 20) + 1,
  faker.date.recent({ days: 30 }),
]);

await insertRows('jobs', ['title', 'company', 'created_by', 'created_at'], jobs);

console.log('✅ N+1 scenario ready: 20 authors, 100 jobs.');
console.log('Load jobs + authors through your ORM with query logging enabled.');
await closeDb();
