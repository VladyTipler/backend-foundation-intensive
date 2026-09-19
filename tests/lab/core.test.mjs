import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { validateDatabase, validateHttp, LabError, safeError } from '../../scripts/lab/config.mjs';
import { readJson, writeJson, onlyNew, withStateLock } from '../../scripts/lab/state.mjs';
import { LocalSession, ensureAccounts, enqueueExamples } from '../../scripts/lab/api-client.mjs';
import { prepareDataset, prepareOwnedData, REF_DATE } from '../../scripts/lab/datasets.mjs';
import { connectDatabase, checkSchema } from '../../scripts/lab/database.mjs';

const env={NODE_ENV:'test'};
test('DB guard only accepts local, explicitly named course databases',()=>{
  assert.equal(validateDatabase('postgres://app:secret@127.0.0.1:15432/job_tracker',env).hostname,'127.0.0.1');
  for(const url of ['postgres://x:secret@db.example/job_tracker','postgres://x@localhost/production','postgres://x@localhost/job_tracker?host=evil.example','postgres://x@localhost.evil.example/job_tracker','https://localhost/job_tracker']) {
    assert.throws(()=>validateDatabase(url,env),LabError);
  }
  assert.throws(()=>validateDatabase('postgres://x@localhost/job_tracker',{NODE_ENV:'production'}),LabError);
});
test('API endpoints cannot escape the local machine',()=>{
  assert.equal(validateHttp('http://127.0.0.1:3000'),'http://127.0.0.1:3000');
  for(const url of ['https://api.example.test','http://localhost:3000/api','http://user:secret@localhost','file:///tmp/a']) assert.throws(()=>validateHttp(url),LabError);
});
test('Errors do not reflect raw credentials or backend body',()=>{
  assert.ok(!safeError(new Error('postgres://root:my-real-password@x/db')).includes('my-real-password'));
  assert.match(safeError({code:'23503'}),/ключом/);
});
test('Local ledger updates are atomic; templates do not overwrite student notes',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'jt-state-'));
  try {
    const file=path.join(dir,'state.json');await writeJson(file,{a:1});await writeJson(file,{a:2});assert.deepEqual(await readJson(file,null),{a:2});
    const notes=path.join(dir,'notes.md');assert.equal(await onlyNew(notes,'first'),true);assert.equal(await onlyNew(notes,'second'),false);assert.equal(await readFile(notes,'utf8'),'first');
    await withStateLock(dir,()=>assert.rejects(withStateLock(dir,async()=>{}),/уже запущена/));
    await withStateLock(dir,async()=>{});
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('Corrupt local state is not silently replaced',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'jt-corrupt-'));
  try {const file=path.join(dir,'state.json');await writeFile(file,'broken');await assert.rejects(readJson(file,{}),LabError);assert.equal(await readFile(file,'utf8'),'broken');}
  finally {await rm(dir,{recursive:true,force:true});}
});
async function testApi(fn) {
  const records={users:new Map(),sessions:new Map(),exports:new Map(),requests:[]};let counter=0;
  const server=createServer(async(req,res)=>{
    let text='';for await(const chunk of req) text+=chunk;
    let body;try{body=text?JSON.parse(text):undefined;}catch{body=undefined;}
    records.requests.push({path:req.url,method:req.method,csrf:req.headers['x-csrf-token'],origin:req.headers.origin});
    let sid=(req.headers.cookie||'').match(/(?:^|; )sid=([^;]+)/)?.[1];
    if(!records.sessions.has(sid)) {sid=String(++counter);records.sessions.set(sid,{});res.setHeader('Set-Cookie',`sid=${sid}; HttpOnly; Path=/`);}
    const state=records.sessions.get(sid);
    const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
    if(req.url==='/auth/csrf') return send(200,{csrfToken:`csrf-${sid}`});
    if(req.method==='POST' && (req.headers['x-csrf-token']!==`csrf-${sid}` || req.headers.origin!=='http://127.0.0.1:5173')) return send(403,{error:'csrf'});
    if(req.url==='/auth/register') {
      if(records.users.has(body.email)) return send(409,{});
      const u={id:String(records.users.size+101),email:body.email,name:body.name,password:body.password};records.users.set(u.email,u);state.user=u;
      return send(201,{user:{id:u.id,email:u.email,name:u.name}});
    }
    if(req.url==='/auth/login') {
      const u=records.users.get(body.email);if(!u || u.password!==body.password) return send(401,{});state.user=u;return send(200,{user:{id:u.id,email:u.email,name:u.name}});
    }
    if(req.url==='/auth/me') return send(state.user?200:401,state.user?{user:{id:state.user.id,email:state.user.email,name:state.user.name}}:{});
    if(req.url==='/exports') {
      if(!state.user) return send(401,{});const key=`${state.user.id}:${req.headers['idempotency-key']}`;
      if(!records.exports.has(key)) records.exports.set(key,{id:String(records.exports.size+1),status:'queued'});
      return send(202,{export:records.exports.get(key)});
    }
    if(req.url==='/redirect') {res.statusCode=302;res.setHeader('Location','http://external.example.test');return res.end();}
    return send(404,{});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const dir=await mkdtemp(path.join(os.tmpdir(),'jt-api-'));
  try {await fn({api:`http://127.0.0.1:${server.address().port}`,origin:'http://127.0.0.1:5173',stateDir:dir},records);}
  finally {server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
}
test('Test accounts use actual register/login/CSRF; repeated preparation preserves passwords',async()=>{
  await testApi(async(config,records)=>{
    const first=await ensureAccounts(config);assert.equal(first.users.length,2);
    const before=await readFile(first.file,'utf8');
    const second=await ensureAccounts(config);assert.deepEqual(second.users,first.users);assert.equal(records.users.size,2);
    assert.equal(await readFile(first.file,'utf8'),before);
    assert.ok(records.requests.filter(r=>r.method==='POST').every(r=>r.csrf && r.origin===config.origin));
  });
});
test('Exports go through API and reuse persisted idempotency keys, no fake completed rows',async()=>{
  await testApi(async(config,records)=>{
    const first=await enqueueExamples(config,3);assert.deepEqual(await enqueueExamples(config,3),first);assert.equal(records.exports.size,3);
    assert.ok([...records.exports.values()].every(e=>e.status==='queued'));
  });
});
test('Helper refuses HTTP redirects rather than send cookie/credentials elsewhere',async()=>{
  await testApi(async(config)=>{await assert.rejects(new LocalSession(config.api,config.origin).request('/redirect'),LabError);});
});
test('Missing API prerequisites fail explicitly; password hashes are not fabricated',async()=>{
  await testApi(async(config)=>{
    const bad=new LocalSession(config.api,config.origin);bad.request=async()=>({status:404,data:{}});
    await assert.rejects(bad.write('/auth/register',{}),/Сначала реализуй/);
  });
});

const testUrl=process.env.LAB_TEST_DATABASE_URL;
test('PostgreSQL: additive data, constraints, rollback, real IDs and no lost student work', {skip:!testUrl},async()=>{
  const url=validateDatabase(testUrl,env);
  assert.equal(url.pathname,'/job_tracker_lab_test','Use ONLY the disposable helper test database');
  assert.equal(process.env.LAB_ALLOW_TEST_RESET,'YES','Explicit opt-in for resetting the disposable test schema');
  const dir=await mkdtemp(path.join(os.tmpdir(),'jt-db-'));
  const config={database:url.href,stateDir:dir};const client=await connectDatabase(config);
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await assert.rejects(checkSchema(client),/Сначала создай структуру/);
    await client.query(await readFile(new URL('./fixture.sql',import.meta.url),'utf8'));
    const first=await prepareDataset(config);assert.deepEqual(first.after,{users:100,jobs:1000,applications:300});
    assert.ok(BigInt(first.sampleJobs[0].id)>=1001n);
    const row=(await client.query('SELECT created_at FROM jobs ORDER BY id LIMIT 1')).rows[0];assert.equal(row.created_at.toISOString(),REF_DATE);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM (SELECT job_id FROM applications GROUP BY job_id HAVING count(*)>=12) t')).rows[0].n,2);
    assert.deepEqual((await prepareDataset(config)).added,{users:0,jobs:0,applications:0});
    await client.query("UPDATE jobs SET title='Student edit' WHERE id=$1",[first.sampleJobs[0].id]);
    await client.query("UPDATE applications SET status='offer' WHERE id=(SELECT min(id) FROM applications)");
    const deleted=(await client.query('DELETE FROM applications WHERE id=(SELECT max(id) FROM applications) RETURNING id')).rows[0].id;
    await client.query("INSERT INTO users(email,name) VALUES('mine@example.test','My account')");
    const repeat=await prepareDataset(config);assert.deepEqual(repeat.added,{users:0,jobs:0,applications:0});
    assert.equal((await client.query('SELECT title FROM jobs WHERE id=$1',[first.sampleJobs[0].id])).rows[0].title,'Student edit');
    assert.equal((await client.query('SELECT 1 FROM applications WHERE id=$1',[deleted])).rowCount,0);
    await client.query("ALTER TABLE jobs ADD CONSTRAINT block_test CHECK (title NOT LIKE '[LAB nplusone%')");
    await assert.rejects(prepareDataset(config,'nplusone'));
    assert.equal((await client.query("SELECT count(*)::int AS n FROM users WHERE email LIKE 'nplus-author-%'")).rows[0].n,0,'Failed seeding rolled back new authors');
    await client.query('ALTER TABLE jobs DROP CONSTRAINT block_test');
    const n1=await prepareDataset(config,'nplusone');assert.deepEqual(n1.added,{users:20,jobs:100,applications:0});
    assert.deepEqual((await prepareDataset(config,'nplusone')).added,{users:0,jobs:0,applications:0});
    const owner=(await client.query("SELECT id::text,email FROM users WHERE email='mine@example.test'")).rows[0];
    const owned=await prepareOwnedData(config,[owner],30);assert.equal(owned.owners[0].applications,30);
    assert.deepEqual((await prepareOwnedData(config,[owner],30)).added,{users:0,jobs:0,applications:0});
    await client.query('ALTER TABLE users ADD COLUMN password_hash text; ALTER TABLE jobs ADD COLUMN salary integer');
    assert.deepEqual((await prepareDataset(config)).added,{users:0,jobs:0,applications:0});
    const idx=await prepareDataset(config,'indexes',100000);assert.equal(idx.added.jobs,100000);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM jobs WHERE company='Lab Rare Index Co'")).rows[0].n,1000);
    assert.deepEqual((await prepareDataset(config,'indexes',100000)).added,{users:0,jobs:0,applications:0});
  } finally {await client.end();await rm(dir,{recursive:true,force:true});}
});
