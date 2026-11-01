// Phase 3 block rewrite acceptance. The server must already be running on 5420.
// Default mode uses the configured real adapter exactly once. --fake-failure expects
// a separately started server whose fixed adapter output fails the first real check.
// Source restoration always goes through /__ludi/undo; this script never writes source files.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const PREVIEW = resolve(HERE, '..');
const KIT = resolve(PREVIEW, '..');
const PORT = Number(process.env.LUDI_EDITOR_PORT || 5420);
if (PORT !== 5420) throw new Error(`run-blocks 只允许端口 5420，当前为 ${PORT}`);
const BASE_URL = 'http://127.0.0.1:5420';
const PROJECT = 'tianshu-device-ops';
const PAGE = 'projects/tianshu-device-ops/generated/DeviceListPage.tsx';
const PAGE_ABS = resolve(KIT, PAGE);
const OUT = resolve(PREVIEW, 'editor-dispatch/blocks-p3-shots-2026-10-04');
const fakeFailure = process.argv.includes('--fake-failure');
const unknownArgs = process.argv.slice(2).filter(arg => arg !== '--fake-failure');
if (unknownArgs.length) throw new Error(`未知参数：${unknownArgs.join(', ')}`);

mkdirSync(OUT, { recursive: true });
const stamp = `${Date.now()}-${fakeFailure ? 'fake-failure' : 'real'}`;
const logFile = resolve(OUT, `run-blocks-${stamp}.json`);
const records = [];
const browserErrors = [];
let sessionToken;
let activePatchId;
let terminalPatch;
let undoComplete = false;
let browser;
const postAttempts = { patch: 0, undo: 0 };
let outcome = 'failed';
let failureMessage;

const shaBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const snapshot = () => readFileSync(PAGE_ABS);
function save(extra = {}) {
  writeFileSync(logFile, JSON.stringify({
    status: outcome,
    mode: fakeFailure ? 'fake-failure' : 'real',
    baseUrl: BASE_URL,
    page: PAGE,
    uniqueBlockRequests: activePatchId ? 1 : 0,
    postAttempts,
    activePatchId,
    undoComplete,
    records,
    browserErrors,
    ...extra
  }, null, 2) + '\n');
}
function record(step, status, detail = {}) {
  records.push({ at: new Date().toISOString(), step, status, detail });
  console.log(`${status === 'pass' ? 'PASS' : status === 'blocked' ? 'BLOCKED' : 'FAIL'} ${step}`);
  save();
}
function check(step, ok, detail = {}) {
  record(step, ok ? 'pass' : 'fail', detail);
  if (!ok) throw new Error(`${step}: ${JSON.stringify(detail)}`);
}

async function api(method, path, body, timeoutMs = 30000) {
  const headers = { Accept: 'application/json', Origin: BASE_URL };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (sessionToken) headers['X-Ludi-Session'] = sessionToken;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); }
  catch { json = { ok: false, error: { code: 'INVALID_JSON', message: text.slice(0, 500) } }; }
  return { status: response.status, body: json };
}

async function bootstrap() {
  const response = await api('GET', '/__ludi/bootstrap');
  if (response.status !== 200 || !response.body?.ok) throw new Error(`bootstrap 不可用：HTTP ${response.status}`);
  sessionToken = response.body.data.sessionToken;
  return response.body.data;
}

async function submitOnceRecoverably(path, body) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    postAttempts[path === '/__ludi/patch' ? 'patch' : 'undo']++;
    try { return { ...(await api('POST', path, body)), recovered: false }; }
    catch (error) {
      lastError = error;
      try {
        const list = await api('GET', '/__ludi/patches');
        const found = list.body?.data?.find(patch => patch.requestId === body.requestId);
        if (found) return { status: 202, body: { ok: true, data: { patchId: found.id, status: found.status } }, recovered: true };
      } catch { /* Retrying the identical requestId cannot create a second model job. */ }
      if (attempt < 3) await sleep(1000);
    }
  }
  throw lastError;
}

async function pollPatch(id, timeoutMs = 15 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await api('GET', `/__ludi/patch/${id}`);
    if (response.status !== 200 || !response.body?.ok) throw new Error(`读取 Patch 失败：HTTP ${response.status}`);
    if (response.body.data.status !== 'checking') return response.body.data;
    await sleep(2500);
  }
  throw new Error(`Patch ${id} 在 ${timeoutMs}ms 内没有到终态`);
}

function progressPairs(patch) {
  return patch.progress?.map(item => `${item.step}:${item.status}`) ?? [];
}

async function undo(id, before) {
  await bootstrap();
  const request = { version: 1, projectId: PROJECT, requestId: randomUUID(), patchId: id };
  const accepted = await submitOnceRecoverably('/__ludi/undo', request);
  if (accepted.status !== 202 || !accepted.body?.ok) throw new Error(`撤销被拒绝：${JSON.stringify(accepted.body?.error)}`);
  const patch = await pollPatch(accepted.body.data.patchId);
  writeFileSync(resolve(OUT, `undo-${stamp}-${id}.json`), JSON.stringify(patch, null, 2) + '\n');
  const restored = snapshot().equals(before);
  if (patch.status !== 'checks-passed' || !restored) {
    throw new Error(`撤销终态异常：${JSON.stringify({ status: patch.status, restored })}`);
  }
  undoComplete = true;
  record('undo.bytes', 'pass', { patchId: id, sha256: shaBytes(before) });
  return patch;
}

