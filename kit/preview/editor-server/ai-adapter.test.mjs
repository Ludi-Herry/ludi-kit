import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiStatus, runAI } from './ai-adapter.mjs';

const directory=dirname(fileURLToPath(import.meta.url));
const fake=resolve(directory,'fake-ai.mjs');
const fixture=fileURLToPath(import.meta.url);
const keys=['LUDI_AI_CMD','LUDI_AI_FIXTURE','LUDI_AI_FAKE_DELAY_MS','LUDI_AI_TIMEOUT_MS','LUDI_AI_KEEP_TEMP'];

async function withEnvironment(values,run) {
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  for(const key of keys) {
    const value=values[key];
    if(value===undefined)delete process.env[key];else process.env[key]=String(value);
  }
  try { return await run(); }
  finally {
    for(const key of keys) {
      const value=previous[key];
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
}

const fakeEnvironment=overrides=>({
  LUDI_AI_CMD:JSON.stringify([process.execPath,fake]),
  LUDI_AI_FIXTURE:fixture,
  LUDI_AI_TIMEOUT_MS:'5000',
  LUDI_AI_KEEP_TEMP:'1',
  ...overrides
});

test('fake adapter returns the preset file through stdin-safe argv execution',async()=>{
  await withEnvironment(fakeEnvironment(),async()=>{
    assert.deepEqual(aiStatus(),{available:true});
    const output=await runAI({prompt:'rewrite <Panel /> & echo must-not-run',mode:'rewrite'});
    assert.equal(output,readFileSync(fixture,'utf8'));
  });
});

test('unavailable and failed CLIs expose stable codes and retained stderr',async()=>{
  const missing=resolve(directory,'definitely-missing-ai-command');
  await withEnvironment(fakeEnvironment({LUDI_AI_CMD:JSON.stringify([missing])}),async()=>{
    const status=aiStatus();assert.equal(status.available,false);assert.match(status.reason,/找不到 AI CLI/);
    await assert.rejects(runAI({prompt:'x'}),error=>error.code==='AI_UNAVAILABLE'&&error.stderr==='');
  });
  await withEnvironment(fakeEnvironment({LUDI_AI_FIXTURE:undefined}),async()=>{
    await assert.rejects(runAI({prompt:'x'}),error=>error.code==='AI_FAILED'&&/LUDI_AI_FIXTURE is required/.test(error.stderr));
  });
  if(process.platform==='win32') {
    const nodeDirectory=dirname(process.execPath),shim=resolve(nodeDirectory,'npm.cmd'),extensionless=resolve(nodeDirectory,'npm');
    assert.ok(existsSync(shim)&&existsSync(extensionless),'Windows Node install should include npm and npm.cmd shims');
    await withEnvironment(fakeEnvironment({LUDI_AI_CMD:JSON.stringify([shim,'--version'])}),async()=>assert.deepEqual(aiStatus(),{available:true}));
    await withEnvironment(fakeEnvironment({LUDI_AI_CMD:JSON.stringify([extensionless,'--version'])}),async()=>{
      assert.match(await runAI({prompt:'ignored by npm --version'}),/^\d+\.\d+\.\d+/);
    });
    for(const argument of ['x&whoami','%PATH%','line\r\nbreak','!COMSPEC!','inner"quote','x|more','x^y','x<input','x>output']) {
      await withEnvironment(fakeEnvironment({LUDI_AI_CMD:JSON.stringify([shim,argument])}),async()=>{
        const status=aiStatus();assert.equal(status.available,false);assert.match(status.reason,/不安全字符/);
      });
    }
  }
});

test('timeout and caller cancellation terminate the delayed fake process',async()=>{
  await withEnvironment(fakeEnvironment({LUDI_AI_FAKE_DELAY_MS:'5000',LUDI_AI_TIMEOUT_MS:'25'}),async()=>{
    const started=Date.now();
    await assert.rejects(runAI({prompt:'timeout'}),error=>error.code==='AI_TIMEOUT');
    assert.ok(Date.now()-started<2000,'timeout must stop the child instead of waiting for its 5s delay');
  });
  await withEnvironment(fakeEnvironment({LUDI_AI_FAKE_DELAY_MS:'5000'}),async()=>{
    const started=Date.now();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30);
    try { await assert.rejects(runAI({prompt:'cancel',signal:controller.signal}),error=>error.code==='CANCELLED'); }
    finally { clearTimeout(timer); }
    assert.ok(Date.now()-started<2000,'cancellation must stop the child instead of waiting for its 5s delay');
  });
});
