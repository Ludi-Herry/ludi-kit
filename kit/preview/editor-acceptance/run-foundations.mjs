// 「基础」变量扩充验收（主线程 2026-10-01）：补 run-acceptance.mjs 没覆盖的新字段。
// 依据 kit/preview/editor-dispatch/K-foundations-expansion.md 与交回记录里的「验收脚本需要新增的检查项」。
// 用法：先起 kit/preview dev（127.0.0.1，端口取 LUDI_EDITOR_PORT，默认 5393），再
//   LUDI_EDITOR_PORT=5410 node editor-acceptance/run-foundations.mjs
// 真实写回只经编辑器接口，每次写入后立即撤销并核对 Hash；结束时小豆盒 38 个基线文件必须全部一致。

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const PREVIEW = resolve(HERE, '..');
const KIT = resolve(PREVIEW, '..');
const REPO = resolve(KIT, '..');
const BASE_URL = `http://127.0.0.1:${process.env.LUDI_EDITOR_PORT || 5393}`;
const OUT = resolve(KIT, `projects/tianshu-device-ops/evidence/editor/c-acceptance-2026-10-02-foundations-${Date.now()}`);
mkdirSync(resolve(OUT, 'shots'), { recursive: true });

const THEME = 'projects/tianshu-device-ops/theme.ts';
const CSS = 'projects/tianshu-device-ops/generated/styles.css';
const kf = (rel) => resolve(KIT, rel);
const sha256 = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');
const read = (rel) => readFileSync(kf(rel), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const records = [];
let failed = 0;
function log(step, ok, message, extra = {}) {
  const rec = { t: new Date().toISOString(), step, status: ok ? 'pass' : 'fail', message, ...extra };
  records.push(rec);
  if (!ok) failed++;
  console.log(`[${step}] ${ok ? 'pass' : 'FAIL'} ${message}`);
}

let sessionToken = null;
async function api(method, path, body) {
  const headers = { Accept: 'application/json', Origin: BASE_URL };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (sessionToken) headers['X-Ludi-Session'] = sessionToken;
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 保留 text */ }
  return { status: res.status, body: json, text: json ? undefined : text.slice(0, 400) };
}

async function bootstrap() {
  const boot = await api('GET', '/__ludi/bootstrap');
  if (boot.status !== 200 || !boot.body?.ok) throw new Error(`bootstrap 不可用：HTTP ${boot.status}`);
  sessionToken = boot.body.data.sessionToken;
  return boot.body.data;
}

const fileHashes = () => [THEME, CSS].map((file) => ({ file, sha256: sha256(kf(file)) }));
const sameHashes = (a, b) => a.every((x, i) => x.sha256 === b[i].sha256);

function baselineDiff() {
  const baseline = JSON.parse(readFileSync(resolve(PREVIEW, 'editor-dispatch/baseline.json'), 'utf8')).files;
  return baseline.filter((f) => sha256(resolve(REPO, f.file)) !== f.sha256).map((f) => f.file);
}

async function themeRequest(overrides) {
  const boot = await bootstrap();
  return {
    version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), kind: 'theme',
    expectedFiles: fileHashes(), theme: { ...boot.theme, ...overrides }, route: '/devices'
  };
}

async function pollPatch(id, timeoutMs = 15 * 60 * 1000) {
  const started = Date.now();
  for (;;) {
    const r = await api('GET', `/__ludi/patch/${id}`);
    if (r.status !== 200 || !r.body?.ok) throw new Error(`轮询 Patch ${id} 失败：HTTP ${r.status}`);
    if (r.body.data.status !== 'checking') return r.body.data;
    if (Date.now() - started > timeoutMs) throw new Error(`Patch ${id} 超时未到终态`);
    await sleep(3000);
  }
}

// 不该写入的请求：断言状态码 / 错误码，且两份文件字节不变。
async function expectRejected(step, overrides, status, code) {
  const before = fileHashes();
  const req = await themeRequest(overrides);
  const r = await api('POST', '/__ludi/patch', req);
  const after = fileHashes();
  const ok = r.status === status && r.body?.error?.code === code && sameHashes(before, after);
  log(step, ok, `HTTP ${r.status} ${r.body?.error?.code ?? ''} ${r.body?.error?.message ?? ''}；文件未变=${sameHashes(before, after)}`);
}

