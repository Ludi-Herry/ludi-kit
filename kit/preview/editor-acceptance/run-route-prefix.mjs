// 小豆盒页面内导航必须带 /device-ops 前缀（2026-10-02 F2 修复的回归断言）。
// useRouter() 给出的 pathname 是去掉前缀的内层路径，拼进 navigate() 前要经 appPath()；
// 漏掉时直接打开固件页、或在加载失败态点「重试」会跳出小豆盒外壳。
// 用法：先起 kit/preview dev（127.0.0.1，端口取 LUDI_EDITOR_PORT，默认 5393），再
//   LUDI_EDITOR_PORT=5410 node editor-acceptance/run-route-prefix.mjs
// 只读：不写任何源码。

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE_URL = `http://127.0.0.1:${process.env.LUDI_EDITOR_PORT || 5393}`;
const require = createRequire(resolve(KIT, 'package.json'));
const { chromium } = require('@playwright/test');

let failed = 0;
function log(step, ok, message) {
  if (!ok) failed++;
  console.log(`[${step}] ${ok ? 'pass' : 'FAIL'} ${message}`);
}

const path = (page) => {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
};

async function clickRetry(page) {
  // antd 两字按钮会在字间插空格，按去空白后的文字匹配。
  const retry = page.locator('button').filter({ hasText: /重\s*试/ }).first();
  await retry.waitFor({ state: 'visible', timeout: 15000 });
  await retry.click();
  await page.waitForTimeout(800);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));

  // 1. 直接打开固件页（无 tab）：补 ?tab=version 后仍在 /device-ops 下，刷新后仍在小豆盒外壳内。
  // 跳出外壳后主标题不会出现，超时记为失败并继续后面的检查，不让脚本直接崩掉。
  await page.goto(`${BASE_URL}/device-ops/system/firmware`, { waitUntil: 'networkidle' });
  await page.locator('h1', { hasText: '固件与推送' }).waitFor({ timeout: 10000 }).catch(() => {});
  const landed = path(page);
  await page.reload({ waitUntil: 'networkidle' });
  const heading = await page.locator('h1').first().innerText({ timeout: 10000 }).catch(() => '（无主标题）');
  log('firmware.direct-open', landed === '/device-ops/system/firmware?tab=version' && path(page) === landed && heading.includes('固件与推送'), `落地 ${landed}；刷新后 ${path(page)}；主标题「${heading}」`);

  // 2. 工作台、设备详情加载失败态点「重试」：去掉 dataState 后仍在原页面。
  for (const [name, start, expected] of [
    ['dashboard.retry', '/device-ops/dashboard?dataState=error', '/device-ops/dashboard'],
    ['device-detail.retry', '/device-ops/devices/TS24070101?dataState=error', '/device-ops/devices/TS24070101']
  ]) {
    await page.goto(`${BASE_URL}${start}`, { waitUntil: 'networkidle' });
    const clicked = await clickRetry(page).then(() => true, () => false);
    log(name, clicked && path(page) === expected, clicked ? `重试后 ${path(page)}（应为 ${expected}）` : '没有找到「重试」按钮');
  }
} finally {
  await browser.close();
}
log('pageerror', errors.length === 0, `pageerror ${errors.length} 条`);
console.log(failed === 0 ? 'ROUTE-PREFIX-PASS' : `ROUTE-PREFIX-FAIL ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