async function bestEffortUndo(before) {
  if (!activePatchId || undoComplete || snapshot().equals(before)) return;
  try {
    const current = await api('GET', `/__ludi/patch/${activePatchId}`);
    terminalPatch = current.body?.data ?? terminalPatch;
    await undo(activePatchId, before);
  } catch (error) {
    record('finally.undo', 'fail', { message: error.message, bytesRestored: snapshot().equals(before) });
  }
}

async function verifyLivePage() {
  const require = createRequire(resolve(KIT, 'package.json'));
  const { chromium } = require('@playwright/test');
  browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 30000 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  const response = await page.goto(`${BASE_URL}/device-ops/devices`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.screenshot({ path: resolve(OUT, `blocks-${stamp}-written.png`), fullPage: true });
  check('page.open', Boolean(response?.ok()), { status: response?.status() });
  check('page.console', browserErrors.length === 0, { errors: browserErrors });
  await page.close();
}

async function main() {
  const before = snapshot();
  const boot = await bootstrap();
  check('bootstrap.project', boot.projectId === PROJECT, { projectId: boot.projectId, aiAvailable: boot.ai?.available });
  const request = {
    version: 1,
    projectId: PROJECT,
    requestId: randomUUID(),
    kind: 'block',
    expectedFiles: [{ file: PAGE, sha256: shaBytes(before) }],
    page: 'device-list',
    ops: [{ page: 'device-list', kind: 'replace', block: 'phase', template: 'notice-bar' }],
    route: '/devices'
  };
  const accepted = await submitOnceRecoverably('/__ludi/patch', request);
  activePatchId = accepted.body?.data?.patchId;
  check('block.accepted', accepted.status === 202
    && accepted.body?.ok
    && Boolean(activePatchId)
    && (accepted.recovered || accepted.body.data.status === 'checking'), {
    http: accepted.status,
    response: accepted.body
  });
  save({ request: { ...request, expectedFiles: request.expectedFiles } });
  terminalPatch = await pollPatch(activePatchId);
  writeFileSync(resolve(OUT, `patch-${stamp}-${activePatchId}.json`), JSON.stringify(terminalPatch, null, 2) + '\n');

  if (fakeFailure) {
    check('failure.status', terminalPatch.status === 'failed' && terminalPatch.autoReverted === true, {
      status: terminalPatch.status,
      autoReverted: terminalPatch.autoReverted,
      error: terminalPatch.error
    });
    check('failure.checks', terminalPatch.checks?.length === 4
      && terminalPatch.checks[0].status === 'failed'
      && terminalPatch.checks.slice(1).every(item => item.status === 'queued'), {
      checks: terminalPatch.checks?.map(item => ({ id: item.id, status: item.status, exitCode: item.exitCode }))
    });
    check('failure.progress', JSON.stringify(progressPairs(terminalPatch)) === JSON.stringify([
      'read:running', 'read:passed', 'ai:running', 'ai:passed',
      'validate:running', 'validate:passed', 'checks:running',
      'checks:failed', 'result:failed'
    ]), { progress: progressPairs(terminalPatch) });
    check('failure.bytes', snapshot().equals(before), { before: shaBytes(before), after: shaBytes(snapshot()) });
    const result = await api('GET', `/__ludi/block-result/${activePatchId}`);
    check('failure.block-result', result.status === 500
      && result.body?.error?.code === 'CHECK_FAILED'
      && result.body?.error?.details?.patchId === activePatchId, {
      http: result.status,
      error: result.body?.error
    });
    outcome = 'passed';
    return;
  }

  check('rewrite.checks', terminalPatch.status === 'checks-passed'
    && terminalPatch.checks?.length === 4
    && terminalPatch.checks.every(item => item.status === 'passed' && item.exitCode === 0), {
    status: terminalPatch.status,
    checks: terminalPatch.checks?.map(item => ({ id: item.id, status: item.status, exitCode: item.exitCode })),
    error: terminalPatch.error
  });
  check('rewrite.progress', JSON.stringify(progressPairs(terminalPatch)) === JSON.stringify([
    'read:running', 'read:passed', 'ai:running', 'ai:passed',
    'validate:running', 'validate:passed', 'checks:running',
    'checks:passed', 'result:passed'
  ]), { progress: progressPairs(terminalPatch) });
  await verifyLivePage();
  await undo(activePatchId, before);
  outcome = 'passed';
}

const beforeRun = snapshot();
try {
  await main();
} catch (error) {
  failureMessage = error?.stack ?? String(error);
  outcome = fakeFailure ? 'failed' : 'blocked';
  record('run.terminal', outcome, { message: error.message });
} finally {
  await bestEffortUndo(beforeRun);
  await browser?.close();
  const bytesRestored = snapshot().equals(beforeRun);
  if (!bytesRestored) outcome = 'failed';
  save({
    status: outcome,
    failureMessage,
    bytesRestored,
    terminalPatch: terminalPatch ? {
      id: terminalPatch.id,
      status: terminalPatch.status,
      error: terminalPatch.error,
      autoReverted: terminalPatch.autoReverted
    } : undefined
  });
  console.log(outcome === 'passed' ? 'BLOCKS-PASS' : outcome === 'blocked' ? 'BLOCKS-BLOCKED' : 'BLOCKS-FAIL');
  process.exitCode = outcome === 'passed' ? 0 : outcome === 'blocked' ? 2 : 1;
}
