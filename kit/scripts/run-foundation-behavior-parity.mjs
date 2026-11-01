#!/usr/bin/env node
// 三端统一行为断言（2026-10-13 第 5 阶段 5.3b 起为门禁：任一底座对齐后有失败即退出 1；由 npm run check:foundation-parity 串联，不接入 validate）。
// 同一组断言在各底座原样跑；定位只用文字、角色、URL，不用组件库类名。
// 取值类断言（如「共 N 条」、置灰数量）以 baseline 底座的值为准，其他底座必须取得同值。
// 合并自 shadcn / CloudAI / HiUI 换底座时各自的断言集（2026-10-04～06），口径改为以 antd 行为为准。
//
// 用法：node scripts/run-foundation-behavior-parity.mjs --config quality/foundation-parity/routes.tianshu.json --out <目录> [--only antd,shadcn]
//        同命令加 --self-check：只跑 baseline 底座的 /dashboard 一条路由，并注入一条必然失败的断言，检查报告会如实记 fail
// 退出码：0 = 各底座对齐后全部通过（--self-check 抓到注入失败也是 0）；1 = 有底座未全过 / --self-check 漏报；2 = 输入或运行错误。

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(KIT, 'package.json'));
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), all[i + 1]]);
  return acc;
}, []));
if (!args.config || !args.out) {
  console.error('需要 --config 与 --out');
  process.exit(2);
}
const configRaw = readFileSync(resolve(KIT, args.config), 'utf8');
const cfg = JSON.parse(configRaw);
const outDir = resolve(KIT, args.out);
mkdirSync(outDir, { recursive: true });
const only = args.only ? args.only.split(',') : null;
const SN = 'TS24080192';

const TITLES = {
  '/dashboard': '工作台', '/devices': '全部设备', [`/devices/${SN}`]: SN, '/alerts': '告警处置',
  '/lifecycle/passport': '数字护照', [`/lifecycle/passport/${SN}`]: SN, '/exceptions/rma': '退货RMA',
  '/system/firmware': '固件与推送', '/system/firmware/new': '新建固件版本', '/lifecycle/flashing': '烧录发证',
  '/lifecycle/flashing/new': '新建烧录任务', '/exceptions/feedback': '客户反馈', '/system/alert-rules': '告警规则',
  '/users/binding': '用户与绑定'
};

