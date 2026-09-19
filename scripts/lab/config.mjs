import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export class LabError extends Error {
  constructor(message) { super(message); this.name = 'LabError'; }
}
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
export function validateDatabase(value, env = process.env) {
  if (env.NODE_ENV === 'production') throw new LabError('Подготовка запрещена при NODE_ENV=production.');
  let url;
  try { url = new URL(value); } catch { throw new LabError('Нужен DATABASE_URL из локального .env. Сначала пункт 0.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !localHosts.has(url.hostname)) {
    throw new LabError('Подготовка разрешена только для PostgreSQL на localhost/127.0.0.1/::1. Удалённые адреса не поддерживаются.');
  }
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!['job_tracker', 'job_tracker_migration_test'].includes(name) && !/^job_tracker_lab_[a-z0-9_]+$/.test(name)) {
    throw new LabError('Отказ: имя БД должно быть job_tracker, job_tracker_migration_test или job_tracker_lab_*. Не используй рабочую БД.');
  }
  // libpq URL options can override a host and must not bypass the loopback guard.
  if (url.search || url.hash) throw new LabError('DATABASE_URL с query-параметрами не поддерживается учебным помощником.');
  return url;
}
export function validateHttp(value) {
  let url;
  try { url = new URL(value); } catch { throw new LabError('Некорректный локальный адрес API/Origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !localHosts.has(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new LabError('LAB_API_URL и LAB_ORIGIN должны быть локальными HTTP-origin без пути, пароля и query.');
  }
  return url.origin;
}
export function settings() {
  const database = validateDatabase(process.env.DATABASE_URL);
  const api = validateHttp(process.env.LAB_API_URL || 'http://127.0.0.1:3000');
  const origin = validateHttp(process.env.LAB_ORIGIN || 'http://127.0.0.1:5173');
  const label = `${database.hostname}:${database.port || 5432}/${database.pathname.slice(1)}`;
  const scope = createHash('sha256').update(`${database.username}@${label}`).digest('hex').slice(0, 16);
  return { database: database.href, api, origin, label, scope, stateDir: path.join(ROOT, 'var', 'lab', scope) };
}
export function safeError(error) {
  if (error instanceof LabError) return error.message;
  const codes = {
    ECONNREFUSED: 'Нет подключения. Проверь Docker, порт и адрес в .env.',
    ENOTFOUND: 'Адрес сервиса не найден.',
    '28P01': 'PostgreSQL отклонил пароль. Проверь настройки; помощник не меняет пароль БД.',
    '3D000': 'Учебная БД не существует. Проверь шаг 0.',
    '23502': 'INSERT отклонён: обязательная колонка без значения. Сверь схему с контрактом данных.',
    '23503': 'INSERT отклонён внешним ключом. Проверь связи и существование родителей.',
    '23505': 'Конфликт уникальности. Данные не перезаписаны.',
    '23514': 'CHECK не пропустил учебное значение. Сверь допустимые статусы.',
    '42501': 'Недостаточно прав PostgreSQL. Помощник не меняет права автоматически.',
    '55P03': 'БД занята другим изменением; повтори позже.',
    '57014': 'Превышено время SQL. Операция отменена; проверь нагрузку и блокировки.',
    ENOSPC: 'На диске закончилось место.',
  };
  return codes[error?.code] || 'Подготовка остановлена. Проверь доступность зависимостей и учебную схему. Секреты и сырой ответ сервера не выводятся.';
}
