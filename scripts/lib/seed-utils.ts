import { db } from '../../src/db.js';

export async function insertRows(
  table: string,
  columns: string[],
  rows: unknown[][],
  batchSize = 1000,
) {
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: unknown[] = [];

    const placeholders = batch.map((row, rowIndex) => {
      const parts = row.map((value, colIndex) => {
        values.push(value);
        return `$${rowIndex * columns.length + colIndex + 1}`;
      });
      return `(${parts.join(', ')})`;
    });

    const cols = columns.map((c) => `"${c}"`).join(', ');
    await db.query(
      `INSERT INTO "${table}" (${cols}) VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
}

export function pick<T>(items: T[], index: number) {
  return items[index % items.length];
}
