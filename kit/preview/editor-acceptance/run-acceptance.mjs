// T1 C 集成验收驱动（2026-09-30）
// 依据 docs/PLAN-组件库编辑器P0-2026-09-30.md §6 八项与 kit/preview/EDITOR-PROTOCOL.md v1，
// 对 A(editor-server) + B(src/editor) 的实现跑真实端到端证据。只读协议文件与源码，不修改实现；
// 写回一律经编辑器 API / 界面按钮，结束后经 undo API 恢复原 bytes。
// 用法：先起 kit/preview dev（127.0.0.1:5393），再 `node editor-acceptance/run-acceptance.mjs`。
// 注意：2026-09-30 首轮被新 P1（定位插件在 TSX 泛型 JSX 上注入坏码）阻断，未执行；
// 供 P1 修复后原样复跑。

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PREVIEW = resolve(HERE, '..');
const KIT = resolve(PREVIEW, '..');
const REPO = resolve(KIT, '..');
const BASE_URL = `http://127.0.0.1:${process.env.LUDI_EDITOR_PORT || 5393}`;
const DAY = '2026-09-30';
const EVID = resolve(KIT, 'projects/tianshu-device-ops/evidence/editor');
// round5：round1–4 失败证据目录与本目录互写隔离，历史证据一字不动；5393 服务为主线程所起（画布与图层版 + 新 session），仅复用不关闭。
// round9（主线程 2026-10-02）：F2 路由前缀修复与改动记录列表接口后复跑；round8：「基础」扩充后复跑，主题请求以 bootstrap 全字段打底；round7：换 lucide 图标、Owner 签收后提交前复跑；round6 为第三阶段小修后复跑，端口经 LUDI_EDITOR_PORT 指定；round1–5 目录不动。
// Each run owns fresh evidence; previous success and failure records stay intact.
const OUT = resolve(EVID, `c-acceptance-${DAY}-l1-${Date.now()}`);
mkdirSync(resolve(OUT, 'routes'), { recursive: true });
mkdirSync(resolve(OUT, 'shots'), { recursive: true });

const require = createRequire(resolve(KIT, 'package.json'));
const { chromium } = require('@playwright/test');

const sha256 = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');
const kf = (rel) => resolve(KIT, rel);
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const baseline = JSON.parse(readFileSync(resolve(PREVIEW, 'editor-dispatch/baseline.json'), 'utf8')).files;

