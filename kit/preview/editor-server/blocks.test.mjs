import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { EditorService, BASE, hash, middleware } from './service.mjs';

const kitRoot = fileURLToPath(new URL('../..', import.meta.url));
const tempRoot = mkdtempSync(resolve(tmpdir(), 'agent-blocks-test-'));
console.log(`TEMP_ROOT=${tempRoot}`);

const PROJECT = 'tianshu-device-ops';
const PAGE = `${BASE}/generated/DeviceListPage.tsx`;
const CHECK_IDS = ['preview.tsc', 'kit.antd:lint:projects', 'kit.check:antd', 'browser.edge-smoke'];
const payload = { version: 1, projectId: PROJECT };
const operation = { page: 'device-list', kind: 'replace', block: 'phase', template: 'notice-bar' };
let fixtureId = 0;

function copy(root, file) {
  const target = resolve(root, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(kitRoot, file), target);
}

async function passingChecks(patch, save) {
  patch.checks = CHECK_IDS.map(id => ({ id, status: 'queued' }));
  save();
  for (const check of patch.checks) {
    Object.assign(check, { status: 'passed', exitCode: 0, stdout: 'unit-test check double', stderr: '' });
    save();
  }
  return true;
}

async function failingChecks(patch, save) {
  patch.checks = CHECK_IDS.map(id => ({ id, status: 'queued' }));
  save();
  Object.assign(patch.checks[0], { status: 'running', startedAt: new Date().toISOString() });
  save();
  Object.assign(patch.checks[0], {
    status: 'failed',
    exitCode: 2,
    stdout: '',
    stderr: 'Cannot find name missingBlockRewriteSymbol',
    endedAt: new Date().toISOString()
  });
  save();
  return false;
}

function fixture({ ai, runChecks = passingChecks } = {}) {
  const root = resolve(tempRoot, String(fixtureId++));
  mkdirSync(root, { recursive: true });
  for (const file of [
    PAGE,
    `${BASE}/pages.json`,
    `${BASE}/data.ts`,
    `${BASE}/business-context.json`
  ]) copy(root, file);
  return { root, service: new EditorService({ root, runChecks, ai }) };
}

function changed(source, line = '// block rewrite from the unit-test adapter') {
  const anchor = 'export function DeviceListPage() {';
  assert.ok(source.includes(anchor), 'fixture page keeps the expected export anchor');
  return source.replace(anchor, `${anchor}\n  ${line}`);
}

function request(service, override = {}) {
  return {
    ...payload,
    requestId: randomUUID(),
    kind: 'block',
    expectedFiles: [{ file: PAGE, sha256: hash(service.read(PAGE)) }],
    page: 'device-list',
    ops: [operation],
    route: '/devices',
    ...override
  };
}

function events(patch) {
  return patch.progress.map(({ step, status }) => `${step}:${status}`);
}

async function getThroughMiddleware(service, url) {
  const req = Readable.from([]);
  Object.assign(req, {
    url,
    method: 'GET',
    headers: { host: '127.0.0.1:5420', origin: 'http://127.0.0.1:5420' },
    socket: { remoteAddress: '127.0.0.1' }
  });
  const res = {
    statusCode: 200,
    setHeader() {},
    end(chunk) { res.body = JSON.parse(chunk); }
  };
  await middleware(service, 5420)(req, res, () => assert.fail('API request unexpectedly reached next()'));
  return { status: res.statusCode, body: res.body };
}

test('block request is dispatched from registered page, block, template and route only', async () => {
  let call;
  const { service } = fixture({
    ai: async input => {
      call = input;
      return changed(service.read(PAGE).toString('utf8'));
    }
  });
  const before = service.read(PAGE);
  const accepted = service.patch(request(service));
  assert.deepEqual(Object.keys(accepted).sort(), ['files', 'patchId', 'rules', 'status']);
  assert.equal(accepted.status, 'checking');
  assert.deepEqual(accepted.files, []);
  assert.deepEqual(accepted.rules, []);
  await service.completion;
  assert.equal(call.mode, 'rewrite');
  assert.match(call.prompt, /替换为「提示条」/);
  assert.match(call.prompt, /页面源码全文/);

  const invalid = request(service, {
    requestId: randomUUID(),
    expectedFiles: [{ file: PAGE, sha256: hash(service.read(PAGE)) }],
    ops: [{ ...operation, block: 'not-registered' }]
  });
  assert.throws(() => service.patch(invalid), error => error.code === 'BAD_REQUEST');
  assert.notDeepEqual(service.read(PAGE), before, 'the accepted fake rewrite remains until its explicit undo');
});

