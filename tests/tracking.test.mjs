import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { createLookup, ConfigurationError, DocumentError } from '../lib/tracking.mjs';
import { createHandler } from '../api/tracking.mjs';
const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const secret = 'test-only-stable-secret-never-a-production-key';
async function database(path) {
  const db = new PGlite(path);
  await db.exec(schema);
  return {db, lookup: createLookup(async (text, params) => (await db.query(text, params)).rows, secret)};
}

test('Postgres preserves exact dates across formatted queries and database restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tracking-pg-'));
  let db;
  try {
    let setup = await database(dir);db=setup.db;
    const first = await setup.lookup('529.982.247-25');
    assert.equal(first.firstSeenAt - first.startedAt, 7200000);
    const rows = (await db.query('SELECT * FROM tracking_records')).rows;
    assert.equal(rows.length, 1);
    assert.match(rows[0].document_key, /^[a-f0-9]{64}$/);
    assert(!JSON.stringify(rows).includes('52998224725'));
    await db.close();db=null;
    setup = await database(dir);db=setup.db;
    const second = await setup.lookup('52998224725');
    assert.equal(second.startedAt, first.startedAt);
    assert.equal(second.firstSeenAt, first.firstSeenAt);
    assert(second.serverNow >= first.serverNow);
  } finally {if(db)await db.close();await rm(dir,{recursive:true,force:true});}
});

test('SQL conflict preserves one initial date for simultaneous first visits; different CNPJ gets separate record', async () => {
  const {db,lookup} = await database();
  try {
    const records = await Promise.all(Array.from({length:8},()=>lookup('52998224725')));
    assert.equal(new Set(records.map(r=>r.startedAt)).size,1);
    await lookup('11.222.333/0001-81');
    assert.equal((await db.query('SELECT count(*) AS count FROM tracking_records')).rows[0].count,2);
  } finally {await db.close();}
});

test('Invalid documents are rejected without a query; changing the HMAC key cannot restart history', async () => {
  const {db,lookup} = await database();
  try {
    const failIfQueried = createLookup(()=>{throw Error('Should not query');},secret);
    for (const value of ['11111111111','52998224724','11222333000182',null,'invalid']) {
      await assert.rejects(failIfQueried(value),DocumentError);
    }
    const initial=await lookup('52998224725');
    const changed=createLookup(async (q,p)=>(await db.query(q,p)).rows,'different-secret-at-least-thirty-two-characters');
    await assert.rejects(changed('52998224725'), ConfigurationError);
    assert.equal((await db.query('SELECT count(*) AS count FROM tracking_records')).rows[0].count,1);
    assert.equal((await lookup('52998224725')).startedAt,initial.startedAt);
  } finally {await db.close();}
});

test('HTTP contract for Vercel handler, validation, no-store and sanitized errors', async () => {
  const {db,lookup} = await database();
  const server=createServer(createHandler(lookup));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  try {
    const post=body=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const response=await post({document:'52998224725'});
    assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/no-store/);
    const initial=await response.json();
    assert.equal((await (await post({document:'529.982.247-25'})).json()).startedAt,initial.startedAt);
    assert.equal((await post({document:'bad'})).status,400);
    assert.equal((await fetch(url)).status,405);
    assert.equal((await fetch(url,{method:'POST',body:'not json'})).status,415);
    assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  } finally {await new Promise(resolve=>server.close(resolve));await db.close();}
  const broken=createServer(createHandler(()=>{throw Error('postgres://do-not-expose-secret')}));
  await new Promise(resolve=>broken.listen(0,'127.0.0.1',resolve));
  try {
    const res=await fetch(`http://127.0.0.1:${broken.address().port}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({document:'52998224725'})});
    assert.equal(res.status,503);
    assert(!(await res.text()).includes('do-not-expose-secret'));
  } finally {await new Promise(resolve=>broken.close(resolve));}
});

test('Preparsed Vercel request body is accepted', async()=>{
 const {db,lookup}=await database();
 try {
   let status,body;
   const res={setHeader(){},set statusCode(value){status=value},end(value){body=JSON.parse(value)}};
   await createHandler(lookup)({method:'POST',headers:{'content-type':'application/json'},body:{document:'52998224725'}},res);
   assert.equal(status,200);assert.equal(body.firstSeenAt-body.startedAt,7200000);
 } finally {await db.close();}
});

test('Missing Vercel variables and missing schema return actionable codes without secrets', async () => {
  const {neonQuery} = await import('../lib/neon.mjs');
  assert.throws(()=>neonQuery({}), error=>error.code==='DATABASE_URL_MISSING');
  assert.throws(()=>neonQuery({DATABASE_URL:'not-a-connection'}), error=>error.code==='DATABASE_URL_INVALID');
  assert.throws(()=>createLookup(()=>{},undefined),error=>error.code==='HASH_SECRET_MISSING');
  for (const [error, code] of [
    [new ConfigurationError('private detail','HASH_SECRET_MISSING'),'HASH_SECRET_MISSING'],
    [Object.assign(new Error('postgres://do-not-expose-secret'),{code:'42P01'}),'DATABASE_TABLES_MISSING'],
    [Object.assign(new Error('private password'),{code:'28P01'}),'DATABASE_AUTH_FAILED']
  ]) {
    let status,body;
    const res={setHeader(){},set statusCode(v){status=v},end(v){body=JSON.parse(v)}};
    await createHandler(()=>{throw error})({method:'POST',headers:{'content-type':'application/json'},body:{document:'52998224725'}},res);
    assert.equal(status,503);assert.equal(body.code,code);
    assert(!JSON.stringify(body).includes(error.message));
  }
});