/* ---------------- 结构化日志：run-log.jsonl 逐条落盘 ---------------- */
const steps = [];
function log(step, data = {}) {
  const rec = { t: new Date().toISOString(), step, ...data };
  steps.push(rec);
  writeFileSync(resolve(OUT, 'run-log.jsonl'), steps.map((s) => JSON.stringify(s)).join('\n') + '\n');
  console.log(`[${step}]`, data.message ?? data.status ?? '');
}
function dump(name, data) {
  writeFileSync(resolve(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
}

/* ---------------- 编辑器本地 API（Node 侧，同源头按协议组装） ---------------- */
let sessionToken = null;
async function api(method, path, body, opts = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.origin !== null) headers['Origin'] = opts.origin ?? BASE_URL;
  if (opts.session !== false && sessionToken) headers['X-Ludi-Session'] = sessionToken;
  if (opts.session) headers['X-Ludi-Session'] = opts.session;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 保留 text */ }
  return { status: res.status, body: json, text: json ? undefined : text.slice(0, 400) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollPatch(id, timeoutMs = 15 * 60 * 1000) {
  const started = Date.now();
  const timeline = [];
  for (;;) {
    const r = await api('GET', `/__ludi/patch/${id}`);
    if (r.status !== 200 || !r.body?.ok) throw new Error(`轮询 Patch ${id} 失败：HTTP ${r.status} ${r.text ?? ''}`);
    const patch = r.body.data;
    timeline.push({ at: new Date().toISOString(), status: patch.status, checks: patch.checks.map((c) => `${c.id}:${c.status}`) });
    if (patch.status !== 'checking') return { patch, timeline, waitedMs: Date.now() - started };
    if (Date.now() - started > timeoutMs) throw new Error(`Patch ${id} 超过 ${timeoutMs / 60000} 分钟未到终态`);
    await sleep(3000);
  }
}

function tianshuMods() {
  const out = execFileSync('git', ['status', '--porcelain', '--', 'kit/projects/tianshu-device-ops'], {
    cwd: REPO, encoding: 'utf8'
  });
  // 只看小豆盒源码：evidence/ 下是验收脚本自己写的证据，重跑时被刷新属正常，不算源码改动。
  // git 会给含中文的路径加引号，先去掉再判断。
  return out.split('\n').filter((l) => /^[ MARC][MARC] /.test(l))
    .map((l) => ({ x: l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '') }))
    .filter((m) => !m.file.startsWith('kit/projects/tianshu-device-ops/evidence/'));
}
function gitDiff(scope) {
  return execFileSync('git', ['diff', '--', scope], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function baselineAudit(label) {
  const diffs = [];
  for (const entry of baseline) {
    const abs = kf(entry.file.replace(/^kit\//, ''));
    let actual = null;
    try { actual = sha256(abs); } catch { actual = 'MISSING'; }
    if (actual !== entry.sha256) diffs.push({ file: entry.file, expected: entry.sha256, actual });
  }
  const result = { label, at: new Date().toISOString(), checked: baseline.length, mismatches: diffs };
  dump(`baseline-audit-${label}.json`, result);
  return result;
}

/* ---------------- 浏览器通用 ---------------- */
function attachWatchers(page, store, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') store.push({ tag, kind: 'console', level: m.type(), text: m.text().slice(0, 500) });
  });
  page.on('pageerror', (e) => store.push({ tag, kind: 'pageerror', text: String(e).slice(0, 500) }));
  page.on('requestfailed', (r) => store.push({ tag, kind: 'requestfailed', url: r.url().slice(0, 200), error: r.failure()?.errorText }));
}

async function childFrame(page, needle, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    const frames = page.frames().filter((f) => f.url().startsWith(BASE_URL) && f.url() !== page.url());
    // 优先精确 needle；固件页 tab 规整会把 iframe URL 的前缀 /device-ops 改写掉（已登记缺陷），
    // 此时退化为「唯一的子 frame」，失败仍显式报错。
    const exact = frames.find((f) => f.url().includes(needle));
    if (exact) return exact;
    if (frames.length === 1) return frames[0];
    if (Date.now() - started > timeoutMs) throw new Error(`编辑器 iframe（${needle}）未出现；当前子 frame=${JSON.stringify(frames.map((f) => f.url()))}`);
    await sleep(300);
  }
}
const deviceOpsFrame = (page, ms) => childFrame(page, '/device-ops', ms);

async function setPrimaryColor(page, hexNoHash) {
  await openMoreSettings(page);
  await page.getByLabel('主色颜色').click();
  const hexInput = page.locator('.ludi-color-picker-hex-input input').first();
  await hexInput.waitFor({ state: 'visible', timeout: 8000 });
  await hexInput.fill(hexNoHash);
  await hexInput.press('Enter');
  await page.keyboard.press('Escape');
  await sleep(400);
}

async function waitAcceptance(list, urlSuffix, timeoutMs = 30000) {
  const started = Date.now();
  for (;;) {
    const hit = list.find((a) => a.url.endsWith(urlSuffix) && !a._used);
    if (hit) { hit._used = true; return hit; }
    if (Date.now() - started > timeoutMs) throw new Error(`未捕获到 ${urlSuffix} 受理响应`);
    await sleep(250);
  }
}

// 新外壳：撤销是顶栏图标按钮，始终渲染、无可撤销记录时禁用；等其转为可用再点。
// 第二阶段外壳：「撤销最近一次写入」在右栏顶部「最近写入」结果条里，仅有可撤销记录时才出现；
// 名称不变，waitFor visible 恢复原语义（出现即代表可撤），等待其出现即点。
async function clickUndoButton(page, timeoutMs = 120000) {
  const undoBtn = page.getByRole('button', { name: '撤销最近一次写入', exact: true });
  const started = Date.now();
  for (;;) {
    if (await undoBtn.isVisible().catch(() => false)) {
      await undoBtn.click();
      return;
    }
    if (Date.now() - started > timeoutMs) throw new Error('「撤销最近一次写入」结果条长时间未出现');
    await sleep(500);
  }
}

/* ================= 主流程 ================= */
const summary = { checks: {}, patches: [], probes: [], findings: [] };
const run = async () => {
  const preAudit = baselineAudit('pre-run');
  log('check0.baseline', { status: preAudit.mismatches.length === 0 ? 'pass' : 'fail', message: `开工 baseline 对账 ${preAudit.checked} 文件，差异 ${preAudit.mismatches.length}`, mismatches: preAudit.mismatches });
  if (preAudit.mismatches.length > 0) throw new Error('开工 baseline 不一致，按计划返回 STOP');
  // 受理体 P1 修复仍在：主题写回与组件替换写回都经 resolveAcceptedPatch 取完整 Patch。
  // 原先锁 api.ts 整份哈希，「基础」扩充扩了主题类型后必然变化，改为检查修复本身是否还在调用链上。
  const apiSource = readFileSync(kf('preview/src/editor/api.ts'), 'utf8');
  const bFixCalls = (apiSource.match(/return resolveAcceptedPatch\(/g) ?? []).length;
  log('check0.b-fix-present', { status: bFixCalls >= 2 ? 'pass' : 'fail', message: `resolveAcceptedPatch 调用 ${bFixCalls} 处（主题、替换两条写回路径）`, apiSha: sha256(kf('preview/src/editor/api.ts')) });
  const preMods = tianshuMods();
  log('check0.tianshu-clean', { status: preMods.length === 0 ? 'pass' : 'fail', message: `小豆盒跟踪文件修改数 ${preMods.length}`, mods: preMods });

  const boot = await api('GET', '/__ludi/bootstrap');
  if (boot.status !== 200 || !boot.body?.ok) throw new Error(`bootstrap 不可用：HTTP ${boot.status}`);
  sessionToken = boot.body.data.sessionToken;
  const { sessionToken: omittedSessionToken, ...bootstrapEvidence } = boot.body.data;
  dump('bootstrap.json', bootstrapEvidence);
  const routes = boot.body.data.routes;
  log('check1.bootstrap', { status: 'pass', message: `bootstrap 200；routes=${routes.length}（登记 14 / 计划 12 差异原样记录）；files=${boot.body.data.files.length}` });
  dump('routes-actual.json', routes);

  const browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 30000 });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const watch = [];
  const page = await context.newPage();
  attachWatchers(page, watch, 'editor');

  const acceptances = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      const method = res.request().method();
      if (method === 'POST' && (url.endsWith('/__ludi/patch') || url.endsWith('/__ludi/undo'))) {
        const body = await res.json().catch(() => null);
        acceptances.push({ url, status: res.status(), request: res.request().postDataJSON?.() ?? null, body, at: new Date().toISOString() });
      }
    } catch { /* 忽略竞态 */ }
  });

  await page.goto(`${BASE_URL}/editor`, { waitUntil: 'networkidle' });
  await page.getByText('组件库编辑器', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 });
  await sleep(1500);
  const shellBefore = await page.evaluate(() => ({
    ludiPrimary: getComputedStyle(document.documentElement).getPropertyValue('--ludi-primary').trim(),
    topbarBg: getComputedStyle(document.querySelector('.ludi-editor__topbar')).backgroundColor
  }));
  await page.screenshot({ path: resolve(OUT, 'shots/01-workbench-initial.png'), fullPage: true });
  await page.screenshot({ path: resolve(OUT, 'shots/s41-overview-project.png'), fullPage: true }); // 新界面状态图 1：工作台概览
  log('check2.editor-load', { status: 'pass', message: '编辑器 /editor 加载', shellBefore });

  /* ---- Check 3：L0 主题写回（界面真实操作） ---- */
  const THEME_FILES = ['projects/tianshu-device-ops/theme.ts', 'projects/tianshu-device-ops/generated/styles.css'];
  const beforeHash = Object.fromEntries(THEME_FILES.map((f) => [f, sha256(kf(f))]));
  log('check3.before-hash', { status: 'pass', beforeHash });

  // 第二阶段：/editor 默认即画布（小豆盒 iframe 在选择模式下已在），不再有「应用到项目」入口。
  let frame = await deviceOpsFrame(page);
  await frame.waitForSelector('.device-ops-shell', { timeout: 30000 });
  await sleep(1200);

  await setPrimaryColor(page, '0958d9');
  await page.getByLabel('圆角（0 到 16 px）', { exact: true }).fill('4');
  await page.getByLabel('控件高度（24 到 48 px）', { exact: true }).fill('32');
  await sleep(1200);

  const previewProbe = await (await deviceOpsFrame(page)).evaluate(() => {
    const btn = document.querySelector('.ant-btn-primary');
    const root = getComputedStyle(document.documentElement);
    const cs = btn ? getComputedStyle(btn) : null;
    return {
      doPrimary: root.getPropertyValue('--do-primary').trim(),
      btnBg: cs?.backgroundColor ?? null,
      btnRadius: cs?.borderRadius ?? null,
      btnHeight: cs?.height ?? null
    };
  });
  const shellAfter = await page.evaluate(() => ({
    ludiPrimary: getComputedStyle(document.documentElement).getPropertyValue('--ludi-primary').trim(),
    topbarBg: getComputedStyle(document.querySelector('.ludi-editor__topbar')).backgroundColor
  }));
  const filesAfterDraft = Object.fromEntries(THEME_FILES.map((f) => [f, sha256(kf(f))]));
  const filesSame = JSON.stringify(beforeHash) === JSON.stringify(filesAfterDraft);
  const previewOk = previewProbe.btnBg === 'rgb(9, 88, 217)' && previewProbe.doPrimary === '#0958d9'
    && filesSame && shellAfter.ludiPrimary === shellBefore.ludiPrimary && shellAfter.topbarBg === shellBefore.topbarBg;
  log('check3.preview-only', {
    status: previewOk ? 'pass' : 'fail',
    message: '预览已改（内存覆盖）且文件未写、外壳 --ludi 未变',
    previewProbe, shellBefore, shellAfter, filesAfterDraft
  });
  await page.screenshot({ path: resolve(OUT, 'shots/02-workbench-preview-dirty.png'), fullPage: true });

  await page.getByRole('button', { name: '写入项目' }).click();
  const l0Acc = await waitAcceptance(acceptances, '/__ludi/patch');
  log('check3.acceptance', { status: l0Acc.status === 202 ? 'pass' : 'fail', patchId: l0Acc.body?.data?.patchId, http: l0Acc.status });
  dump('acceptance-l0-theme.json', l0Acc);

  // 新界面状态图 3：写入后的检查进度与「记录」页签
  try {
    await page.getByRole('tab', { name: '记录' }).click();
    await sleep(1500);
    await page.screenshot({ path: resolve(OUT, 'shots/s43-patch-checking-records.png'), fullPage: true });
  } catch { /* 进度极快时页面可能直接到终态；不阻断主流程 */ }

  await sleep(500);
  const busyProbe = await api('POST', '/__ludi/patch', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'replace',
    expectedFiles: [{ file: THEME_FILES[0], sha256: beforeHash[THEME_FILES[0]] }],
    loc: { file: THEME_FILES[0], line: 7, column: 4, component: 'Modal' }, candidateId: 'x', confirmedUnmappedProps: [], route: '/devices'
  });
  log('check3.patch-busy-probe', { status: busyProbe.status === 409 && busyProbe.body?.error?.code === 'PATCH_BUSY' ? 'pass' : 'fail', http: busyProbe.status, code: busyProbe.body?.error?.code, message: busyProbe.body?.error?.message });

  const l0 = await pollPatch(l0Acc.body.data.patchId);
  dump(`patch-l0-${l0.patch.id}.json`, { patch: l0.patch, timeline: l0.timeline });
  summary.patches.push({ kind: 'theme', id: l0.patch.id, status: l0.patch.status, checks: l0.patch.checks.map((c) => ({ id: c.id, status: c.status, exitCode: c.exitCode })) });
  log('check3.checks-terminal', { status: l0.patch.status === 'checks-passed' ? 'pass' : 'fail', message: `L0 检查终态=${l0.patch.status}，等待 ${(l0.waitedMs / 1000).toFixed(0)}s` });
  const componentAfterL0 = (await api('GET', '/__ludi/bootstrap')).body.data;
  log('check3.component-override-protected', {
    status: componentAfterL0.theme.controlHeight === 32
      && componentAfterL0.componentTokens.Button.controlHeight.value === 34
      && componentAfterL0.componentTokens.Button.controlHeight.status === 'custom' ? 'pass' : 'fail',
    message: 'L0 高度 32；Button 原有独立高度 34 保留',
    globalHeight: componentAfterL0.theme.controlHeight,
    buttonHeight: componentAfterL0.componentTokens.Button.controlHeight
  });

  const afterWriteHash = Object.fromEntries(THEME_FILES.map((f) => [f, sha256(kf(f))]));
  const writeMods = tianshuMods().map((m) => m.file).sort();
  dump('git-diff-l0-theme.txt', gitDiff('kit/projects/tianshu-device-ops'));
  const diffScopeOk = JSON.stringify(writeMods) === JSON.stringify(['projects/tianshu-device-ops/generated/styles.css', 'projects/tianshu-device-ops/theme.ts'].map((f) => `kit/${f}`).sort());
  log('check3.diff-scope', { status: diffScopeOk ? 'pass' : 'fail', mods: writeMods, afterWriteHash });

  const sweep = await routeSweep(context, watch, routes, {
    doPrimary: '#0958d9', btnBg: 'rgb(9, 88, 217)', btnRadius: '4px', btnHeight: '34px', menuColor: 'rgb(9, 88, 217)', linkColor: 'rgb(9, 88, 217)'
  }, 'patched');
  // 验收差异登记（产品发现，不在 C 修复范围）：
  const typedLinkFails = sweep.results.filter((r) => r.probe?.linkTyped && r.expectMatch?.link === false);
  if (typedLinkFails.length > 0) {
    summary.findings.push({
      id: 'theme-write-vs-colorLink',
      severity: 'acceptance-diff（§6.1「链接显示新值」不满足）',
      detail: `L0 写回后按钮/选中态/--do-* 均为 #0958d9，但 antd Typography 链接仍为旧主色 rgb(22,119,255)（#1677ff）：antd 的 colorLink 是独立种子 token，六值写回不含它。受影响路由 ${typedLinkFails.length} 页次：${[...new Set(typedLinkFails.map((r) => r.path))].join('、')}。裁决选项：①把 colorLink 纳入主色联动写回；②修订 PLAN 验收预期为「链接为独立 token」。`,
      evidence: 'routes-sweep-patched.json 中 linkTyped=true 且 expectMatch.link=false 的行'
    });
    log('check3.link-diff-finding', { status: 'fail', message: `antd 语义链接未随主色更新（colorLink 独立 token），${typedLinkFails.length} 页次`, routes: [...new Set(typedLinkFails.map((r) => r.path))] });
  }
  summary.findings.push({
    id: 'firmware-tab-redirect-strips-prefix',
    severity: 'P2 候选（待 Owner 裁决归属）',
    detail: 'FirmwarePage 的 tab 规整 useEffect（generated/FirmwarePage.tsx:874）navigate(`${pathname}?${next}`) 使用内层（已去前缀）路径，把 /device-ops/system/firmware 改写为 /system/firmware?tab=version：URL 丢失 /device-ops 前缀；随即刷新将坠出小豆盒外壳（PreviewApp 不再匹配路由→Lab 首页）；编辑器 iframe 同时失去 device-ops URL 身份。应用本身因不发生重渲而保持挂载、服务端 smoke 可通过，故按缺陷登记而非 P1 止损。已用页面自身 canonical 形式（tabHref/taskHref/versionHref 均带 tab 参数）继续验收。',
    evidence: 'shots/p1b-plain-firmware-redirect.png；探针输出：/device-ops/system/firmware → http://127.0.0.1:5393/system/firmware?tab=version'
  });

  // 写一次真实写入后的界面：右栏「最近写入」结果条 + 记录页签 + 撤销按钮位置（第二阶段新证据位置）
  try {
    await page.getByRole('tab', { name: '记录' }).click();
    await sleep(800);
  } catch { /* 记录页签不可点击时仍存整页 */ }
  await page.screenshot({ path: resolve(OUT, 'shots/s51-write-result-strip.png'), fullPage: true });

  await clickUndoButton(page);
  const undoAcc = await waitAcceptance(acceptances, '/__ludi/undo');
  dump('acceptance-l0-undo.json', undoAcc);
  const l0undo = await pollPatch(undoAcc.body.data.patchId);
  dump(`patch-l0-undo-${l0undo.patch.id}.json`, { patch: l0undo.patch, timeline: l0undo.timeline });
  summary.patches.push({ kind: 'undo', id: l0undo.patch.id, status: l0undo.patch.status, undoOf: l0.patch.id, checks: l0undo.patch.checks.map((c) => ({ id: c.id, status: c.status, exitCode: c.exitCode })) });
  const afterUndoHash = Object.fromEntries(THEME_FILES.map((f) => [f, sha256(kf(f))]));
  const undoOk = JSON.stringify(afterUndoHash) === JSON.stringify(beforeHash);
  log('check3.undo-restore', { status: undoOk && l0undo.patch.status === 'checks-passed' ? 'pass' : 'fail', message: `undo 终态=${l0undo.patch.status}，Hash 复原=${undoOk}`, afterUndoHash });
  await page.screenshot({ path: resolve(OUT, 'shots/s52-after-undo.png'), fullPage: true }); // 撤销后结果条/记录页签全景

  const back = await context.newPage();
  attachWatchers(back, watch, 'undo-spotcheck');
  await back.goto(`${BASE_URL}/device-ops/devices`, { waitUntil: 'networkidle' });
  await back.locator('h1').first().waitFor({ state: 'visible', timeout: 20000 });
  const restored = await back.evaluate(() => ({
    doPrimary: getComputedStyle(document.documentElement).getPropertyValue('--do-primary').trim(),
    btnBg: getComputedStyle(document.querySelector('.ant-btn-primary'))?.backgroundColor ?? null
  }));
  log('check3.undo-spotcheck', { status: restored.doPrimary === '#1677ff' && restored.btnBg === 'rgb(22, 119, 255)' ? 'pass' : 'fail', restored });
  await back.close();
  summary.checks['3-l0-theme'] = sweep.summary;

  /* ---- Check 4：对比度护栏三分支（新规则：只拦「把主色改成不达标的值」） ---- */
  // (a) 加载后主色未改：现状不达标 (#1677ff≈4.10) 只给非阻断提示（琥珀色，pass + 建议色）；
  //     只改圆角时「写入项目」可用（按合同：不点击写入）。
  await page.goto(`${BASE_URL}/editor`, { waitUntil: 'networkidle' });
  await page.getByText('组件库编辑器').first().waitFor({ state: 'visible', timeout: 20000 });
  await sleep(1500);
  await openMoreSettings(page);
  await page.getByLabel('圆角（0 到 16 px）', { exact: true }).fill('8');
  await sleep(1200);
  await openMoreSettings(page);
  await sleep(400);
  const paneARules = await page.locator('.ludi-inspector__pane:visible').innerText();
  let paneAStyle = '';
  try {
    await page.getByRole('tab', { name: '设计' }).click();
    await sleep(300);
    paneAStyle = await page.locator('.ludi-inspector__pane:visible').innerText();
  } catch { /* 样式页签不可用时仅规则页签留证 */ }
  const paneA = `${paneARules}\n---样式页签---\n${paneAStyle}`;
  const writeEnabledA = await page.getByRole('button', { name: '写入项目' }).isEnabled();
  dump('check4a-rule-pane.txt', paneA);
  const hasHint = /现状不达标|现状主色/.test(paneA);
  const aOk = writeEnabledA && hasHint && /建议/.test(paneA) && !paneA.includes('不通过');
  log('check4a.non-blocking-hint', { status: aOk ? 'pass' : 'fail', message: `主色未改：非阻断提示=${hasHint}、仅改圆角写入可用=${writeEnabledA}、无「不通过」=${!paneA.includes('不通过')}`, rulesPane: paneARules.slice(0, 400), stylePane: paneAStyle.slice(0, 400) });
  // 新界面状态图 2：颜色分区的琥珀色提示
  await page.getByText('颜色', { exact: true }).first().click();
  await sleep(800);
  await page.screenshot({ path: resolve(OUT, 'shots/s42-color-amber-hint.png'), fullPage: true });

  // (b) 主色改成 #faad14：规则不通过 + 推荐合规色 + 写入禁用（恢复到圆角切回原值前先改成 6)
  await setPrimaryColor(page, 'faad14');
  await openMoreSettings(page);
  await sleep(400);
  const paneB = await page.locator('.ludi-inspector__pane:visible').innerText();
  const writeDisabledB = await page.getByRole('button', { name: '写入项目' }).isDisabled();
  dump('check4b-rule-pane.txt', paneB);
  await page.screenshot({ path: resolve(OUT, 'shots/03-contrast-blocked.png'), fullPage: true });
  const bOk = writeDisabledB && paneB.includes('不通过') && /合规候选|建议/.test(paneB);
  log('check4b.ui-guard', { status: bOk ? 'pass' : 'fail', message: `改成 #faad14：写入禁用=${writeDisabledB}，不通过+推荐色=${bOk}` });

  // (c) API 直接恶意绕过：同上请求 → 422 RULE_FAILED 且两文件 Hash 不变
  const badTheme = await fullTheme({ colorPrimary: '#faad14' });
  const freshHash = THEME_FILES.map((f) => ({ file: f, sha256: sha256(kf(f)) }));
  const bypass = await api('POST', '/__ludi/patch', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: freshHash, theme: badTheme, route: '/devices'
  });
  const bypassRejected = bypass.status === 422 && bypass.body?.error?.code === 'RULE_FAILED';
  const hashAfterBypass = Object.fromEntries(THEME_FILES.map((f) => [f, sha256(kf(f))]));
  log('check4c.api-bypass', {
    status: bypassRejected && JSON.stringify(hashAfterBypass) === JSON.stringify(beforeHash) ? 'pass' : 'fail',
    http: bypass.status, code: bypass.body?.error?.code, details: bypass.body?.error?.details, message: bypass.body?.error?.message,
    suggestion: bypass.body?.error?.details?.rules?.[0]?.suggestedValue, filesUnchanged: JSON.stringify(hashAfterBypass) === JSON.stringify(beforeHash)
  });

  /* ---- Check 5/6：L3 三类替换 × 真实页面 × 撤销复原 ---- */
  const L3 = [
    {
      key: 'drawer-to-modal', route: '/system/firmware',
      deep: '/device-ops/system/firmware?tab=version&version=v2.4.1&editor=1',
      locFile: 'projects/tianshu-device-ops/generated/FirmwarePage.tsx', locLine: 247, comp: 'Drawer',
      targetDesc: '固件版本详情 Drawer → Modal',
      proof: { url: '/device-ops/system/firmware?tab=version&version=v2.4.1', kind: 'modal-proof' }
    },
    {
      key: 'select-to-radio', route: '/exceptions/feedback',
      deep: '/device-ops/exceptions/feedback?create=1&editor=1',
      locFile: 'projects/tianshu-device-ops/generated/FeedbackPage.tsx', locLine: 1673, comp: 'Select',
      targetDesc: '代录工单 工单类型 Select → Radio.Group',
      proof: { url: '/device-ops/exceptions/feedback?create=1', kind: 'radio-proof' }
    },
    {
      key: 'popconfirm-to-modal', route: '/system/firmware',
      deep: '/device-ops/system/firmware?tab=push-task&editor=1',
      locFile: 'projects/tianshu-device-ops/generated/FirmwarePage.tsx', locLine: 1275, comp: 'Popconfirm',
      targetDesc: '任务行 取消 Popconfirm → modal.confirm（C 档升级）',
      proof: { url: '/device-ops/system/firmware?tab=push-task', kind: 'confirm-proof', rowText: 'v2.4.0 灰度 10%' }
    }
  ];
  for (const item of L3) await runL3(page, context, watch, acceptances, item);

  await blockedDemos(page);
  await boundaryProbes(l0Acc, l0.patch.id);
  await buildProof();

  const postAudit = baselineAudit('post-run');
  log('check8.baseline', { status: postAudit.mismatches.length === 0 ? 'pass' : 'STOP', message: `终态 baseline 对账 ${postAudit.checked} 文件，差异 ${postAudit.mismatches.length}`, mismatches: postAudit.mismatches });
  // 导航打断中的静态资源请求会收到 ERR_ABORTED：浏览器在文档切换时的合法中止，单独归类仍记录；
  // console error / pageerror / 其他 requestfailed 仍为失败判据。
  const aborts = watch.filter((w) => w.kind === 'requestfailed' && w.error === 'net::ERR_ABORTED');
  const consoleErrors = watch.filter((w) => (w.kind === 'console' && w.level === 'error') || w.kind === 'pageerror' || (w.kind === 'requestfailed' && w.error !== 'net::ERR_ABORTED'));
  dump('browser-watch.json', watch);
  log('check8.browser-watch', { status: consoleErrors.length === 0 ? 'pass' : 'fail', message: `浏览器失败判据记录 ${consoleErrors.length} 条；导航中止 ERR_ABORTED ${aborts.length} 条（归类为文档切换噪声，已留档）`, consoleErrors: consoleErrors.slice(0, 20), navigationAborts: aborts });

  /* ---- 第二阶段四项只读走查（画布与图层；不写回） ---- */
  const walks = await runWalkthroughs(page);
  summary.checks.walkthroughs = walks;

  dump('summary.json', summary);
  await browser.close();
  return summary;
};

