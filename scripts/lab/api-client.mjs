import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { LabError, validateHttp } from './config.mjs';
import { readJson, writeJson, withStateLock } from './state.mjs';

export class LocalSession {
  constructor(base, origin) {
    this.base=validateHttp(base); this.origin=validateHttp(origin); this.cookies=new Map();
  }
  async request(route, method='GET', body, headers={}) {
    if (!route.startsWith('/') || route.startsWith('//')) throw new LabError('Недопустимый путь API.');
    let response;
    try {
      response=await fetch(`${this.base}${route}`, {
        method, redirect:'error', signal:AbortSignal.timeout(10000),
        headers:{Accept:'application/json',Origin:this.origin,...(body === undefined ? {} : {'Content-Type':'application/json'}),
          ...(this.cookies.size ? {Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')} : {}),...headers},
        body:body === undefined ? undefined : JSON.stringify(body),
      });
      for (const raw of response.headers.getSetCookie()) {
        const first=raw.split(';',1)[0]; const cut=first.indexOf('=');
        if (cut < 1) continue;
        const name=first.slice(0,cut), value=first.slice(cut+1);
        if (/max-age\s*=\s*0/i.test(raw) || !value) this.cookies.delete(name);
        else this.cookies.set(name,value);
      }
      const reader=response.body?.getReader(); const parts=[]; let bytes=0;
      if (reader) while (true) {
        const chunk=await reader.read(); if(chunk.done) break;
        bytes+=chunk.value.length;
        if(bytes>262144) { await reader.cancel(); throw new LabError('Слишком большой ответ локального API. Подготовка остановлена.'); }
        parts.push(Buffer.from(chunk.value));
      }
      let data;
      try { data=JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { data=undefined; }
      return {status:response.status,data};
    } catch(error) {
      if(error instanceof LabError) throw error;
      throw new LabError('Локальный API не ответил или вернул перенаправление. Запусти свою реализацию. После timeout запись могла сохраниться: повтор использует те же данные/ключ.');
    }
  }
  async write(route,body,headers={}) {
    const csrf=await this.request('/auth/csrf');
    if(csrf.status!==200 || typeof csrf.data?.csrfToken!=='string' || !csrf.data.csrfToken) {
      throw new LabError(`Сначала реализуй GET /auth/csrf из Дня 3 (получен HTTP ${csrf.status}). Ожидается поле csrfToken и сессионная cookie. Защиту помощник не обходит.`);
    }
    return this.request(route,'POST',body,{'X-CSRF-Token':csrf.data.csrfToken,...headers});
  }
}
function userFrom(result,email) {
  const user=result.data?.user;
  const id=user?.id;
  if (![200,201].includes(result.status) || !user || user.email!==email ||
      !(typeof id==='string' && /^[1-9][0-9]*$/.test(id) || typeof id==='number' && Number.isSafeInteger(id) && id>0)) {
    throw new LabError(`Аккаунт не подготовлен: HTTP ${result.status}. Проверь register/login, сессию, CSRF/Origin и API-контракт. Существующий пароль не меняется.`);
  }
  return {id:String(id),email:user.email};
}
async function ensureAccountsUnlocked(config, sessionFactory=(c)=>new LocalSession(c.api,c.origin)) {
  const file=path.join(config.stateDir,'accounts.private.json');
  let state=await readJson(file,null);
  if(!state) {
    const tag=randomBytes(5).toString('hex');
    state={version:1,accounts:['a','b'].map(letter=>({
      name:`Учебный пользователь ${letter.toUpperCase()}`,
      email:`lab-${letter}-${tag}@example.test`,password:`Lab-${randomBytes(24).toString('base64url')}9!`,
    })),exports:[]};
    // Save BEFORE register: a lost response must not make us lose the credential.
    await writeJson(file,state);
  }
  const sessions=[]; const users=[];
  for(const account of state.accounts) {
    const session=sessionFactory(config);
    let result;
    if(account.id) result=await session.write('/auth/login',{email:account.email,password:account.password});
    else {
      result=await session.write('/auth/register',{name:account.name,email:account.email,password:account.password});
      if(result.status===409) result=await session.write('/auth/login',{email:account.email,password:account.password});
    }
    const user=userFrom(result,account.email);
    const me=await session.request('/auth/me');
    if(userFrom(me,account.email).id!==user.id) throw new LabError('После входа /auth/me вернул другого пользователя. Проверь сессии.');
    account.id=user.id;
    users.push(user); sessions.push(session);
    await writeJson(file,state);
  }
  return {users,sessions,state,file};
}
async function enqueueExamplesUnlocked(config, number=3) {
  if(!Number.isInteger(number)||number<1||number>5) throw new LabError('Можно подготовить от 1 до 5 экспортов за запуск.');
  const {sessions,state,file}=await ensureAccountsUnlocked(config);
  // Reuse the SAME keys on every retry; a lost 202 must not create a second job.
  for(let i=0;i<number;i++) {
    let item=state.exports[i];
    if(!item) { item={key:`lab-${randomUUID()}`};state.exports[i]=item;await writeJson(file,state); }
    const result=await sessions[0].write('/exports',{format:'csv'},{'Idempotency-Key':item.key});
    const id=result.data?.export?.id;
    if(result.status!==202 || !id || !/^[1-9][0-9]*$/.test(String(id))) {
      throw new LabError(`POST /exports: HTTP ${result.status}. Сначала реализуй маршрут Дня 4. Ключ повторной попытки сохранён; completed не подставляется.`);
    }
    if(item.id && item.id!==String(id)) throw new LabError('Один Idempotency-Key вернул разные export ID. Исправь идемпотентность API.');
    item.id=String(id); await writeJson(file,state);
  }
  return state.exports.slice(0,number).map(e=>({id:e.id}));
}
export async function readTraffic(config, count=20) {
  if(!Number.isInteger(count)||count<1||count>100) throw new LabError('Ограничение: 1–100 последовательных GET.');
  const session=new LocalSession(config.api,config.origin), result=[];
  for(let i=0;i<count;i++) {
    const start=performance.now(); const response=await session.request('/jobs?page=1&limit=10&sort=created_at_desc');
    result.push({status:response.status,milliseconds:Math.round(performance.now()-start)});
    await new Promise(r=>setTimeout(r,150));
  }
  return result;
}

// Serialize credential/idempotency ledger writes without blocking unrelated fixture files.
export async function ensureAccounts(config, sessionFactory) {
  return withStateLock(path.join(config.stateDir, 'auth-lock'), () => ensureAccountsUnlocked(config, sessionFactory));
}
export async function enqueueExamples(config, number = 3) {
  return withStateLock(path.join(config.stateDir, 'auth-lock'), () => enqueueExamplesUnlocked(config, number));
}
