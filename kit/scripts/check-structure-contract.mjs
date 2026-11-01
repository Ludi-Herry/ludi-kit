#!/usr/bin/env node
// 结构合同校验（第 4 阶段；2026-10-13 第 5 阶段起由 npm run check:foundation-parity 串联为门禁，不接入 validate）：表格列顺序、列宽、对齐、固定列、行内标签筛选区（filterInline）与探针实测逐项比对。
// 用法：node scripts/check-structure-contract.mjs --probe <探针输出目录> [--foundation antd]
//        [--contract design-systems/tianshu/structure.tables.json]
//        同命令加 --self-check：在内存里改坏合同跑负例（表格几何、列顺序、行内标签间距、行内标签字段顺序各一，不落盘），检查脚本能抓到
// 退出码：0 通过（--self-check 抓到全部负例也是 0）；1 有不一致 / --self-check 漏报；2 输入错误。

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const contractPath = resolve(KIT, arg('contract', 'design-systems/tianshu/structure.tables.json'));
const probeArg = arg('probe');
const foundation = arg('foundation', 'antd');
const TOL = 1;

const fail = (msg) => { console.error(msg); process.exit(2); };
if (!probeArg) fail('需要 --probe <探针输出目录>');
if (!existsSync(contractPath)) fail(`找不到结构合同 ${contractPath}`);
const probeDir = resolve(KIT, probeArg);
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
if (!contract.tables || typeof contract.tables !== 'object') fail('结构合同缺少 tables');