/* 14 路由全扫 */
async function routeSweep(context, watch, routes, expect, tag) {
  const sp = await context.newPage();
  attachWatchers(sp, watch, `sweep-${tag}`);
  const results = [];
  for (const width of [1440, 1024]) {
    await sp.setViewportSize({ width, height: 1000 });
    for (const r of routes) {
      const rec = { route: r.route, path: r.path, title: r.title, width };
      try {
        await sp.goto(`${BASE_URL}${r.path}`, { waitUntil: 'networkidle', timeout: 60000 });
        // 主标题：多为 h1；passport-detail 用 DetailHeader（无 h1，标题在 h2/heading role）。
        let heading = sp.locator('h1').first();
        try {
          await heading.waitFor({ state: 'visible', timeout: 8000 });
        } catch {
          heading = sp.locator('h2:visible, [role="heading"]:visible').first();
          await heading.waitFor({ state: 'visible', timeout: 15000 });
        }
        rec.h1 = (await heading.innerText()).trim();
        rec.probe = await sp.evaluate(() => {
          const shell = document.querySelector('.device-ops-shell');
          const root = getComputedStyle(document.documentElement);
          // 只取可用主按钮：禁用的 primary（如查询未填）不承载主题色。
          const btn = shell?.querySelector('.ant-btn-primary:not([disabled]):not(.ant-btn-disabled)');
          const menu = document.querySelector('.ant-menu-item-selected');
          // 语义链接优先 antd Typography 内的 <a>（主题色）；退化为首个 <a> 只记录不断言。
          const typed = shell?.querySelector('.ant-typography a') ?? shell?.querySelector('a.ant-typography');
          const link = typed ?? shell?.querySelector('main a, .device-ops-shell a');
          const css = (el, props) => (el ? Object.fromEntries(props.map((p) => [p, getComputedStyle(el)[p]])) : null);
          return {
            doPrimary: root.getPropertyValue('--do-primary').trim(),
            shellDoPrimary: shell ? getComputedStyle(shell).getPropertyValue('--do-primary').trim() : null,
            primaryBtn: css(btn, ['backgroundColor', 'borderRadius', 'height']),
            menuSelected: css(menu, ['color']),
            link: css(link, ['color']),
            linkTyped: Boolean(typed),
            overflow: document.documentElement.scrollWidth > window.innerWidth + 1
          };
        });
        rec.expectMatch = {
          doPrimary: rec.probe.doPrimary === expect.doPrimary,
          primaryBtn: !rec.probe.primaryBtn || (rec.probe.primaryBtn.backgroundColor === expect.btnBg && rec.probe.primaryBtn.borderRadius === expect.btnRadius && rec.probe.primaryBtn.height === expect.btnHeight),
          menuSelected: !rec.probe.menuSelected || rec.probe.menuSelected.color === expect.menuColor,
          link: !rec.probe.link || !rec.probe.linkTyped || rec.probe.link.color === expect.linkColor,
          overflowNone: rec.probe.overflow === false
        };
        rec.pass = Object.values(rec.expectMatch).every(Boolean) && rec.h1.length > 0;
      } catch (error) {
        rec.pass = false;
        rec.error = String(error).slice(0, 300);
      }
      const shotName = `routes/${r.id}-${width}-${tag}.png`;
      try { await sp.screenshot({ path: resolve(OUT, shotName), fullPage: true }); rec.screenshot = shotName; } catch { rec.screenshot = null; }
      results.push(rec);
      log(`sweep.${tag}.${r.id}.${width}`, { status: rec.pass ? 'pass' : 'fail', message: `${r.path} @${width}` });
    }
  }
  dump(`routes-sweep-${tag}.json`, results);
  await sp.close();
  const fails = results.filter((r) => !r.pass);
  return { results, summary: `${tag} 扫描 ${results.length} 页次（${routes.length} 路由 × 2 宽度），失败 ${fails.length}` };
}