// ---------- 页面内工具（序列化进浏览器执行） ----------
const IN_PAGE = `
window.__bp = (() => {
  const norm = (s) => (s || '').replace(/\\s+/g, '');
  const visible = (el) => { if (!el) return false; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0; };
  const ownText = (e) => norm([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''));
  const holders = (t) => [...document.querySelectorAll('body *')].filter((e) => visible(e) && ownText(e).startsWith(norm(t)));
  const clickable = 'button,[role=button],[role=radio],[role=tab],[role=checkbox],[role=switch],label,a,[tabindex]';
  const inMain = (e) => { const b = e.getBoundingClientRect(); return b.x + scrollX >= 240 && b.y + scrollY >= 56; };
  // 优先选可点击、整体文字以目标开头的元素（分栏「已停用（1）」优先于表格里的状态 Tag「已停用」）。
  const option = (t) => {
    const n = norm(t);
    const hs = holders(t).filter(inMain);
    const cs = hs.map((h) => h.closest(clickable)).filter(Boolean);
    const c = cs.find((e) => norm(e.textContent) === n) || cs.find((e) => norm(e.textContent).startsWith(n) && norm(e.textContent).length <= n.length + 8);
    if (c) return c;
    const h = hs.find((e) => ownText(e) === n) || hs[0];
    return h ? (h.closest(clickable) || h) : null;
  };
  const selected = (el) => {
    if (!el) return false;
    const cands = [el, el.parentElement, el.parentElement && el.parentElement.parentElement, ...el.querySelectorAll('*')].filter(Boolean);
    const aria = cands.some((c) => c.getAttribute && (c.getAttribute('aria-checked') === 'true' || c.getAttribute('aria-pressed') === 'true' || c.getAttribute('aria-selected') === 'true' || /^(on|active|checked)$/.test(c.getAttribute('data-state') || '') || (c.matches && c.matches('input:checked'))));
    if (aria) return true;
    // 退路：没有 ARIA 选中标记的组件库（如 HiUI 分栏）按类名里的 active / selected / checked 判断。
    return [el, el.parentElement].filter(Boolean).some((c) => /(^|[-_\\s])(active|selected|checked)($|[-_\\s])/.test(typeof c.className === 'string' ? c.className : ''));
  };
  // 带计数的分栏项：「全部(11)」优先于同名的筛选下拉「全部」。
  const countedOption = (t) => {
    const re = new RegExp('^' + norm(t) + '[（(]\\\\d+[）)]$');
    const c = [...document.querySelectorAll(clickable)].filter((e) => visible(e) && inMain(e)).find((e) => re.test(norm(e.textContent)));
    return c || option(t);
  };
  // 数据行：排除表头测量行（无数字）与空态行。
  const rows = () => { const trs = [...document.querySelectorAll('tbody tr')].filter((tr) => tr.querySelector('td') && visible(tr.querySelector('td')) && !/暂无/.test(tr.textContent) && /\\d/.test(tr.textContent) && tr.getAttribute('aria-hidden') !== 'true'); return trs.length ? trs : [...document.querySelectorAll('[role=row]')].filter((r) => r.querySelector('[role=cell],[role=gridcell]')); };
  const textVisible = (re) => [...document.querySelectorAll('body *')].some((e) => visible(e) && re.test(e.textContent || '') && [...e.children].every((c) => !re.test(c.textContent || '')));
  const firstText = (re) => { const m = [...document.querySelectorAll('body *')].filter((e) => visible(e) && re.test(e.textContent || '')).sort((a, b) => a.textContent.length - b.textContent.length)[0]; return m ? m.textContent.trim() : null; };
  return { norm, visible, holders, option, countedOption, selected, rows, textVisible, firstText };
})();
`;

// ---------- 断言定义 ----------
const countOf = (s) => { const m = /共\s*(\d+)\s*条/.exec(s || ''); return m ? Number(m[1]) : null; };

