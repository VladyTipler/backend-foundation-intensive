#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, LabError, settings, safeError } from './config.mjs';
import { initializeFiles, prepareStreamFile, reportTemplate, doctor, run, ensureDependencies, checkStudentArtifacts } from './files.mjs';
import { readJson, writeJson } from './state.mjs';

export const DAYS = [
  'Окружение: настройки и диагностика',
  'PostgreSQL: данные для SQL, JOIN и HAVING',
  'Node.js: данные CRUD, N+1 и файл для streams',
  'HTTP/Auth: два настоящих учебных аккаунта и личные отклики',
  'Очереди: отклики для CSV, проверка worker и пробные экспорты',
  'Docker: сохранённые данные и отдельная пустая БД миграций',
  'Мониторинг: набор для проверок доступа и генератор запросов',
  'Финал: та же история двух пользователей, без сброса',
  'Бонус NestJS: тот же API-контракт и данные',
];
function loadLocalEnv() {
  try { loadEnvFile(path.join(ROOT,'.env')); }
  catch(error) { if(error.code!=='ENOENT') throw new LabError('Не удалось прочитать .env.'); }
}
function printDataset(result) {
  console.log(`Добавлено: users=${result.added.users}, jobs=${result.added.jobs}, applications=${result.added.applications}.`);
  console.log(`Всего в БД: users=${result.after.users}, jobs=${result.after.jobs}, applications=${result.after.applications}.`);
  for(const job of result.sampleJobs || []) console.log(`  Пример: job ID=${job.id}, ${job.title}, ${job.company}`);
  for(const owner of result.owners || []) console.log(`  ${owner.email}: user ID=${owner.id}, личных откликов=${owner.applications}`);
  if(result.preservedMissing) console.log('Ранее удалённые учебные записи не восстановлены. Изменения ученика сохраняем.');
}
export async function prepareDay(day) {
  if(!Number.isInteger(day)||day<0||day>8) throw new LabError('День должен быть от 0 до 8.');
  await initializeFiles(); loadLocalEnv(); await reportTemplate(day);
  console.log(`\nДень ${day}: ${DAYS[day]}`);
  if(day===0) {
    for(const check of await doctor()) console.log(`${check.ok?'OK':'НУЖНО'} — ${check.name}${check.detail?`: ${check.detail}`:''}`);
    try {
      await ensureDependencies(); const config=settings(); const {connectDatabase}=await import('./database.mjs');
      const client=await connectDatabase(config);
      try { await client.query('SELECT now()');console.log(`PostgreSQL доступен: ${config.label}. Пустые таблицы на Дне 0 нормальны.`); }
      finally { await client.end(); }
    } catch(error) { console.log(`Далее: ${safeError(error)}`); }
    console.log('I устанавливает зависимости. U запускает инфраструктуру. API и frontend запускаются отдельно по Дню 0.');
    return;
  }
  await ensureDependencies(); const config=settings();
  console.log(`Только локальная учебная БД: ${config.label}. Данные не удаляем, миграции не применяем.`);
  const {prepareDataset,prepareOwnedData}=await import('./datasets.mjs');
  printDataset(await prepareDataset(config,'base'));
  if(day===2) {
    const file=await prepareStreamFile(); console.log(`Файл для stream-практики: ${file.path} (${file.created?'создан':'уже есть, не перезаписан'}).`);
    console.log('N в меню — отдельные 20 авторов и 100 вакансий N+1. Считай SQL-запросы своим кодом, не HTTP в браузере.');
  }
  if(day>=3) {
    const {ensureAccounts}=await import('./api-client.mjs');
    const accounts=await ensureAccounts(config);
    printDataset(await prepareOwnedData(config,accounts.users,day===3?30:250));
    console.log(`Два аккаунта созданы/проверены через ТВОИ register/login/CSRF. Пароли: ${path.relative(ROOT,accounts.file)} (не коммитить). C — показать данные входа на своём экране.`);
    console.log('Другие аккаунты, их пароли, статусы откликов и результаты экспортов не менялись.');
  }
  for(const artifact of await checkStudentArtifacts(day)) console.log(`${artifact.exists?'НАЙДЕН':'ЕЩЁ НУЖНО НАПИСАТЬ'}: ${artifact.file}`);
  if(day===4) console.log('E — поставить до трёх настоящих экспортов через /exports. Сам worker и маршруты сначала реализуй по уроку.');
  if(day===5) console.log('M — создать отдельную пустую БД для проверки ТВОИХ миграций. Она не содержит решения задания.');
  if(day===6) console.log('T — выполнить 20 настоящих GET для твоих метрик; E — задания для наблюдения очереди. Метрики/alerts сам помощник не реализует.');
  if(day>=7) console.log('Данные подготовлены, но проверка безопасности/надёжности не засчитана автоматически. Пройди финальный checklist.');
  console.log(`Готова подготовка данных. Отчёт: docs/day-${day}-results.md. Это не отметка о прохождении дня.`);
}
async function migrationDatabase() {
  await ensureDependencies(); const config=settings(); const {connectDatabase}=await import('./database.mjs');
  const client=await connectDatabase(config);
  try {
    const name='job_tracker_lab_migrations';
    const exists=(await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount;
    if(!exists) await client.query('CREATE DATABASE job_tracker_lab_migrations');
    console.log(`${name}: ${exists?'уже существует, ничего не изменено':'создана пустая БД'}.`);
    console.log('Таблицы/миграции не созданы. Подставь имя этой БД в отдельное подключение и проверь свою историю миграций. Основную .env не меняем.');
  } finally { await client.end(); }
}
async function action(name,args=[]) {
  if(name==='prepare') return prepareDay(Number(args[0]));
  if(name==='doctor') { for(const c of await doctor()) console.log(`${c.ok?'OK':'НУЖНО'} ${c.name}: ${c.detail||''}`); return; }
  if(name==='install') {
    await run('npm',['ci']); await run('npm',['--prefix','web','ci']); console.log('Зависимости установлены по обоим lock-файлам.'); return;
  }
  if(name==='up') {
    await initializeFiles(); loadLocalEnv();settings();
    await run('docker',['compose','up','-d','--wait','postgres','redis','adminer']);return;
  }
  if(name==='migration-db') return migrationDatabase();
  if(name==='stream') { console.log(await prepareStreamFile());return; }
  if(name==='credentials') {
    const config=settings(); const file=path.join(config.stateDir,'accounts.private.json');const state=await readJson(file,null);
    if(!state) throw new LabError('Сначала подготовь День 3 после реализации регистрации. Готовых паролей до этого нет.');
    console.log('Только учебные пароли. Не показывай экран на стриме и не отправляй их в Git.');
    for(const a of state.accounts) console.log(`${a.name}: ${a.email}\n  пароль: ${a.password}`);return;
  }
  await ensureDependencies();const config=settings();
  if(['indexes','nplusone'].includes(name)) {
    const {prepareDataset}=await import('./datasets.mjs');printDataset(await prepareDataset(config,name));
    if(name==='indexes') console.log("Индексный сценарий: company = 'Lab Rare Index Co' (1%) / 'Lab Common Index Co' (80% нового набора). Индексы помощник не создаёт. Смотри фактическую долю во всей таблице.");
    return;
  }
  if(name==='exports') {
    const {enqueueExamples}=await import('./api-client.mjs');
    console.log('Бизнес-ID экспортов:',await enqueueExamples(config));
    console.log('Открой «Экспорт» и проверь ID. Повтор E использует те же ключи; новый экспорт создавай кнопкой UI.');return;
  }
  if(name==='traffic') {
    const {readTraffic}=await import('./api-client.mjs');const responses=await readTraffic(config);
    console.table(responses); await writeJson(path.join(config.stateDir,'http-observations.json'),responses);
    console.log('Это отдельные измерения HTTP, не нагрузочный тест production и не подставные метрики.');return;
  }
  throw new LabError('Неизвестное действие. Запусти npm run lab для меню.');
}
export async function main(args=process.argv.slice(2)) {
  process.chdir(ROOT);loadLocalEnv();
  if(Number(process.versions.node.split('.')[0])<24) throw new LabError('Для лаборатории нужен Node.js 24+. Установка описана в Дне 0.');
  if(args[0]==='--help') {
    console.log('npm run lab — интерактивное меню. Автоматизация: prepare 0..8 | doctor | indexes | nplusone | stream | exports | traffic | migration-db.');return;
  }
  if(args.length) return action(args[0],args.slice(1));
  if(!stdin.isTTY) throw new LabError('Для меню нужен интерактивный терминал. Можно вызвать: npm run lab -- prepare 1');
  const rl=createInterface({input:stdin,output:stdout});
  try {
    while(true) {
      console.log('\n=== Job Tracker · подготовка практики ===');
      DAYS.forEach((title,i)=>console.log(`${i}. ${title}`));
      console.log('I. Установить зависимости   U. Запустить PostgreSQL/Redis/Adminer\nD. Диагностика   N. Набор N+1   X. 100000 вакансий для индексов\nM. Пустая БД миграций   E. Три экспорта через API   T. 20 GET для метрик\nC. Показать учебные данные входа   Q. Выход');
      const answer=(await rl.question('Выбери пункт: ')).trim().toLowerCase();
      if(answer==='q') break;
      const command=/^[0-8]$/.test(answer)?['prepare',answer]:{
        i:['install'],u:['up'],d:['doctor'],n:['nplusone'],x:['indexes'],m:['migration-db'],e:['exports'],t:['traffic'],c:['credentials'],
      }[answer];
      if(!command) { console.log('Выбери номер или букву из меню.');continue; }
      if(!['doctor'].includes(command[0])) {
        console.log('Подготовка меняет только учебные данные/файлы или запускает выбранные инструменты. Схему за тебя не создаёт.');
        if(!['0','i','u'].includes(answer)) { try { const c=settings();console.log(`БД: ${c.label}; API: ${c.api}`); } catch(error) { console.log(safeError(error));continue; } }
        const yes=(await rl.question('Продолжить? [y/да]: ')).trim().toLowerCase();
        if(!['y','yes','да','д'].includes(yes)) continue;
      }
      try { await action(command[0],command.slice(1)); }
      catch(error) { console.error(`\nНЕ ЗАВЕРШЕНО: ${safeError(error)}`); }
    }
  } finally { rl.close(); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{ console.error(`НЕ ЗАВЕРШЕНО: ${safeError(error)}`);process.exitCode=1; });
}
