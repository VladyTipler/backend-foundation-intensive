import { copyFile, mkdir, open, access, constants, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT, LabError } from './config.mjs';
import { onlyNew } from './state.mjs';

export async function initializeFiles() {
  try { await copyFile(path.join(ROOT,'.env.example'),path.join(ROOT,'.env'),constants.COPYFILE_EXCL); }
  catch(error) { if(error.code!=='EEXIST') throw error; }
  for(const dir of ['var/lab','var/labs','var/exports']) await mkdir(path.join(ROOT,dir),{recursive:true,mode:0o700});
}
export async function prepareStreamFile() {
  const file=path.join(ROOT,'var/labs/large.csv');
  await mkdir(path.dirname(file),{recursive:true});
  try { await access(file); return {path:'var/labs/large.csv',created:false}; }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const stream=createWriteStream(file,{flags:'wx',mode:0o600});
  const done=finished(stream); done.catch(()=>{});
  try {
    stream.write('id,title\n');
    const chunk='1,Backend Developer\n'.repeat(1000);
    for(let i=0;i<1000;i++) if(!stream.write(chunk)) await once(stream,'drain');
    stream.end(); await done;
  } catch(error) { stream.destroy(); await done.catch(()=>{}); throw error; }
  return {path:'var/labs/large.csv',created:true,bytes:20000009};
}
export async function reportTemplate(day) {
  const file=path.join(ROOT,`docs/day-${day}-results.md`);
  await onlyNew(file,`# День ${day} — мои результаты\n\n## Что реализовал самостоятельно\n\n## Чем проверил (SQL, HTTP, логи, тесты)\n\n## Один отказ: причина, наблюдение, исправление\n\n## Как объясню на интервью\n\n## Что ещё не сделано\n\nНе добавляй сюда пароли, cookie, токены и DATABASE_URL. Подготовленные данные не доказывают выполнение задания.\n`);
}
export function run(command,args=[],capture=false) {
  return new Promise((resolve,reject)=>{
    // npm.cmd needs cmd.exe on Windows. Arguments below come only from fixed menu actions.
    const isNpm=command==='npm' && process.platform==='win32';
    const executable=isNpm ? process.env.ComSpec || 'cmd.exe' : command;
    const actualArgs=isNpm ? ['/d','/s','/c','npm',...args] : args;
    const child=spawn(executable,actualArgs,{cwd:ROOT,shell:false,stdio:capture?['ignore','pipe','pipe']:'inherit',windowsHide:capture});
    let text='';
    if(capture) {
      child.stdout.on('data',part=>{text=(text+part.toString()).slice(-10000);});
      child.stderr.on('data',()=>{});
    }
    child.on('error',()=>reject(new LabError(`Не удалось запустить ${command}. Проверь установку программы.`)));
    child.on('close',code=>code===0?resolve(text.trim()):reject(new LabError(`${command} завершилась с ошибкой. Проверь вывод; другие программы не останавливаем.`)));
  });
}
export async function ensureDependencies() {
  try { await access(path.join(ROOT,'node_modules/pg/package.json')); await access(path.join(ROOT,'node_modules/@faker-js/faker/package.json')); }
  catch { throw new LabError('Зависимости ещё не установлены. Выбери I в меню: он запустит npm ci по lock-файлам.'); }
}
export async function doctor() {
  const result=[{name:'Node.js',ok:Number(process.versions.node.split('.')[0])>=24,detail:process.version}];
  for(const [name,command,args] of [['Git','git',['--version']],['Docker Compose','docker',['compose','version']],['Docker daemon','docker',['info','--format','{{.ServerVersion}}']]]) {
    try { result.push({name,ok:true,detail:await run(command,args,true)}); }
    catch { result.push({name,ok:false,detail:'Не найдено / не запущено. Установи или запусти по Дню 0.'}); }
  }
  for(const item of ['.env','node_modules/pg/package.json','web/node_modules/react/package.json']) {
    try { await access(path.join(ROOT,item)); result.push({name:item,ok:true}); }
    catch { result.push({name:item,ok:false}); }
  }
  return result;
}
export async function checkStudentArtifacts(day) {
  const paths=day>=5 ? ['src/data-source.ts','src/workers/export.worker.ts','Dockerfile'] : day>=4 ? ['src/workers/export.worker.ts'] : [];
  const found=[];
  for(const file of paths) {
    try { await access(path.join(ROOT,file));found.push({file,exists:true}); }
    catch { found.push({file,exists:false}); }
  }
  return found;
}