async function go(page, base, path) {
  await page.goto(`${base}${cfg.basePath}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.addScriptTag({ content: IN_PAGE });
  await page.waitForTimeout(600);
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
async function clickOption(page, text) {
  const h = await page.evaluateHandle((t) => window.__bp.option(t), text);
  const el = h.asElement();
  if (!el) throw new Error(`找不到「${text}」`);
  try {
    await el.click({ timeout: 5000 });
  } catch {
    // 卡片上常盖一层透明跳转按钮，Playwright 会判为被遮挡；改用鼠标点中心，与真人点击一致。
    const b = await el.boundingBox();
    if (!b) throw new Error(`「${text}」不可点击`);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
  await page.waitForTimeout(500);
}
async function textVisible(page, source) {
  return ev(page, (src) => window.__bp.textVisible(new RegExp(src)), source);
}
async function selectFirstRow(page) {
  // 只点第一条数据行里的复选框（antd 的全选框也可能落在 tbody 里）。
  const h = await page.evaluateHandle(() => { const r = window.__bp.rows()[0]; return r ? r.querySelector('input[type=checkbox],[role=checkbox]') : null; });
  const el = h.asElement();
  if (!el) throw new Error('首行没有复选框');
  await el.click({ force: true });
  await page.waitForTimeout(500);
}
async function lastRowChecks(page, barSrc) {
  await selectFirstRow(page);
  const bar = await textVisible(page, barSrc);
  const geo = await ev(page, (src) => {
    const re = new RegExp(src);
    const rs = window.__bp.rows();
    const last = rs[rs.length - 1];
    if (!last) return null;
    // 把末行所在的可滚动容器和窗口都滚到底，模拟用户滚到列表最后。
    for (let el = last.parentElement; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    // 批量条取最靠下的匹配（工具栏小计里也有「已选 N 项」）。
    const matches = [...document.querySelectorAll('body *')].filter((e) => window.__bp.visible(e) && re.test(e.textContent || '') && ![...e.children].some((c) => re.test(c.textContent || '')));
    const barEl = matches.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    const lb = last.getBoundingClientRect();
    const bb = barEl ? barEl.getBoundingClientRect() : null;
    const link = [...last.querySelectorAll('a,button,[role=link]')].find((a) => /^TS\d+/.test((a.textContent || '').trim()));
    return { rowBottom: Math.round(lb.bottom), barTop: bb ? Math.round(bb.top) : null, vh: innerHeight, sn: link ? link.textContent.trim() : null };
  }, barSrc);
  return { bar, geo };
}

function buildAssertions() {
  const A = [];
  const add = (route, name, run, opts = {}) => A.push({ id: `${route}>${name}`, route, run, ...opts });

  for (const [path, title] of Object.entries(TITLES)) {
    add(path, '主标题', async (p, b) => { await go(p, b, path); const h = await ev(p, () => window.__bp.norm(document.querySelector('h1')?.textContent)); return { pass: h === title, detail: `h1=${h ?? '无'}` }; });
    for (const w of [1440, 1024]) {
      add(path, `无横向溢出@${w}`, async (p, b) => { await p.setViewportSize({ width: w, height: 900 }); await go(p, b, path); const r = await ev(p, () => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); await p.setViewportSize({ width: 1440, height: 900 }); return { pass: r.sw <= r.cw, detail: `scrollWidth=${r.sw} clientWidth=${r.cw}` }; });
    }
  }

  add('/dashboard', '离线告警卡直达告警处置', async (p, b) => { await go(p, b, '/dashboard'); await clickOption(p, '离线告警'); await p.waitForTimeout(500); const u = p.url(); return { pass: /\/alerts\?status=open/.test(u), detail: u.replace(b, '') }; });

  add('/devices', '视图切换恰一项选中且为运行异常', async (p, b) => {
    await go(p, b, '/devices');
    const r = await ev(p, () => ['全部设备', '运行异常', '售后中', '待出货'].map((t) => [t, window.__bp.selected(window.__bp.option(t))]));
    const on = r.filter(([, s]) => s).map(([t]) => t);
    return { pass: on.length === 1 && on[0] === '运行异常', detail: `选中=${on.join(',') || '无'}` };
  });
  add('/devices', '阶段卡恰一项选中', async (p, b) => {
    await go(p, b, '/devices');
    const r = await ev(p, () => ['全部', '生产阶段', '运行阶段', '售后阶段'].map((t) => { const h = window.__bp.holders(t).find((e) => /^(全部|生产阶段|运行阶段|售后阶段)\d*$/.test(window.__bp.norm(e.closest('button,[role=button],[aria-pressed],label,[tabindex]')?.textContent || e.textContent))); const el = h ? (h.closest('button,[role=button],[aria-pressed],label,[tabindex]') || h) : null; return [t, window.__bp.selected(el)]; }));
    const on = r.filter(([, s]) => s).map(([t]) => t);
    return { pass: on.length === 1, detail: `选中=${on.join(',') || '无'}`, value: on.join(',') };
  });
  add('/devices', '查询后显示总数', async (p, b) => { await go(p, b, '/devices'); await clickOption(p, '查询'); const t = await ev(p, () => window.__bp.firstText(/共\s*\d+\s*条/)); const n = countOf(t); return { pass: n !== null, detail: `共 ${n} 条`, value: n }; });

  // barSrc：该页 antd 批量条文案（正则源串）。
  const listChecks = (path, barSrc) => {
    add(path, '勾选浮出批量条', async (p, b) => { await go(p, b, path); await selectFirstRow(p); const v = await textVisible(p, barSrc); return { pass: v, detail: `批量条 /${barSrc}/ 可见=${v}` }; });
    add(path, '末行完整露出且不被批量条遮挡', async (p, b) => { await go(p, b, path); const { bar, geo } = await lastRowChecks(p, barSrc); const ok = bar && geo && geo.rowBottom <= geo.vh && (geo.barTop === null || geo.rowBottom <= geo.barTop + 1); return { pass: !!ok, detail: JSON.stringify(geo) }; });
    add(path, '末行 SN 一次直达设备详情', async (p, b) => {
      await go(p, b, path);
      const { geo } = await lastRowChecks(p, barSrc);
      if (!geo?.sn) return { pass: false, detail: '末行没有 SN 链接' };
      await p.locator('tbody tr, [role=row]').filter({ hasText: geo.sn }).last().getByText(geo.sn, { exact: true }).first().click();
      await p.waitForTimeout(700);
      const u = p.url();
      return { pass: u.includes(`/devices/${geo.sn}`), detail: `${geo.sn} → ${u.replace(b, '')}` };
    });
  };
  listChecks('/devices', '^已选\\s*1\\s*项');

  add(`/devices/${SN}`, '发起 RMA 弹窗含退货原因', async (p, b) => { await go(p, b, `/devices/${SN}`); await clickOption(p, '发起 RMA'); const v = await textVisible(p, '退货原因'); return { pass: v, detail: `退货原因可见=${v}` }; });

  add('/lifecycle/flashing/new', '空表单下一步被拦截', async (p, b) => { await go(p, b, '/lifecycle/flashing/new'); await clickOption(p, '下一步'); const v = await textVisible(p, '请(选择|输入|填写)'); return { pass: v, detail: `校验提示可见=${v}` }; });

  add('/lifecycle/passport', 'SN 前缀查询总数', async (p, b) => {
    await go(p, b, '/lifecycle/passport');
    const input = p.locator('input[placeholder*="SN"]').first();
    await input.fill('TS2408');
    await clickOption(p, '查询');
    const t = await ev(p, () => window.__bp.firstText(/共\s*\d+\s*条/));
    const n = countOf(t);
    return { pass: n !== null, detail: `共 ${n} 条`, value: n };
  });
  listChecks('/lifecycle/passport', '已选择\\s*1\\s*台设备');

  add(`/lifecycle/passport/${SN}`, '时间轴事件数', async (p, b) => { await go(p, b, `/lifecycle/passport/${SN}`); const t = await ev(p, () => window.__bp.firstText(/共\s*\d+\s*个事件/)); const n = t ? Number(/(\d+)/.exec(t)[1]) : null; return { pass: n !== null, detail: `共 ${n} 个事件`, value: n }; });
  add(`/lifecycle/passport/${SN}`, '取消「收货」后事件数', async (p, b) => { await go(p, b, `/lifecycle/passport/${SN}`); await clickOption(p, '收货'); const t = await ev(p, () => window.__bp.firstText(/共\s*\d+\s*个事件/)); const n = t ? Number(/(\d+)/.exec(t)[1]) : null; return { pass: n !== null, detail: `共 ${n} 个事件`, value: n }; });
  add(`/lifecycle/passport/${SN}`, '二维码弹窗含 SVG', async (p, b) => { await go(p, b, `/lifecycle/passport/${SN}`); const btn = p.getByRole('button', { name: /二维码/ }).first(); await btn.click(); await p.waitForTimeout(600); const n = await p.locator('[role=dialog] svg, [role=alertdialog] svg').count(); return { pass: n > 0, detail: `弹窗内 svg=${n}` }; });
  add('/lifecycle/passport/TS00000000', 'SN 不存在页内空态', async (p, b) => { await go(p, b, '/lifecycle/passport/TS00000000'); const v = await textVisible(p, '未找到该 SN 的护照记录'); return { pass: v, detail: `空态文案可见=${v}` }; });

  add('/lifecycle/flashing', '?status 预置筛选总数', async (p, b) => { await go(p, b, '/lifecycle/flashing?status=flashing,flash_failed'); const t = await ev(p, () => window.__bp.firstText(/共\s*\d+\s*条/)); const n = countOf(t); return { pass: n !== null, detail: `共 ${n} 条`, value: n }; });
  add('/lifecycle/flashing', '重试确认写明 SN 与次数', async (p, b) => { await go(p, b, '/lifecycle/flashing'); await p.getByRole('button', { name: '重试烧录', exact: true }).first().click(); await p.waitForTimeout(500); const t = await ev(p, () => window.__bp.firstText(/确认对 SN\s*TS\d+\s*重新发起烧录/)); return { pass: !!t && /已重试\s*\d+\s*次/.test(t), detail: (t || '无确认文案').slice(0, 80) }; });
  add('/lifecycle/flashing', '只读视角下业务操作全部置灰', async (p, b) => { await go(p, b, '/lifecycle/flashing?perm=readonly'); const names = await ev(p, () => [...new Set([...document.querySelectorAll('button[disabled], [aria-disabled=true]')].filter((e) => window.__bp.visible(e) && e.getBoundingClientRect().x >= 240).map((e) => window.__bp.norm(e.textContent)).filter((t) => /^(新建烧录任务|导出|标记成功|标记失败|重试烧录|超限报废|查看证书详情)$/.test(t)))].sort()); return { pass: names.length > 0, detail: names.join('、'), value: names }; });
  listChecks('/lifecycle/flashing', '^已选\\s*1\\s*项');
  // 第 5 阶段收尾（Owner 10-13 委托裁决，以共用核心为准）：行操作与批量操作同口径，重试与报废只出现在烧录结果为失败的行。
  add('/lifecycle/flashing', '重试与报废入口数量', async (p, b) => { await go(p, b, '/lifecycle/flashing'); const r = await p.getByRole('button', { name: '重试烧录', exact: true }).count(); const s = await p.getByRole('button', { name: '超限报废', exact: true }).count(); return { pass: r + s > 0, detail: `重试烧录=${r} 超限报废=${s}`, value: `${r}/${s}` }; });

  add('/exceptions/rma', '单号格式', async (p, b) => { await go(p, b, '/exceptions/rma'); const v = await textVisible(p, '^RMA-\\d{8}-\\d{6}$'); return { pass: v, detail: `RMA-YYYYMMDD-NNNNNN 可见=${v}` }; });
  add('/exceptions/rma', '查看打开详情抽屉', async (p, b) => { await go(p, b, '/exceptions/rma'); await p.locator('tbody tr, [role=row]').filter({ hasText: /RMA-/ }).first().getByText('查看', { exact: true }).first().click(); await p.waitForTimeout(600); const v = await textVisible(p, '单据信息'); return { pass: v, detail: `单据信息可见=${v}` }; });
  add('/exceptions/rma', '错误态带重试', async (p, b) => { await go(p, b, '/exceptions/rma?dataState=error'); const n = await p.getByRole('button', { name: /重试/ }).count(); return { pass: n > 0, detail: `重试按钮=${n}` }; });
  listChecks('/exceptions/rma', '^已选\\s*1\\s*项');

  add('/system/firmware', '落地补 tab=version', async (p, b) => { await go(p, b, '/system/firmware'); const u = p.url(); return { pass: /tab=version/.test(u), detail: u.replace(b, '') }; });
  add('/system/firmware', '灰度行进度条数', async (p, b) => { await go(p, b, '/system/firmware'); const n = await p.locator('[role=progressbar]').count(); return { pass: n > 0, detail: `progressbar=${n}`, value: n }; });
  add('/system/firmware', '切到推送任务 URL 同步且刷新停留', async (p, b) => {
    await go(p, b, '/system/firmware');
    await clickOption(p, '推送任务');
    const u1 = p.url();
    await p.reload({ waitUntil: 'networkidle' });
    await p.addScriptTag({ content: IN_PAGE });
    await p.waitForTimeout(500);
    const u2 = p.url();
    const v = await textVisible(p, '新建推送任务');
    return { pass: /tab=push-task/.test(u1) && /tab=push-task/.test(u2) && v, detail: `切换后=${/push-task/.test(u1)} 刷新后=${/push-task/.test(u2)} 新建推送任务=${v}` };
  });

  add('/system/firmware/new', '空表单提交被拦截', async (p, b) => { await go(p, b, '/system/firmware/new'); await p.getByRole('button', { name: /^(保存|提交)/ }).first().click(); await p.waitForTimeout(500); const v = await textVisible(p, '请(选择|输入|填写|上传)'); return { pass: v && /\/system\/firmware\/new/.test(p.url()), detail: `校验提示可见=${v}` }; });
  // 同上：什么都没填时点「取消」直接返回，不弹放弃确认。
  add('/system/firmware/new', '空表单取消直接返回', async (p, b) => { await go(p, b, '/system/firmware/new'); await p.getByRole('button', { name: '取消', exact: true }).first().click(); await p.waitForTimeout(700); const left = !/\/system\/firmware\/new/.test(p.url()); const ask = await textVisible(p, '放弃'); return { pass: left && !ask, detail: `离开=${left} 放弃确认=${ask} → ${p.url().replace(b, '')}` }; });
  add('/system/firmware/v2.4.2-beta.1/edit', '编辑态标题与版本号只读', async (p, b) => {
    await go(p, b, '/system/firmware/v2.4.2-beta.1/edit');
    const r = await ev(p, () => ({ h1: window.__bp.norm(document.querySelector('h1')?.textContent), ro: [...document.querySelectorAll('input')].filter((i) => i.value === 'v2.4.2-beta.1' && (i.readOnly || i.disabled)).length, text: window.__bp.textVisible(/^v2\.4\.2-beta\.1$/) }));
    return { pass: /编辑/.test(r.h1 || '') && (r.ro > 0 || r.text), detail: JSON.stringify(r) };
  });

  add('/alerts', '状态分栏带计数', async (p, b) => { await go(p, b, '/alerts'); const labels = await ev(p, () => ['待处理', '处理中', '已转工单', '已处理', '已静默'].map((t) => { const o = window.__bp.countedOption(t); return o ? window.__bp.norm(o.textContent) : null; })); return { pass: labels.every((l) => l && /\d/.test(l)), detail: labels.join(' '), value: labels.join(' ') }; });
  add('/alerts', '详情三段式', async (p, b) => { await go(p, b, '/alerts'); const r = await Promise.all(['发生了什么', '影响', '下一步'].map((t) => textVisible(p, t))); return { pass: r.every(Boolean), detail: r.join(',') }; });
  add('/alerts', '转工单预填三段', async (p, b) => { await go(p, b, '/alerts'); await p.getByRole('button', { name: '转工单' }).first().click(); await p.waitForTimeout(600); const v = await p.locator('[role=dialog] textarea, [role=dialog] [contenteditable=true]').evaluateAll((els) => els.some((e) => /发生了什么/.test(e.value || e.textContent || ''))); return { pass: v, detail: `预填含「发生了什么」=${v}` }; });
  add('/alerts', '?status=open 落待处理分栏', async (p, b) => { await go(p, b, '/alerts?status=open'); const s = await ev(p, () => window.__bp.selected(window.__bp.option('待处理'))); return { pass: s, detail: `待处理选中=${s}` }; });

  add('/exceptions/feedback', '状态分栏带计数', async (p, b) => { await go(p, b, '/exceptions/feedback'); const labels = await ev(p, () => ['全部', '待受理', '处理中', '待用户确认', '已解决', '已关闭', '已驳回'].map((t) => { const o = window.__bp.countedOption(t); return o ? window.__bp.norm(o.textContent) : null; })); return { pass: labels.every((l) => l && /\d/.test(l)), detail: labels.join(' '), value: labels.join(' ') }; });
  // 同上：列设置记忆全是非法列名时回退为全部列，固定必显的反馈编号、SLA 不会丢。
  add('/exceptions/feedback', '列设置记忆损坏时回退全部列', async (p, b) => {
    await go(p, b, '/exceptions/feedback');
    await ev(p, () => localStorage.setItem('tianshu_feedback_column_pref', JSON.stringify(['bogus'])));
    await go(p, b, '/exceptions/feedback');
    const heads = (await p.locator('th, [role=columnheader]').allTextContents()).map((t) => t.replace(/\s+/g, '')).filter(Boolean);
    await ev(p, () => localStorage.removeItem('tianshu_feedback_column_pref'));
    const has = (t) => heads.some((h) => h.startsWith(t));
    return { pass: has('反馈编号') && has('SLA') && has('类型'), detail: heads.join('|').slice(0, 120) };
  });
  add('/exceptions/feedback', 'SLA 列', async (p, b) => { await go(p, b, '/exceptions/feedback'); const n = await p.locator('th, [role=columnheader]').filter({ hasText: /SLA/ }).count(); return { pass: n > 0, detail: `SLA 表头=${n}` }; });
  add('/exceptions/feedback', '?ticket 直达抽屉含关联告警', async (p, b) => { await go(p, b, '/exceptions/feedback?ticket=FB20260926143012008'); const r = await Promise.all([textVisible(p, '反馈详情'), textVisible(p, '关联告警')]); return { pass: r.every(Boolean), detail: `反馈详情=${r[0]} 关联告警=${r[1]}` }; });

  add('/system/alert-rules', '副标题说明停用与启用口径', async (p, b) => { await go(p, b, '/system/alert-rules'); const v = await textVisible(p, '停用不删除历史触发记录'); return { pass: v, detail: `副标题可见=${v}` }; });
  add('/system/alert-rules', '已停用分栏只剩停用行', async (p, b) => { await go(p, b, '/system/alert-rules'); await clickOption(p, '已停用'); const r = await ev(p, () => { const rs = window.__bp.rows(); return { rows: rs.length, enabled: rs.filter((x) => /启用中/.test(x.textContent)).length }; }); return { pass: r.rows > 0 && r.enabled === 0, detail: JSON.stringify(r), value: r.rows }; });
  add('/system/alert-rules', '停用需二次确认', async (p, b) => { await go(p, b, '/system/alert-rules'); await p.getByRole('button', { name: '停用', exact: true }).first().click(); await p.waitForTimeout(500); const t = await ev(p, () => window.__bp.firstText(/停用这条规则/)); return { pass: !!t, detail: (t || '无确认文案').slice(0, 80) }; });

  add('/users/binding', '三字段互斥', async (p, b) => { await go(p, b, '/users/binding'); await p.locator('input[placeholder*="手机号"]').first().fill('13800000000'); await p.waitForTimeout(300); const r = await ev(p, () => [...document.querySelectorAll('input')].filter((i) => /用户\s*ID/.test(i.placeholder || '')).map((i) => i.disabled || i.readOnly)); return { pass: r.length > 0 && r.every(Boolean), detail: `用户 ID 置灰=${r.join(',')}` }; });
  add('/users/binding', '?sn 自动查询出绑定关系', async (p, b) => { await go(p, b, `/users/binding?sn=${SN}`); const v = await textVisible(p, '绑定关系'); return { pass: v, detail: `绑定关系可见=${v}` }; });

  return A;
}

// ---------- 执行 ----------
const selfCheck = 'self-check' in args;
let assertions = buildAssertions();
// --self-check：只保留 baseline 底座的一条路由，再注入一条必然失败的断言（主标题期望一个不存在的文字）。
const SELF_CHECK_ROUTE = '/dashboard';
const SELF_CHECK_ID = `${SELF_CHECK_ROUTE}>主标题自检负例`;
if (selfCheck) {
  assertions = assertions.filter((a) => a.route === SELF_CHECK_ROUTE);
  assertions.push({
    id: SELF_CHECK_ID,
    route: SELF_CHECK_ROUTE,
    run: async (p, b) => {
      await go(p, b, SELF_CHECK_ROUTE);
      const h = await ev(p, () => window.__bp.norm(document.querySelector('h1')?.textContent));
      return { pass: h === '这条标题在任何底座都不存在', detail: `h1=${h ?? '无'}` };
    }
  });
}
const foundations = Object.entries(cfg.foundations).filter(([n]) => (!only || only.includes(n)) && (!selfCheck || n === cfg.baseline));
const browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 30000 });
const results = {};
try {
  for (const [name, origin] of foundations) {
    const ctx = await browser.newContext({ viewport: cfg.viewport });
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
    const list = [];
    for (const a of assertions) {
      let r;
      try {
        r = await a.run(page, origin);
      } catch (e) {
        r = { pass: false, detail: `执行出错：${String(e.message || e).split('\n')[0].slice(0, 160)}` };
      }
      list.push({ id: a.id, route: a.route, ...r });
    }
    list.push({ id: 'console.error 为 0', pass: consoleErrors.length === 0, detail: consoleErrors.slice(0, 3).join(' | ') || 'clean' });
    list.push({ id: 'pageerror 为 0', pass: pageErrors.length === 0, detail: pageErrors.slice(0, 3).join(' | ') || 'clean' });
    results[name] = list;
    await ctx.close();
    console.log(`${name.padEnd(8)} ${list.filter((x) => x.pass).length}/${list.length}`);
  }
} finally {
  await browser.close();
}

// 取值类断言与 baseline 对齐。
const baseline = cfg.baseline;
const parity = {};
for (const [name, list] of Object.entries(results)) {
  parity[name] = list.map((x) => {
    if (name === baseline || x.value === undefined || !results[baseline]) return { ...x, verdict: x.pass ? 'pass' : 'fail' };
    const b = results[baseline].find((y) => y.id === x.id);
    const same = b && JSON.stringify(b.value) === JSON.stringify(x.value);
    return { ...x, baselineValue: b?.value, verdict: x.pass && same ? 'pass' : 'fail' };
  });
}
const summary = Object.fromEntries(Object.entries(parity).map(([n, l]) => [n, { total: l.length, pass: l.filter((x) => x.verdict === 'pass').length, fail: l.filter((x) => x.verdict === 'fail').map((x) => x.id) }]));
writeFileSync(resolve(outDir, 'behavior-parity.json'), JSON.stringify({
  suite: 'foundation-behavior-parity', mode: selfCheck ? 'self-check' : 'gate', recordedAt: new Date().toISOString(),
  config: { path: args.config, sha256: createHash('sha256').update(configRaw).digest('hex') },
  baseline, assertions: assertions.length + 2, summary, results: parity
}, null, 2));
for (const [n, s] of Object.entries(summary)) console.log(`${n.padEnd(8)} 对齐后 ${s.pass}/${s.total}`);
if (selfCheck) {
  const injected = (parity[cfg.baseline] || []).find((x) => x.id === SELF_CHECK_ID);
  const others = (parity[cfg.baseline] || []).filter((x) => x.id !== SELF_CHECK_ID);
  console.log(`${cfg.baseline.padEnd(8)} 注入断言 verdict=${injected ? injected.verdict : '缺失'}，其余 ${others.length} 条照常`);
  if (!injected || injected.verdict !== 'fail') {
    console.error('behavior parity self-check FAILED: 注入的必然失败断言没有被记为 fail');
    process.exit(1);
  }
  console.log('behavior parity self-check passed: 注入断言被如实记为 fail');
  process.exit(0);
}
const failed = Object.entries(summary).filter(([, s]) => s.pass < s.total);
if (failed.length) {
  console.error(`behavior parity FAILED: ${failed.map(([n, s]) => `${n} ${s.pass}/${s.total}（${s.fail.join('、')}）`).join('；')}`);
  process.exit(1);
}
console.log('behavior parity passed: 各底座对齐后全部通过');