test('illegal AI output leaves bytes unchanged; patch remains readable while block-result returns 422', async () => {
  const { service } = fixture({
    ai: async () => changed(service.read(PAGE).toString('utf8'), 'fetch("/not-allowed");')
  });
  const before = service.read(PAGE);
  const accepted = service.patch(request(service));
  await service.completion;
  assert.deepEqual(service.read(PAGE), before);

  const patch = service.get(accepted.patchId);
  assert.equal(patch.status, 'failed');
  assert.equal(patch.error.code, 'RULE_FAILED');
  assert.equal(patch.error.http, 422);
  assert.match(patch.error.message, /危险写法|网络请求/);
  assert.deepEqual(events(patch), [
    'read:running', 'read:passed', 'ai:running', 'ai:passed',
    'validate:running', 'validate:failed', 'result:failed'
  ]);

  const progressResult = await getThroughMiddleware(service, `/__ludi/patch/${accepted.patchId}`);
  assert.equal(progressResult.status, 200);
  assert.equal(progressResult.body.ok, true);
  assert.equal(progressResult.body.data.error.code, 'RULE_FAILED');
  assert.deepEqual(events(progressResult.body.data), events(patch));

  const terminalResult = await getThroughMiddleware(service, `/__ludi/block-result/${accepted.patchId}`);
  assert.equal(terminalResult.status, 422);
  assert.equal(terminalResult.body.ok, false);
  assert.equal(terminalResult.body.error.code, 'RULE_FAILED');
  assert.equal(terminalResult.body.error.details.patchId, accepted.patchId);
});

test('successful block rewrite exposes real event order and undo restores exact bytes', async () => {
  const { service } = fixture({
    ai: async () => changed(service.read(PAGE).toString('utf8'))
  });
  const before = service.read(PAGE);
  const accepted = service.patch(request(service));
  await service.completion;

  const written = service.get(accepted.patchId);
  assert.equal(written.status, 'checks-passed');
  assert.equal(written.checks.length, 4);
  assert.ok(written.checks.every(check => check.status === 'passed'));
  assert.deepEqual(events(written), [
    'read:running', 'read:passed', 'ai:running', 'ai:passed',
    'validate:running', 'validate:passed', 'checks:running',
    'checks:passed', 'result:passed'
  ]);
  assert.notDeepEqual(service.read(PAGE), before);

  const undone = service.undo({ ...payload, requestId: randomUUID(), patchId: accepted.patchId });
  await service.completion;
  assert.equal(service.get(undone.patchId).status, 'checks-passed');
  assert.equal(service.get(undone.patchId).undoOf, accepted.patchId);
  assert.equal(service.get(accepted.patchId).status, 'undone');
  assert.deepEqual(service.read(PAGE), before);
});

test('failed first check stops the remaining checks and auto-restores exact bytes', async () => {
  const { service } = fixture({
    ai: async () => changed(service.read(PAGE).toString('utf8'), 'void missingBlockRewriteSymbol;'),
    runChecks: failingChecks
  });
  const before = service.read(PAGE);
  const accepted = service.patch(request(service));
  await service.completion;

  const patch = service.get(accepted.patchId);
  assert.equal(patch.status, 'failed');
  assert.equal(patch.autoReverted, true);
  assert.equal(patch.error.code, 'CHECK_FAILED');
  assert.equal(patch.error.http, 500);
  assert.equal(patch.checks.length, 4);
  assert.equal(patch.checks[0].status, 'failed');
  assert.ok(patch.checks.slice(1).every(check => check.status === 'queued'));
  assert.deepEqual(events(patch), [
    'read:running', 'read:passed', 'ai:running', 'ai:passed',
    'validate:running', 'validate:passed', 'checks:running',
    'checks:failed', 'result:failed'
  ]);
  assert.deepEqual(service.read(PAGE), before);
});

