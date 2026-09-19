import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { LabError } from './config.mjs';

export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw new LabError(`Не удалось прочитать локальное состояние ${path.basename(file)}. Сохрани файл и проверь его; автоматического сброса нет.`);
  }
}
export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  try { await rename(temporary, file); }
  finally { await unlink(temporary).catch(() => {}); }
}
export async function onlyNew(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, content, { flag: 'wx', mode: 0o600 }); return true; }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
}
export async function withStateLock(dir, fn) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lockFile = path.join(dir, 'prepare.lock');
  let lock;
  try { lock = await open(lockFile, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new LabError('Другая подготовка уже запущена (prepare.lock). После аварии сначала проверь, что она завершилась; файл блокировки автоматически не удаляем.');
    throw error;
  }
  try { await lock.writeFile(`PID=${process.pid}\n`); return await fn(); }
  finally { await lock.close(); await unlink(lockFile).catch(() => {}); }
}
