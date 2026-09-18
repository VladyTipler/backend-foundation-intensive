import 'dotenv/config';
import express from 'express';
import { db } from './db.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get('/health', async (_req, res) => {
  const result = await db.query('SELECT now() AS database_time');
  res.json({
    status: 'ok',
    databaseTime: result.rows[0].database_time,
  });
});

const server = app.listen(port, () => {
  console.log(`API started on http://localhost:${port}`);
});

process.on('SIGTERM', async () => {
  server.close();
  await db.end();
});