test('cancelling a signal-ignoring AI waits for its return, writes nothing and records cancellation order', async () => {
  let release;
  const { service } = fixture({
    ai: async () => new Promise(resolveAI => { release = resolveAI; })
  });
  const before = service.read(PAGE);
  const accepted = service.patch(request(service));
  assert.equal(typeof release, 'function');
  assert.deepEqual(service.cancel({ ...payload, patchId: accepted.patchId }), {
    patchId: accepted.patchId,
    cancelling: true
  });
  release(changed(before.toString('utf8')));
  await service.completion;

  const patch = service.get(accepted.patchId);
  assert.equal(patch.status, 'cancelled');
  assert.equal(patch.error.code, 'CANCELLED');
  assert.equal(patch.error.http, 200);
  assert.deepEqual(events(patch), [
    'read:running', 'read:passed', 'ai:running', 'ai:cancelled', 'result:cancelled'
  ]);
  assert.deepEqual(service.read(PAGE), before);
});


test('instance-level block ops are validated and spelled out for the AI (2026-10-05 owner review)', async () => {
  let call;
  const { service } = fixture({
    ai: async input => {
      call = input;
      return changed(service.read(PAGE).toString('utf8'));
    }
  });
  // 「新增同类」副本是独立实例：副本可单独删除/替换，且提示必须向 AI 说明作用域。
  const ops = [
    { page: 'device-list', kind: 'add', block: 'filter', instance: 'filter' },
    { page: 'device-list', kind: 'delete', block: 'filter', instance: 'filter#c1' },
    { page: 'device-list', kind: 'replace', block: 'phase', instance: 'phase', template: 'notice-bar' }
  ];
  const accepted = service.patch(request(service, { ops }));
  assert.equal(accepted.status, 'checking');
  await service.completion;
  assert.match(call.prompt, /新增同类/);
  assert.match(call.prompt, /删除（该副本）/);

  // 非法实例标识（含空格）一律拒绝，文件字节不变。
  const before = service.read(PAGE);
  const invalid = request(service, {
    requestId: randomUUID(),
    expectedFiles: [{ file: PAGE, sha256: hash(service.read(PAGE)) }],
    ops: [{ page: 'device-list', kind: 'delete', block: 'filter', instance: 'evil id' }]
  });
  assert.throws(() => service.patch(invalid), /区块实例标识无效/);
  assert.deepEqual(service.read(PAGE), before);
});

test('block advice cache key follows operation and preview state; prompts target the chosen operation', async () => {
  const sentences = [];
  const { service } = fixture({
    ai: async input => {
      sentences.push(input.prompt);
      return `建议 ${sentences.length} 号`;
    }
  });
  const base = { ...payload, page: 'device-list', block: 'filter', state: {} };
  const first = await service.blockAdvice({ ...base, operation: 'delete' });
  assert.equal(first.sentence, '建议 1 号');
  assert.equal(first.cached, false);
  // 同一操作同一状态命中缓存，不再调用 AI。
  assert.deepEqual(await service.blockAdvice({ ...base, operation: 'delete' }), { sentence: '建议 1 号', cached: true });
  // 换操作：必须重新调用，且提示围绕该操作（替换不再问“该不该删”）。
  const replaced = await service.blockAdvice({ ...base, operation: 'replace', state: { activeTemplate: 'notice-bar' } });
  assert.equal(replaced.sentence, '建议 2 号');
  assert.match(sentences[1], /换成另一个模板/);
  assert.match(sentences[1], /提示条|notice-bar/);
  assert.doesNotMatch(sentences[1], /该不该删/);
  // 换预览模板或换目标实例都会重新生成；按副本分别缓存。
  assert.equal((await service.blockAdvice({ ...base, operation: 'replace', state: { activeTemplate: 'blank-card' } })).sentence, '建议 3 号');
  assert.equal((await service.blockAdvice({ ...base, operation: 'replace', state: { activeTemplate: 'notice-bar', instance: 'filter#c1' } })).sentence, '建议 4 号');
  assert.deepEqual(await service.blockAdvice({ ...base, operation: 'replace', state: { activeTemplate: 'notice-bar' } }), { sentence: '建议 2 号', cached: true });
  // state 的未登记字段被拒。
  await assert.rejects(service.blockAdvice({ ...base, operation: 'delete', state: { evil: 1 } }), /state/);
});