const norm = (s) => String(s ?? '').replace(/\s+/g, '');
const ALIGN = new Set(['left', 'center', 'right']);
const FIXED = new Set(['left', 'right']);
// 比对逻辑收在一个函数里，正常模式与 --self-check 共用同一份判据；--self-check 只改内存里的深拷贝，不落盘。
function compare(contract, probeDir, foundation) {
  const errors = [];
  const warnings = [];
  let checked = 0;

  for (const [route, table] of Object.entries(contract.tables)) {
    const cols = table.columns || [];
    if (!cols.length) { errors.push(`${route}: 没有 columns`); continue; }
    for (const c of cols) {
      if (!c.header) errors.push(`${route}: 有列缺少 header`);
      if (c.width != null && typeof c.width !== 'number') errors.push(`${route} ${c.header}: width 必须是数字`);
      if (c.align && !ALIGN.has(c.align)) errors.push(`${route} ${c.header}: align 只能是 left / center / right`);
      if (c.fixed && !FIXED.has(c.fixed)) errors.push(`${route} ${c.header}: fixed 只能是 left / right`);
      if (c.responsive && !contract.breakpoints?.[c.responsive]) errors.push(`${route} ${c.header}: 断点 ${c.responsive} 未在 breakpoints 里定义`);
    }
    const reportPath = resolve(probeDir, route, 'parity-report.json');
    if (!existsSync(reportPath)) { errors.push(`${route}: 探针报告不存在`); continue; }
    const raw = JSON.parse(readFileSync(reportPath, 'utf8')).raw?.[foundation];
    if (!raw) { errors.push(`${route}: 报告里没有底座 ${foundation}`); continue; }

    const vw = contract.referenceViewport?.width ?? 1440;
    const visible = cols.filter((c) => !c.defaultHidden && (!c.responsive || vw >= contract.breakpoints[c.responsive]));
    const expected = [...(table.selection ? [''] : []), ...visible.map((c) => norm(c.header))];
    const actual = (raw.struct?.columnheaders || []).map(norm);
    checked += 1;
    if (JSON.stringify(expected) !== JSON.stringify(actual)) errors.push(`${route}: 列顺序 合同=[${expected.join(', ')}] 实测=[${actual.join(', ')}]`);

    for (const c of visible) {
      const m = raw.results?.[`th:${norm(c.header)}`];
      if (!m || !m.found) { warnings.push(`${route} ${c.header}: 没有表头测点，只校验了列顺序`); continue; }
      if (c.width != null) {
        checked += 1;
        if (Math.abs(m.box.w - c.width) > TOL) errors.push(`${route} ${c.header}: 列宽 合同=${c.width} 实测=${m.box.w}`);
      }
      if (!m.layout) { warnings.push(`${route} ${c.header}: 探针报告没有 layout 字段（旧版探针），跳过对齐与固定列`); continue; }
      checked += 2;
      const align = c.align || 'left';
      if (m.layout.align !== align) errors.push(`${route} ${c.header}: 对齐 合同=${align} 实测=${m.layout.align}`);
      if (m.layout.sticky !== Boolean(c.fixed)) errors.push(`${route} ${c.header}: 固定列 合同=${c.fixed || '不固定'} 实测=${m.layout.sticky ? '固定' : '不固定'}`);
    }
  }

  // 分页布局：totalPlacement = beforeItems 表示「共 N 条」紧挨在上一页按钮左边（间距 0–16px），与页码一起靠右。
  for (const [route, table] of Object.entries(contract.tables)) {
    if (!table.pagination) continue;
    const reportPath = resolve(probeDir, route, 'parity-report.json');
    if (!existsSync(reportPath)) continue;
    const r = JSON.parse(readFileSync(reportPath, 'utf8')).raw?.[foundation]?.results || {};
    const total = r['pager:total'];
    const prev = r['pager:prev'];
    if (!total?.found || !prev?.found) { warnings.push(`${route}: 没有分页测点，跳过分页布局`); continue; }
    checked += 1;
    if (table.pagination.totalPlacement === 'beforeItems') {
      const gap = Math.round((prev.box.x - (total.box.x + total.box.w)) * 10) / 10;
      if (gap < 0 || gap > 16) errors.push(`${route}: 分页总数应紧挨在页码左侧（间距 0–16），实测间距 ${gap}`);
    }
  }

  // 筛选区栅格：filters = { region, columns, gap }。区块内容宽 = 区块宽 - 左右留白（insetX × 2），
  // 每列宽 = (内容宽 - gap × (列数 - 1)) / 列数；取区块内第一行的输入框与下拉框（ph: / select:），逐个比对宽度与起点。
  for (const [route, page] of Object.entries(contract.filters || {})) {
    const reportPath = resolve(probeDir, route, 'parity-report.json');
    if (!existsSync(reportPath)) { errors.push(`${route}: 探针报告不存在`); continue; }
    const r = JSON.parse(readFileSync(reportPath, 'utf8')).raw?.[foundation]?.results || {};
    const region = r[`region:${norm(page.region)}`];
    if (!region?.found || !region.textInset) { errors.push(`${route}: 找不到筛选区块 region:${page.region}`); continue; }
    const left = region.box.x + region.textInset.x;
    const contentWidth = region.box.w - region.textInset.x * 2;
    // 固定轨道（template）只校验写成 px 的轨道宽度；等宽列（columns）校验宽度与起点。参考视口下不考虑窄屏回落（below）。
    // 自动排列（repeat(auto-fit, minmax(Npx, 1fr))）在参考视口下换算成等宽列数，按等宽列校验。
    const autoFit = /^repeat\(auto-fit,\s*minmax\((\d+(?:\.\d+)?)px,\s*1fr\)\)$/.exec(page.template || '');
    const columns = autoFit ? Math.max(1, Math.floor((contentWidth + page.gap) / (Number(autoFit[1]) + page.gap))) : page.columns;
    const tracks = page.template && !autoFit ? page.template.split(/\s+(?![^(]*\))/) : null;
    const colWidth = columns ? (contentWidth - page.gap * (columns - 1)) / columns : null;
    const controls = Object.entries(r)
      .filter(([id, m]) => /^(ph|select):/.test(id) && m.found && m.box.y >= region.box.y && m.box.y + m.box.h <= region.box.y + region.box.h)
      .map(([id, m]) => ({ id, ...m.box }));
    if (!controls.length) { warnings.push(`${route}: 筛选区里没有输入框或下拉框测点`); continue; }
    const top = Math.min(...controls.map((c) => c.y));
    const firstRow = controls.filter((c) => Math.abs(c.y - top) <= 4).sort((a, b) => a.x - b.x);
    if (tracks) {
      firstRow.forEach((c, i) => {
        const m = /^(\d+(?:\.\d+)?)px$/.exec(tracks[i] || '');
        if (!m) return;
        checked += 1;
        if (Math.abs(c.w - Number(m[1])) > TOL) errors.push(`${route} ${c.id}: 筛选项宽 合同=${m[1]}（第 ${i + 1} 条轨道） 实测=${c.w}`);
      });
      continue;
    }
    for (const c of firstRow) {
      checked += 2;
      const col = Math.round((c.x - left) / (colWidth + page.gap));
      const expectedX = left + col * (colWidth + page.gap);
      if (Math.abs(c.w - colWidth) > TOL) errors.push(`${route} ${c.id}: 筛选项宽 合同=${Math.round(colWidth * 10) / 10} 实测=${c.w}`);
      if (Math.abs(c.x - expectedX) > TOL) errors.push(`${route} ${c.id}: 筛选项起点 合同=${Math.round(expectedX * 10) / 10}（第 ${col + 1} 列） 实测=${c.x}`);
    }
  }

  // 行内标签筛选区（filterInline）：字段顺序、标签在左同行、标签宽、字段间距、按钮与末字段的间距。
  // 2026-10-13 试运行，同日抓到真实失败（Element Plus 查询按钮间距 14，Owner 定为要修）后转正，不一致计入错误。
  // 探针缺测点时与表头一样只出警告。
  for (const [route, page] of Object.entries(contract.filterInline || {})) {
    const reportPath = resolve(probeDir, route, 'parity-report.json');
    if (!existsSync(reportPath)) { warnings.push(`${route}: 行内标签 探针报告不存在`); continue; }
    const r = JSON.parse(readFileSync(reportPath, 'utf8')).raw?.[foundation]?.results || {};
    const fields = (page.fields || []).map((f) => ({ ...f, lb: r[`label:${f.label}`]?.box, ib: r[f.probe]?.box }));
    const missing = fields.filter((f) => !f.lb || !f.ib).map((f) => f.label);
    if (missing.length) { warnings.push(`${route}: 行内标签 ${missing.join('、')} 缺标签或输入框测点，跳过比对`); continue; }
    const expectedOrder = fields.map((f) => f.label);
    const actualOrder = [...fields].sort((a, b) => a.lb.x - b.lb.x).map((f) => f.label);
    checked += 1;
    if (actualOrder.join('→') !== expectedOrder.join('→')) {
      errors.push(`${route}: 行内标签 字段顺序 合同=${expectedOrder.join('→')} 实测=${actualOrder.join('→')}（顺序不对时不再比间距）`);
      continue;
    }
    let prevRight = null;
    for (const f of fields) {
      checked += 2;
      if (Math.abs(f.lb.y - f.ib.y) > TOL) errors.push(`${route} ${f.label}: 行内标签 标签与输入框应同行 实测y 标签=${f.lb.y} 输入框=${f.ib.y}`);
      const join = f.ib.x - (f.lb.x + f.lb.w);
      if (Math.abs(join) > TOL) errors.push(`${route} ${f.label}: 行内标签 标签应紧贴输入框左侧 实测间距=${Math.round(join * 10) / 10}`);
      if (f.labelWidth != null) {
        checked += 1;
        if (Math.abs(f.lb.w - f.labelWidth) > TOL) errors.push(`${route} ${f.label}: 行内标签 标签宽 合同=${f.labelWidth} 实测=${f.lb.w}`);
      }
      if (prevRight != null) {
        checked += 1;
        const gap = f.lb.x - prevRight;
        if (Math.abs(gap - page.gap) > TOL) errors.push(`${route} ${f.label}: 行内标签 字段间距 合同=${page.gap} 实测=${Math.round(gap * 10) / 10}`);
      }
      prevRight = f.ib.x + f.ib.w;
    }
    if (page.button) {
      const btn = r[`btn:${page.button.text}`];
      if (!btn?.found) warnings.push(`${route}: 行内标签 没有按钮测点 btn:${page.button.text}，跳过按钮间距比对`);
      else {
        checked += 1;
        const gap = btn.box.x - prevRight;
        if (Math.abs(gap - page.button.gap) > TOL) errors.push(`${route} ${page.button.text}: 行内标签 按钮与末字段间距 合同=${page.button.gap} 实测=${Math.round(gap * 10) / 10}`);
      }
    }
  }
  return { errors, warnings, checked };
}