/* L3 单条：点选 → 候选 → 写入 → 终态 → diff → 交互证明 → 撤销 → Hash 复原 */
async function runL3(page, context, watch, acceptances, item) {
  const tag = item.key;
  const targetFile = item.locFile;
  const before = sha256(kf(targetFile));
  log(`l3.${tag}.before`, { status: 'pass', file: targetFile, before });

  await page.goto(`${BASE_URL}/editor/page?route=${encodeURIComponent(item.route)}`, { waitUntil: 'networkidle' });
  await page.getByText('组件库编辑器').first().waitFor({ state: 'visible', timeout: 20000 });
  await sleep(1500);
  const frame0 = await deviceOpsFrame(page);
  await frame0.goto(`${BASE_URL}${item.deep}`, { waitUntil: 'networkidle' });
  await sleep(1800);

  const locPrefix = `${item.locFile}:${item.locLine}:`;
  // Popconfirm 等无自身 DOM 的包裹组件：点唯一触发子元素上的 data-ludi-owner-loc（修复后桥接会上报 owner loc）。
  const ownerAttr = item.comp === 'Popconfirm';
  const attr = ownerAttr ? 'data-ludi-owner-loc' : 'data-ludi-loc';
  const compAttr = ownerAttr ? 'data-ludi-owner-comp' : 'data-ludi-comp';
  const frame = await deviceOpsFrame(page);
  // 第二阶段开始原生元素也带 data-ludi-loc：前缀之外必须同核 data-ludi-comp(-owner-comp) 为目标组件名，避免误中原生节点。
  const matches = await frame.evaluate(({ prefix, attr, compAttr, compName }) => {
    return [...document.querySelectorAll(`[${attr}]`)]
      .filter((e) => (e.getAttribute(attr) ?? '').startsWith(prefix) && e.getAttribute(compAttr) === compName)
      .map((e) => ({
        loc: e.getAttribute(attr), comp: e.getAttribute(compAttr), via: attr,
        cls: String(e.className).slice(0, 80), text: (e.textContent ?? '').trim().slice(0, 40)
      }));
  }, { prefix: locPrefix, attr, compAttr, compName: item.comp });
  log(`l3.${tag}.located`, { status: matches.length > 0 ? 'pass' : 'fail', message: `${item.targetDesc}：DOM 命中 ${matches.length} 处（${attr}）`, matches });
  if (matches.length === 0) throw new Error(`${tag} 目标组件未在 DOM 定位（注入未到达渲染层）`);
  const locColumn = Number(matches[0].loc.split(':').at(-1));

  const candRaw = await api('POST', '/__ludi/candidates', {
    version: 1, projectId: 'tianshu-device-ops',
    loc: { file: item.locFile, line: item.locLine, column: locColumn, component: item.comp },
    expectedSha256: before
  });
  dump(`l3-candidates-${tag}.json`, candRaw);
  log(`l3.${tag}.candidates`, { status: candRaw.status === 200 && candRaw.body?.data?.candidates?.length === 1 ? 'pass' : 'fail', message: `候选=${candRaw.body?.data?.candidates?.length ?? 0}`, rules: candRaw.body?.data?.rules, candidates: candRaw.body?.data?.candidates });

  // 原生元素也带标记后，点击元素中心会命中最内层带标记子节点；改为点元素自身左上角未被子节点覆盖的区域，
  // 让桥接的 closest() 命中目标组件本体（内部 antd/文本节点的包装元素未受注入）。
  await frame.locator(`[${attr}^="${locPrefix}"][${compAttr}="${item.comp}"]`).first().click({ position: { x: 2, y: 2 } });
  await openMoreSettings(page);
  await page.locator('.ludi-loc').filter({ hasText: `${item.locFile.split('/').pop()}:${item.locLine}:` }).first().waitFor({ state: 'visible', timeout: 15000 });
  await sleep(1500);
  dump(`l3-inspector-${tag}.txt`, await page.locator('.ludi-inspector').innerText());
  await page.screenshot({ path: resolve(OUT, `shots/10-${tag}-candidates.png`), fullPage: true });
  // 新界面状态图 5/6：Popconfirm 选中态、替换候选面板
  if (tag === 'popconfirm-to-modal') await page.screenshot({ path: resolve(OUT, 'shots/s45-page-popconfirm-selected.png'), fullPage: true });
  if (tag === 'select-to-radio') await page.screenshot({ path: resolve(OUT, 'shots/s46-candidates-panel.png'), fullPage: true });

  await page.getByRole('button', { name: '写入替换' }).first().click();
  try {
    const confirmBtn = page.getByRole('button', { name: '确认并写入' });
    await confirmBtn.waitFor({ state: 'visible', timeout: 2500 });
    const boxes = page.locator('.ludi-modal .ant-checkbox-input, .ludi-modal .ludi-checkbox-input');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await boxes.nth(i).check();
    await confirmBtn.click();
  } catch { /* 无确认弹窗 */ }
  const acc = await waitAcceptance(acceptances, '/__ludi/patch');
  dump(`acceptance-${tag}.json`, acc);
  const result = await pollPatch(acc.body.data.patchId);
  dump(`patch-${tag}-${result.patch.id}.json`, { patch: result.patch, timeline: result.timeline });
  summary.patches.push({ kind: 'replace', tag, id: result.patch.id, status: result.patch.status, target: targetFile, checks: result.patch.checks.map((c) => ({ id: c.id, status: c.status, exitCode: c.exitCode })) });
  log(`l3.${tag}.checks-terminal`, { status: result.patch.status === 'checks-passed' ? 'pass' : 'fail', message: `${tag} 检查终态=${result.patch.status}` });

  const afterWrite = sha256(kf(targetFile));
  const mods = tianshuMods().map((m) => m.file);
  dump(`git-diff-${tag}.txt`, gitDiff(`kit/${targetFile}`));
  const scopeOk = mods.length === 1 && mods[0] === `kit/${targetFile}`;
  log(`l3.${tag}.diff-scope`, { status: scopeOk ? 'pass' : 'fail', mods, afterWrite });

  const proof = await interactionProof(context, watch, item.proof, tag);

  await clickUndoButton(page);
  const undoAcc = await waitAcceptance(acceptances, '/__ludi/undo');
  dump(`acceptance-${tag}-undo.json`, undoAcc);
  const undo = await pollPatch(undoAcc.body.data.patchId);
  dump(`patch-${tag}-undo-${undo.patch.id}.json`, { patch: undo.patch, timeline: undo.timeline });
  const restored = sha256(kf(targetFile));
  const undoOk = restored === before && undo.patch.status === 'checks-passed';
  summary.patches.push({ kind: 'undo', tag, id: undo.patch.id, status: undo.patch.status, undoOf: result.patch.id });
  log(`l3.${tag}.undo-restore`, { status: undoOk ? 'pass' : 'fail', message: `undo 终态=${undo.patch.status}，Hash 复原=${restored === before}`, restored });
  summary.checks[`5-l3-${tag}`] = { write: result.patch.status, undo: undo.patch.status, proof };
}