// 写入 → 检查终态 → 断言落点 → 撤销 → 断言字节复原。
async function writeAndUndo(tag, overrides, assertions) {
  const before = fileHashes();
  const req = await themeRequest(overrides);
  const accepted = await api('POST', '/__ludi/patch', req);
  if (accepted.status !== 202) {
    log(`${tag}.accepted`, false, `HTTP ${accepted.status} ${JSON.stringify(accepted.body?.error ?? accepted.text)}`);
    return;
  }
  const patch = await pollPatch(accepted.body.data.patchId);
  writeFileSync(resolve(OUT, `patch-${tag}.json`), JSON.stringify(patch, null, 2));
  log(`${tag}.checks`, patch.status === 'checks-passed', `Patch ${patch.id} 终态=${patch.status}；${patch.checks.map((c) => `${c.id}:${c.exitCode}`).join(' ')}`);
  const theme = read(THEME), css = read(CSS);
  for (const [name, ok] of assertions(theme, css, patch)) log(`${tag}.${name}`, ok, ok ? '落点正确' : '落点不符');
  const undo = await api('POST', '/__ludi/undo', { version: 1, projectId: 'tianshu-device-ops', requestId: randomUUID(), patchId: patch.id });
  if (undo.status !== 202) {
    log(`${tag}.undo`, false, `HTTP ${undo.status} ${JSON.stringify(undo.body?.error ?? undo.text)}`);
    return;
  }
  const undone = await pollPatch(undo.body.data.patchId);
  const restored = sameHashes(before, fileHashes());
  log(`${tag}.undo`, undone.status === 'checks-passed' && restored, `撤销 ${undone.id} 终态=${undone.status}；字节复原=${restored}`);
}

const has = (text, pattern) => (pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern));

