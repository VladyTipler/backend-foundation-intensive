import 'dotenv/config';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Copy .env.example to .env first.');
}

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});