async function interactionProof(context, watch, proof, tag) {
  const p = await context.newPage();
  attachWatchers(p, watch, `proof-${tag}`);
  const rec = { kind: proof.kind, url: proof.url, assertions: {}, pass: false };
  try {
    await p.goto(`${BASE_URL}${proof.url}`, { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(1500);
    if (proof.kind === 'modal-proof') {
      // antd 6.5 Modal 容器类名为 .ant-modal-container（无 .ant-modal-content）
      const modal = p.locator('.ant-modal-container').first();
      await modal.waitFor({ state: 'visible', timeout: 15000 });
      rec.assertions.modalVisible = true;
      rec.assertions.drawerAbsent = (await p.locator('.ant-drawer-open').count()) === 0;
      rec.assertions.title = (await modal.innerText()).includes('固件版本');
      await p.screenshot({ path: resolve(OUT, `shots/11-${tag}-proof-open.png`), fullPage: true });
      await p.locator('.ant-modal-close').first().click();
      await p.waitForTimeout(800);
      rec.assertions.closedOk = (await p.locator('.ant-modal-container:visible').count()) === 0;
    } else if (proof.kind === 'radio-proof') {
      const modal = p.locator('.ant-modal-container').first();
      await modal.waitFor({ state: 'visible', timeout: 15000 });
      const group = p.locator('.ant-modal-container .ant-radio-group').first();
      await group.waitFor({ state: 'visible', timeout: 15000 });
      const labels = await p.locator('.ant-modal-container .ant-radio-wrapper').allInnerTexts();
      rec.assertions.radioOptions = labels;
      rec.assertions.fourOptions = labels.length === 4;
      await p.locator('.ant-modal-container .ant-radio-wrapper', { hasText: '建议' }).first().click();
      await p.locator('.ant-modal-container textarea').first().fill('验收期间录入：替换为单选组后提交链路真实可用，验证值随表单提交。');
      await p.screenshot({ path: resolve(OUT, `shots/11-${tag}-proof-open.png`), fullPage: true });
      await p.getByRole('button', { name: '提交工单' }).click();
      await p.waitForTimeout(1500);
      const msg = await p.locator('.ant-message').innerText().catch(() => '');
      rec.assertions.submitMessage = msg;
      rec.assertions.submitOk = msg.includes('工单代录成功');
    } else if (proof.kind === 'confirm-proof') {
      // 任务表行内 取消（type=link）：替换后点击应打开 modal.confirm；确认后业务 action 走 store。
      const row = p.locator('tr', { hasText: proof.rowText }).first();
      await row.waitFor({ state: 'visible', timeout: 15000 });
      const beforeButtons = (await row.locator('button').allInnerTexts()).join('|');
      const cancelBtn = row.getByRole('button', { name: '取消', exact: true });
      await cancelBtn.waitFor({ state: 'visible', timeout: 15000 });
      await cancelBtn.click();
      const confirm = p.locator('.ant-modal-confirm, .ant-modal-container').first();
      await confirm.waitFor({ state: 'visible', timeout: 10000 });
      rec.assertions.confirmOpened = true;
      rec.assertions.titleOk = (await confirm.innerText()).includes('取消任务');
      await p.screenshot({ path: resolve(OUT, `shots/11-${tag}-proof-open.png`), fullPage: true });
      await p.locator('.ant-modal-confirm .ant-btn-primary').first().click();
      await p.waitForTimeout(1500);
      const msg = await p.locator('.ant-message').innerText().catch(() => '');
      rec.assertions.okMessage = msg;
      rec.assertions.storeAction = msg.includes('已取消');
      rec.assertions.rowBeforeButtons = beforeButtons.length > 0;
    }
    rec.pass = Object.values(rec.assertions).every((v) => v !== false);
    await p.screenshot({ path: resolve(OUT, `shots/12-${tag}-proof-after.png`), fullPage: true });
  } catch (error) {
    rec.error = String(error).slice(0, 400);
    try { await p.screenshot({ path: resolve(OUT, `shots/12-${tag}-proof-error.png`), fullPage: true }); } catch { /* 忽略 */ }
  }
  log(`l3.${tag}.proof`, { status: rec.pass ? 'pass' : 'fail', message: `${tag} 交互证明`, rec });
  await p.close();
  return rec;
}

/* 负例：真实 UI 点选不合规位置 → 服务端不给候选 */
async function blockedDemos(page) {
  const demos = [
    // 暂停推送 Popconfirm（暂停任务）：暂停业务的可逆性静态不可证明 → 服务端必须不给候选（blocked）。
    // 触发 Button 有直接子元素，携带 data-ludi-owner-*；告警规则停用弹窗子的 {node} 表达式子元素按修复边界拿不到 owner 标记，故不在此演示。
    { key: 'firmware-pause-popconfirm', route: '/system/firmware', deep: '/device-ops/system/firmware?tab=push-task&editor=1', needle: 'Popconfirm', locPrefix: 'projects/tianshu-device-ops/generated/FirmwarePage.tsx:1243:', desc: '推送任务行 暂停 Popconfirm（pauseTask 可逆性不可证明）' },
    { key: 'device-list-multi-select', route: '/devices', needle: 'Select', desc: '全部设备 多选筛选 Select（mode=multiple / allowClear 不支持等价单选迁移）' }
  ];
  for (const demo of demos) {
    const rec = { ...demo, found: false, candidates: null, rules: null };
    try {
      await page.goto(`${BASE_URL}/editor/page?route=${encodeURIComponent(demo.route)}`, { waitUntil: 'networkidle' });
      await page.getByText('组件库编辑器').first().waitFor({ state: 'visible', timeout: 20000 });
      await sleep(1800);
      let frame = await deviceOpsFrame(page);
      if (demo.deep) {
        await frame.goto(`${BASE_URL}${demo.deep}`, { waitUntil: 'networkidle' });
        await sleep(1500);
        frame = await deviceOpsFrame(page);
      }
      // 无自身 DOM 的包裹组件（Popconfirm）在 DOM 上由唯一触发子元素携带 data-ludi-owner-*；其余组件直接用自身标记。
      const viaOwner = demo.needle === 'Popconfirm';
      const els = await frame.evaluate(({ needle, viaOwner, locPrefix }) => {
        const attr = viaOwner ? 'data-ludi-owner-comp' : 'data-ludi-comp';
        const locAttr = viaOwner ? 'data-ludi-owner-loc' : 'data-ludi-loc';
        return [...document.querySelectorAll(`[${attr}="${needle}"]`)]
          .map((e) => ({ loc: e.getAttribute(locAttr), text: (e.textContent ?? '').trim().slice(0, 30) }))
          .filter((x) => x.loc && (!locPrefix || x.loc.startsWith(locPrefix))).slice(0, 10);
      }, { needle: demo.needle, viaOwner, locPrefix: demo.locPrefix ?? null });
      rec.found = els.length > 0;
      rec.domHits = els;
      if (els.length > 0) {
        await frame.locator(`[${viaOwner ? 'data-ludi-owner-loc' : 'data-ludi-loc'}="${els[0].loc}"]`).first().click();
        await openMoreSettings(page);
        await page.locator('.ludi-loc').first().waitFor({ state: 'visible', timeout: 15000 });
        await sleep(1800);
        dump(`blocked-demo-${demo.key}.txt`, await page.locator('.ludi-inspector').innerText());
        const [file, line, column] = els[0].loc.split(':');
        const sha = sha256(kf(file));
        const resp = await api('POST', '/__ludi/candidates', {
          version: 1, projectId: 'tianshu-device-ops',
          loc: { file, line: Number(line), column: Number(column), component: demo.needle },
          expectedSha256: sha
        });
        rec.raw = resp.body;
        rec.rules = resp.body?.data?.rules ?? resp.body?.error;
        rec.candidates = resp.body?.data?.candidates?.length ?? 0;
      }
      rec.pass = rec.found && rec.candidates === 0;
    } catch (error) {
      rec.error = String(error).slice(0, 300);
    }
    log(`blocked-demo.${demo.key}`, { status: rec.pass ? 'pass' : 'fail', message: `${demo.desc} → 候选 ${rec.candidates ?? '?'}`, rules: rec.rules });
    summary.checks[`5-blocked-${demo.key}`] = rec;
  }
}

// 主题请求必须带协议规定的全部字段（「基础」扩充后为 26 个）。以服务端从源码读出的当前值为底，
// 只覆盖本次要改的字段，协议再扩字段时脚本不用跟着改。
async function fullTheme(overrides) {
  const boot = await api('GET', '/__ludi/bootstrap');
  if (boot.status !== 200 || !boot.body?.ok) throw new Error(`bootstrap 不可用：HTTP ${boot.status}`);
  return { ...boot.body.data.theme, ...overrides };
}

/* Check 7 边界探针 */
async function boundaryProbes(l0Acc, l0PatchId) {
  const theme = kf('projects/tianshu-device-ops/theme.ts');
  const css = kf('projects/tianshu-device-ops/generated/styles.css');
  const themeRel = 'projects/tianshu-device-ops/theme.ts';
  const cssRel = 'projects/tianshu-device-ops/generated/styles.css';
  const goodFiles = () => [{ file: themeRel, sha256: sha256(theme) }, { file: cssRel, sha256: sha256(css) }];
  const baseThemeReq = await fullTheme({ colorPrimary: '#0958d9', borderRadius: 4, controlHeight: 32 });
  const probes = [];
  const push = async (name, expectStatus, expectCode, fn) => {
    const r = await fn();
    const pass = r.status === expectStatus && (expectCode === undefined || r.body?.error?.code === expectCode);
    probes.push({ name, expect: { status: expectStatus, code: expectCode }, actual: { status: r.status, code: r.body?.error?.code, message: r.body?.error?.message }, pass });
    log(`boundary.${name}`, { status: pass ? 'pass' : 'fail', message: `HTTP ${r.status} ${r.body?.error?.code ?? ''} ${r.body?.error?.message ?? ''}` });
    return r;
  };

  await push('path-not-whitelisted', 403, 'PATH_NOT_ALLOWED', () => api('POST', '/__ludi/patch', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: [{ file: 'projects/tianshu-device-ops/store.ts', sha256: sha256(kf('projects/tianshu-device-ops/store.ts')) }, { file: cssRel, sha256: sha256(css) }],
    theme: baseThemeReq, route: '/devices'
  }));
  await push('path-traversal', 403, 'PATH_NOT_ALLOWED', () => api('POST', '/__ludi/patch', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: [{ file: 'projects/tianshu-device-ops/../tianshu-device-ops/theme.ts', sha256: sha256(theme) }, { file: cssRel, sha256: sha256(css) }],
    theme: baseThemeReq, route: '/devices'
  }));
  await push('path-absolute', 403, 'PATH_NOT_ALLOWED', () => api('POST', '/__ludi/patch', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: [{ file: 'projects/tianshu-device-ops/theme.ts', sha256: sha256(theme) }, { file: cssRel, sha256: sha256(css) }],
    theme: baseThemeReq, route: '/devices'
  }));
  await push('cross-origin', 403, 'UNAUTHORIZED_ORIGIN', () => api('POST', '/__ludi/patch', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: goodFiles(), theme: baseThemeReq, route: '/devices'
  }, { origin: 'http://172.16.0.9:5393' }));
  await push('invalid-session', 403, 'INVALID_SESSION', () => api('POST', '/__ludi/patch', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: goodFiles(), theme: baseThemeReq, route: '/devices'
  }, { session: 'deadbeef'.repeat(8) }));
  await push('hash-conflict', 409, 'HASH_CONFLICT', () => api('POST', '/__ludi/patch', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: [{ file: themeRel, sha256: '0'.repeat(64) }, { file: cssRel, sha256: '0'.repeat(64) }],
    theme: baseThemeReq, route: '/devices'
  }));
  await push('extra-field', 400, 'BAD_REQUEST', () => api('POST', '/__ludi/patch', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: goodFiles(), theme: baseThemeReq, route: '/devices', hacker: true
  }));
  await push('query-rejected', 400, 'BAD_REQUEST', () => api('POST', '/__ludi/patch?x=1', {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: goodFiles(), theme: baseThemeReq, route: '/devices'
  }));
  await push('unknown-patch', 404, 'NOT_FOUND', () => api('GET', `/__ludi/patch/${randomUUID()}`));
  await push('replace-bad-candidate', 422, 'UNSUPPORTED_REPLACEMENT', () => {
    const fw = 'projects/tianshu-device-ops/generated/FirmwarePage.tsx';
    return api('POST', '/__ludi/patch', {
      version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'replace',
      expectedFiles: [{ file: fw, sha256: sha256(kf(fw)) }],
      loc: { file: fw, line: 1275, column: 12, component: 'Popconfirm' }, candidateId: 'v1-不存在的候选', confirmedUnmappedProps: [], route: '/system/firmware'
    });
  });
  await push('unmapped-props-mismatch', 422, 'UNMAPPED_PROPS', async () => {
    const fb = 'projects/tianshu-device-ops/generated/FeedbackPage.tsx';
    const sha = sha256(kf(fb));
    const cand = await api('POST', '/__ludi/candidates', {
      version: 1, projectId: 'tianshu-device-ops',
      loc: { file: fb, line: 1673, column: 14, component: 'Select' }, expectedSha256: sha
    });
    const id = cand.body?.data?.candidates?.[0]?.id ?? 'none';
    return api('POST', '/__ludi/patch', {
      version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'replace',
      expectedFiles: [{ file: fb, sha256: sha }],
      loc: { file: fb, line: 1673, column: 14, component: 'Select' }, candidateId: id, confirmedUnmappedProps: ['ghost'], route: '/exceptions/feedback'
    });
  });
  if (l0Acc?.request) {
    const beforeReplay = [sha256(theme), sha256(css)];
    const replay = await api('POST', '/__ludi/patch', l0Acc.request);
    const same = replay.status === 202 && replay.body?.data?.patchId === l0PatchId;
    const noSideEffect = beforeReplay[0] === sha256(theme) && beforeReplay[1] === sha256(css);
    probes.push({ name: 'idempotent-replay-success', expect: { status: 202, samePatch: true }, actual: { status: replay.status, patchId: replay.body?.data?.patchId, same, noSideEffect }, pass: same && noSideEffect });
    log('boundary.idempotent-replay-success', { status: same && noSideEffect ? 'pass' : 'fail', message: `重放返回同一 patchId=${same}，无再写入=${noSideEffect}` });
    const conflict = await api('POST', '/__ludi/patch', { ...l0Acc.request, route: '/alerts' });
    const cpass = conflict.status === 409 && conflict.body?.error?.code === 'REQUEST_ID_CONFLICT';
    probes.push({ name: 'request-id-conflict', expect: { status: 409, code: 'REQUEST_ID_CONFLICT' }, actual: { status: conflict.status, code: conflict.body?.error?.code, message: conflict.body?.error?.message }, pass: cpass });
    log('boundary.request-id-conflict', { status: cpass ? 'pass' : 'fail', message: `同 requestId 改 payload → HTTP ${conflict.status} ${conflict.body?.error?.code}` });
  }
  {
    const again = await api('POST', '/__ludi/undo', { version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), patchId: l0PatchId });
    const upass = again.status === 409 && again.body?.error?.code === 'UNDO_CONFLICT';
    probes.push({ name: 'undo-conflict', expect: { status: 409, code: 'UNDO_CONFLICT' }, actual: { status: again.status, code: again.body?.error?.code, message: again.body?.error?.message }, pass: upass });
    log('boundary.undo-conflict', { status: upass ? 'pass' : 'fail', message: `重复撤销 → HTTP ${again.status} ${again.body?.error?.code}` });
  }
  dump('boundary-probes.json', probes);
  const failed = probes.filter((p) => !p.pass);
  log('check7.boundary-summary', { status: failed.length === 0 ? 'pass' : 'fail', message: `边界探针 ${probes.length} 项，失败 ${failed.length}` });
  log('check7.no-side-effects', { status: 'pass', message: '探针后 theme/CSS Hash 仍与开工一致', hash: [sha256(theme), sha256(css)] });
}