if (process.argv.includes('--self-check')) {
  const N = compare(contract, probeDir, foundation).errors.length;
  // 负例：改坏内存深拷贝里的合同，重跑后错误数必须比正常跑多。10-10 探针没有 layout 字段，
  // align / fixed 的改坏只会出警告不产生错误，所以「排布对齐」类负例落在列顺序上；等带 layout 的探针落盘后可再补 align 负例。
  const cases = [
    { name: '几何：devices 首列（SN）列宽 +40', mutate: (c) => { c.tables.devices.columns[0].width += 40; } },
    { name: '排布：对调 devices 前两列（SN 与机型）', mutate: (c) => { const cs = c.tables.devices.columns; [cs[0], cs[1]] = [cs[1], cs[0]]; } },
    { name: '行内标签：绑定页查询按钮与末字段间距 16 → 24', mutate: (c) => { c.filterInline.binding.button.gap = 24; } },
    { name: '行内标签：对调绑定页前两个字段', mutate: (c) => { const fs = c.filterInline.binding.fields; [fs[0], fs[1]] = [fs[1], fs[0]]; } }
  ];
  const missed = [];
  for (const { name, mutate } of cases) {
    const mutated = JSON.parse(JSON.stringify(contract));
    mutate(mutated);
    const n = compare(mutated, probeDir, foundation).errors.length;
    const caught = n > N;
    console.log(`${caught ? '抓到' : '漏报'}：${name}（错误 ${N} → ${n}）`);
    if (!caught) missed.push(name);
  }
  if (missed.length) {
    console.error(`structure contract self-check FAILED: ${missed.length}/${cases.length} 项负例漏报`);
    process.exit(1);
  }
  console.log(`structure contract self-check passed: 正常跑 ${N} 处错误，负例 ${cases.length} 项全部报出`);
  process.exit(0);
}

const { errors, warnings, checked } = compare(contract, probeDir, foundation);
for (const w of warnings) console.warn(`警告 ${w}`);
if (errors.length) {
  console.error(`structure contract FAILED（${foundation}）: ${errors.length} 处不一致，已比对 ${checked} 项`);
  for (const e of errors.slice(0, 200)) console.error('  ' + e);
  process.exit(1);
}
console.log(`structure contract passed（${foundation}）: ${Object.keys(contract.tables).length} 张表，已比对 ${checked} 项，${warnings.length} 条警告`);