async function main() {
  const startDiff = baselineDiff();
  log('baseline.start', startDiff.length === 0, `开工基线差异 ${startDiff.length}`);
  const boot = await bootstrap();
  writeFileSync(resolve(OUT, 'bootstrap.json'), JSON.stringify({ theme: boot.theme, foundations: boot.foundations }, null, 2));

  // 1. 字段与只读信息
  log('protocol.fields', Object.keys(boot.theme).length === 26, `主题字段 ${Object.keys(boot.theme).length} 个`);
  const icons = boot.foundations?.icons, grid = boot.foundations?.grid;
  const iconCount = icons?.files?.reduce((sum, f) => sum + f.count, 0) ?? 0;
  log('foundations.icons', icons?.library === '@ant-design/icons' && icons.files.length > 0 && iconCount > 0, `${icons?.library} · ${icons?.files?.length} 个文件 · ${iconCount} 处`);
  log('foundations.grid', grid?.breakpoints?.length === 6 && grid.siderWidth === 232 && grid.contentMaxWidth === 1440, `断点 ${grid?.breakpoints?.map((b) => b.px).join('/')}；侧栏 ${grid?.siderWidth}；内容最大宽 ${grid?.contentMaxWidth}`);

  // 2. 拒绝路径（不写文件）
  await expectRejected('reject.font-semicolon', { fontFamily: 'Inter; color: red' }, 400, 'BAD_REQUEST');
  await expectRejected('reject.font-url', { fontFamily: 'url(x), sans-serif' }, 400, 'BAD_REQUEST');
  await expectRejected('reject.lineHeight', { lineHeight: 2.1 }, 400, 'BAD_REQUEST');
  await expectRejected('reject.space-order', { spaceSm: 20, spaceMd: 16 }, 400, 'BAD_REQUEST');
  await expectRejected('reject.lineWidth', { lineWidth: 4 }, 400, 'BAD_REQUEST');
  await expectRejected('reject.motionUnit', { motionUnit: 0.21 }, 400, 'BAD_REQUEST');
  await expectRejected('reject.sizeUnit-fraction', { sizeUnit: 4.5 }, 400, 'BAD_REQUEST');
  await expectRejected('reject.colorError-failing', { colorError: '#faad14' }, 422, 'RULE_FAILED');
  await expectRejected('reject.colorText-failing', { colorText: '#ffffff' }, 422, 'RULE_FAILED');
  await expectRejected('reject.colorBgBase-failing', { colorBgBase: '#303030' }, 422, 'RULE_FAILED');

  // 3. 写入 A：文字与边框色、三档间距、代码字体（缺通用族自动补）、行高、间距步长；colorError 保持现状不达标只提示
  await writeAndUndo('write-a', {
    colorText: '#111827', colorBorder: '#cbd5e1', spaceSm: 8, spaceMd: 16, spaceLg: 32,
    fontFamilyCode: "'Cascadia Code', Consolas", lineHeight: 1.6, sizeStep: 5
  }, (theme, css, patch) => [
    ['colorText', has(theme, /colorText:\s*"#111827"/) && has(css, /--do-text:\s*#111827/)],
    ['colorBorder', has(theme, /colorBorder:\s*"#cbd5e1"/) && has(css, /--do-border:\s*#cbd5e1/)],
    ['space', has(css, /--do-space-sm:\s*8px/) && has(css, /--do-space-md:\s*16px/) && has(css, /--do-space-lg:\s*32px/)],
    ['fontFamilyCode-fallback', has(theme, /fontFamilyCode:\s*".*Cascadia Code.*Consolas, monospace"/)],
    ['lineHeight', has(theme, /lineHeight:\s*1\.6\b/)],
    ['sizeStep', has(theme, /sizeStep:\s*5\b/)],
    ['colorError-unchanged-hint', patch.rules.some((r) => r.status === 'pass' && /colorError/.test(r.id) && r.suggestedValue)]
  ]);

  // 4. 写入 B：大圆角、线宽、阴影深档、关闭动效、动效快慢、合规的错误色
  await writeAndUndo('write-b', {
    borderRadiusLG: 12, lineWidth: 2, shadowLevel: 'deep', motion: false, motionUnit: 0.15, colorError: '#cf1322'
  }, (theme) => [
    ['borderRadiusLG', has(theme, /borderRadiusLG:\s*12\b/)],
    ['lineWidth', has(theme, /lineWidth:\s*2\b/)],
    ['shadow-deep', has(theme, /boxShadow:\s*"/) && has(theme, /boxShadowSecondary:\s*"/)],
    ['motion', has(theme, /motion:\s*false/) && has(theme, /motionUnit:\s*0\.15\b/)],
    ['colorError', has(theme, /colorError:\s*"#cf1322"/)]
  ]);

  // 5. 界面：六个分组可达、只读分组不出现还原按钮
  const require = createRequire(resolve(KIT, 'package.json'));
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  try {
    for (const width of [1440, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 800 } });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${BASE_URL}/editor`, { waitUntil: 'networkidle' });
      await page.getByText('组件库编辑器', { exact: true }).first().waitFor();
      for (const [label, readonly] of [['颜色', false], ['文字', false], ['图标', true], ['间距', false], ['圆角与效果', false], ['布局栅格', true]]) {
        await page.locator('.ludi-editor__panel--left button', { hasText: label }).first().click();
        await sleep(500);
        const cards = await page.locator('.ludi-card, .ludi-ruler, .ludi-icon-table').count();
        const reset = await page.getByRole('button', { name: '全部还原为项目当前值' }).count();
        const ok = cards > 0 && (readonly ? reset === 0 : reset > 0);
        log(`ui.${width}.${label}`, ok, `卡片 ${cards}；还原按钮 ${reset}（只读分组应为 0）`);
        await page.screenshot({ path: resolve(OUT, `shots/${label}-${width}.png`) });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  log('ui.console', errors.length === 0, `console / pageerror ${errors.length} 条`, { errors: errors.slice(0, 5) });

  const endDiff = baselineDiff();
  log('baseline.end', endDiff.length === 0, `终态基线差异 ${endDiff.length}`, { files: endDiff });
  writeFileSync(resolve(OUT, 'run-log.json'), JSON.stringify({ baseUrl: BASE_URL, failed, records }, null, 2));
  console.log(failed === 0 ? 'FOUNDATIONS-PASS' : `FOUNDATIONS-FAIL ${failed}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