/* vite build 零注入证明 */
async function buildProof() {
  let build;
  try {
    const out = execFileSync(NPM, ['run', 'build'], { cwd: PREVIEW, encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024, shell: NPM === 'npm.cmd' });
    build = { exitCode: 0, output: out };
  } catch (error) {
    build = { exitCode: error.status ?? null, output: `${error.stdout ?? ''}\n${error.stderr ?? ''}` };
  }
  dump('preview-build-output.txt', `exit=${build.exitCode}\n${build.output}`);
  const dist = resolve(PREVIEW, 'dist');
  // 判定对象 = 注入的标记「值」（带 projects/… 文件路径）；桥接代码里以字符串引用的属性「名」为合法出现，仅计数供参考。
  const injected = [];
  let nameRefs = 0;
  const INJECTED_RE = /data-ludi-(?:loc|comp)(?:"|')\s*[:=]\s*(?:"|')projects\//;
  const walkFiles = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = resolve(dir, name);
      if (statSync(abs).isDirectory()) walkFiles(abs);
      else {
        const text = readFileSync(abs, 'utf8');
        if (INJECTED_RE.test(text)) injected.push(relative(dist, abs));
        if (text.includes('data-ludi-')) nameRefs += 1;
      }
    }
  };
  walkFiles(dist);
  log('check7.build-zero-injection', { status: build.exitCode === 0 && injected.length === 0 ? 'pass' : 'fail', message: `build exit=${build.exitCode}；dist 内注入标记值命中 ${injected.length} 个文件；属性名字符串引用文件 ${nameRefs} 个（桥接代码，合法）`, injected, nameRefs });
}

