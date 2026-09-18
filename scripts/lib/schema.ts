import { db } from '../../src/db.js';

export type TableSpec = {
  table: string;
  columns: string[];
};

export async function assertSchema(specs: TableSpec[]) {
  const missing: string[] = [];

  for (const spec of specs) {
    const tableResult = await db.query(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists`,
      [spec.table],
    );

    if (!tableResult.rows[0].exists) {
      missing.push(`table: ${spec.table}`);
      continue;
    }

    const columns = await db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [spec.table],
    );

    const existing = new Set(columns.rows.map((row) => row.column_name));
    for (const column of spec.columns) {
      if (!existing.has(column)) missing.push(`${spec.table}.${column}`);
    }
  }

  if (missing.length) {
    console.error('\n❌ Database schema is not ready for this exercise.\n');
    for (const item of missing) console.error(`  - missing ${item}`);
    console.error('\nCreate the required tables/columns yourself, then run the seeder again.\n');
    process.exitCode = 1;
    return false;
  }

  return true;
}

export async function closeDb() {
  await db.end();
}