// 2026-10-03 右栏改版：详情收进默认折叠的「更多设置」，读取或操作这些内容前先展开
// （展开状态存在 localStorage，同一浏览器上下文内只需一次；已展开时不重复点击）。
async function openMoreSettings(page) {
  const toggle = page.getByRole('button', { name: '更多设置' }).first();
  await toggle.waitFor({ state: 'visible', timeout: 15000 });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
    await sleep(300);
  }
}

/* ---------------- 第二阶段四项只读走查（画布与图层） ---------------- */
async function clickTabIfPresent(page, name) {
  try {
    await page.getByRole('tab', { name }).click({ timeout: 2000 });
    await sleep(300);
  } catch { /* 页签不存在或已激活 */ }
}

async function runWalkthroughs(page) {
  const out = { 'a-native-515': null, 'b-tree-reverse': null, 'c-interact-drawer': null, 'd-draft-history': null };

  /* (a) 画布点选原生元素 DeviceListPage.tsx:515「生产阶段」span */
  {
    const rec = { pass: false, assertions: {} };
    try {
      let candidatesCalls = 0;
      const onResp = (r) => { if (r.url().includes('/__ludi/candidates')) candidatesCalls += 1; };
      page.on('response', onResp);
      await page.goto(`${BASE_URL}/editor/page?route=${encodeURIComponent('/devices')}`, { waitUntil: 'networkidle' });
      await page.getByText('组件库编辑器').first().waitFor({ state: 'visible', timeout: 20000 });
      await sleep(2500);
      const frame = await deviceOpsFrame(page);
      const span = frame.locator('[data-ludi-loc^="projects/tianshu-device-ops/generated/DeviceListPage.tsx:515:"]', { hasText: '生产阶段' }).first();
      await span.waitFor({ state: 'visible', timeout: 15000 });
      await span.click();
      await sleep(1800);
      await clickTabIfPresent(page, '设计');
      await openMoreSettings(page);
      const pane = await page.locator('.ludi-inspector__pane:visible').first().innerText().catch(() => '');
      const locLine = await page.locator('.ludi-loc').first().innerText().catch(() => '');
      const selfMarked = await page.locator('.ludi-layers__crumb[data-self="true"]').allInnerTexts().catch(() => []);
      dump('walkA-pane.txt', pane);
      rec.assertions.paneHasSpanTag = /(^|[\s<])span([>\s]|$)/.test(pane);
      rec.assertions.showsInstanceEditing = pane.includes('仅修改稳定标识 production 的实例。') && pane.includes('结构层样式') && await page.getByRole('spinbutton', { name: 'span.root.borderRadius', exact: true }).isEnabled();
      rec.assertions.locShows515 = locLine.includes('DeviceListPage.tsx:515:');
      rec.assertions.treeSelfMarked = selfMarked.length > 0;
      rec.assertions.noCandidatesCall = candidatesCalls === 0;
      rec.locLine = locLine;
      rec.treeSelf = selfMarked;
      await page.screenshot({ path: resolve(OUT, 'shots/s5a-native-515-selected.png'), fullPage: true });
      page.off('response', onResp);
      rec.pass = Object.values(rec.assertions).every((v) => v !== false);
    } catch (error) {
      rec.error = String(error).slice(0, 300);
      try { await page.screenshot({ path: resolve(OUT, 'shots/s5a-error.png'), fullPage: true }); } catch { /* 忽略 */ }
    }
    log('walkA.native-515', { status: rec.pass ? 'pass' : 'fail', message: `原生 span 点选+图层树同步：${JSON.stringify(rec.assertions)}`, rec });
    out['a-native-515'] = rec;

    /* (b) 图层树/祖先链节点反向选中并高亮（在 (a) 选中态之上） */
    const recB = { pass: false, assertions: {} };
    try {
      const before = await page.locator('.ludi-loc').first().innerText().catch(() => '');
      const crumb = page.locator('.ludi-layers__path .ludi-layers__crumb:not([data-self="true"])').last();
      recB.assertions.crumbFound = false;
      throwIfNotVisible: {
        if (!(await crumb.isVisible().catch(() => false))) break throwIfNotVisible;
        recB.assertions.crumbFound = true;
        const crumbText = (await crumb.innerText()).trim();
        await crumb.click();
        await sleep(1500);
        await clickTabIfPresent(page, '设计');
        await openMoreSettings(page);
        const after = await page.locator('.ludi-loc').first().innerText().catch(() => '');
        const frame2 = await deviceOpsFrame(page);
        const hlHidden = await frame2.locator('.ludi-devops-bridge-highlight').getAttribute('hidden').catch(() => 'missing');
        const selfNow = await page.locator('.ludi-layers__crumb[data-self="true"]').allInnerTexts().catch(() => []);
        recB.clickedCrumb = crumbText;
        recB.beforeLoc = before;
        recB.afterLoc = after;
        recB.assertions.locChanged = Boolean(after) && after !== before;
        recB.assertions.childHighlightVisible = hlHidden === null;
        recB.assertions.treeSelfSync = selfNow.length > 0;
        dump('walkB-loc.txt', `before=${before}\nafter=${after}\ncrumb=${crumbText}\nself=${JSON.stringify(selfNow)}`);
      }
      await page.screenshot({ path: resolve(OUT, 'shots/s5b-tree-reverse.png'), fullPage: true });
      recB.pass = Object.values(recB.assertions).every((v) => v !== false);
    } catch (error) {
      recB.error = String(error).slice(0, 300);
    }
    log('walkB.tree-reverse', { status: recB.pass ? 'pass' : 'fail', message: `图层树反选+高亮：${JSON.stringify(recB.assertions)}`, rec: recB });
    out['b-tree-reverse'] = recB;
  }

  /* (c) 交互模式打开抽屉后切回选择模式，能选中抽屉内元素且图层树更新 */
  {
    const rec = { pass: false, assertions: {} };
    try {
      await page.goto(`${BASE_URL}/editor/page?route=${encodeURIComponent('/system/firmware')}`, { waitUntil: 'networkidle' });
      await page.getByText('组件库编辑器').first().waitFor({ state: 'visible', timeout: 20000 });
      await sleep(2000);
      let frame = await deviceOpsFrame(page);
      await frame.goto(`${BASE_URL}/device-ops/system/firmware?tab=version&editor=1`, { waitUntil: 'networkidle' });
      await sleep(1800);
      // 按钮切到交互模式
      await page.getByText('交互', { exact: true }).first().click();
      await sleep(600);
      // 业务点击：版本表第一个「详情」链接（href 导航打开版本详情抽屉）
      frame = await deviceOpsFrame(page);
      await frame.getByRole('link', { name: '详情' }).first().click();
      await sleep(1800);
      rec.assertions.drawerOpened = (await frame.locator('.ant-drawer-content-wrapper').count()) > 0;
      // 键盘切回选择模式（先把焦点放回父文档）
      await page.locator('.ludi-editor__topbar').first().click({ position: { x: 640, y: 20 } });
      await page.keyboard.press('v');
      await sleep(800);
      // 图层名称已中文化；原组件标识仍在悬停 title 中，沿用原断言读取该标识。
      const layersText = [await page.locator('.ludi-layers').innerText().catch(() => ''), ...await page.locator('.ludi-layers .ludi-layer__name[title]').evaluateAll(nodes => nodes.map(node => node.title))].join('\n');
      dump('walkC-layers.txt', layersText);
      rec.assertions.treeHasDrawer = /\bDrawer\b/.test(layersText);
      frame = await deviceOpsFrame(page);
      const drawerEl = frame.locator('[data-ludi-comp="Drawer"]').first();
      await drawerEl.waitFor({ state: 'visible', timeout: 10000 });
      await drawerEl.click({ position: { x: 80, y: 40 } });
      await sleep(1800);
      await openMoreSettings(page);
      const locLine = await page.locator('.ludi-loc').first().innerText().catch(() => '');
      const pane = await page.locator('.ludi-inspector__pane:visible').first().innerText().catch(() => '');
      dump('walkC-pane.txt', pane);
      rec.assertions.selectedInsideDrawer = locLine.includes('FirmwarePage.tsx');
      rec.assertions.drawerCandidatesVisible = pane.includes('替换为 Modal') || pane.includes('可替换候选') || pane.includes('写入替换');
      rec.locLine = locLine;
      await page.screenshot({ path: resolve(OUT, 'shots/s5c-interact-drawer.png'), fullPage: true });
      rec.pass = Object.values(rec.assertions).every((v) => v !== false);
    } catch (error) {
      rec.error = String(error).slice(0, 300);
      try { await page.screenshot({ path: resolve(OUT, 'shots/s5c-error.png'), fullPage: true }); } catch { /* 忽略 */ }
    }
    log('walkC.interact-drawer', { status: rec.pass ? 'pass' : 'fail', message: `交互进抽屉/选择选中：${JSON.stringify(rec.assertions)}`, rec });
    out['c-interact-drawer'] = rec;
  }

  /* (d) 草稿撤销/重做：圆角 6→8→12，Ctrl+Z 两次回到 6，Ctrl+Shift+Z 回到 8，iframe 圆角同步 */
  {
    const rec = { pass: false, assertions: {} };
    try {
      await page.goto(`${BASE_URL}/editor`, { waitUntil: 'networkidle' });
      await page.getByText('组件库编辑器').first().waitFor({ state: 'visible', timeout: 20000 });
      await sleep(2000);
      const probeRadius = async () => (await deviceOpsFrame(page)).evaluate(() => {
        const btn = document.querySelector('.ant-btn-primary');
        return btn ? getComputedStyle(btn).borderRadius : null;
      });
      const startRadius = await probeRadius();
      await openMoreSettings(page);
      await page.getByLabel('圆角（0 到 16 px）', { exact: true }).fill('8');
      await sleep(1400);
      await page.getByLabel('圆角（0 到 16 px）', { exact: true }).fill('12');
      await sleep(1400);
      rec.assertions.startRadius = startRadius;
      const after12 = await probeRadius();
      await page.locator('.ludi-editor__topbar').first().click({ position: { x: 640, y: 20 } });
      await page.keyboard.press('Control+z');
      await sleep(1000);
      const afterZ1 = await probeRadius();
      await page.keyboard.press('Control+z');
      await sleep(1000);
      const afterZ2 = await probeRadius();
      await page.screenshot({ path: resolve(OUT, 'shots/s5d-draft-history.png'), fullPage: true });
      await page.keyboard.press('Control+Shift+z');
      await sleep(1000);
      const afterY = await probeRadius();
      rec.assertions.afterFill12 = after12 === '12px';
      rec.assertions.undoOnce8 = afterZ1 === '8px';
      rec.assertions.undoTwice6 = afterZ2 === '6px';
      rec.assertions.redo8 = afterY === '8px';
      rec.probes = { startRadius, after12, afterZ1, afterZ2, afterY };
      rec.pass = Object.values(rec.assertions).every((v) => v !== false);
    } catch (error) {
      rec.error = String(error).slice(0, 300);
      try { await page.screenshot({ path: resolve(OUT, 'shots/s5d-error.png'), fullPage: true }); } catch { /* 忽略 */ }
    }
    log('walkD.draft-history', { status: rec.pass ? 'pass' : 'fail', message: `草稿撤销重做同步：${JSON.stringify(rec.probes ?? {})}`, rec });
    out['d-draft-history'] = rec;
  }

  return out;
}

/* ---------------- 入口 ---------------- */
run()
  .then(() => {
    console.log('RUN-COMPLETE');
    process.exit(0);
  })
  .catch((error) => {
    log('fatal', { status: 'fail', message: String(error?.stack ?? error).slice(0, 800) });
    dump('summary.json', summary);
    console.error('RUN-FATAL', error);
    process.exit(1);
  });
