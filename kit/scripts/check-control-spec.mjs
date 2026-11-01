#!/usr/bin/env node
// 控件规格校验（第 3 阶段；2026-10-13 第 5 阶段起由 npm run check:foundation-parity 串联为门禁，不接入 validate）：结构与属性词表、token 引用、规格值与 antd 基准测点逐项一致。
// 用法：node scripts/check-control-spec.mjs --probe <探针输出目录> [--spec design-systems/tianshu/controls.spec.json]
//        [--foundation antd]
//        同命令加 --self-check：在内存里改坏规格跑负例（几何与颜色各一，不落盘），检查脚本能抓到
// --foundation 换成 shadcn 时，用同一份规格去量 shadcn，用于套件验收。
// 退出码：0 通过（--self-check 抓到全部负例也是 0）；1 有不一致 / --self-check 漏报；2 输入错误。

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const specPath = resolve(KIT, arg('spec', 'design-systems/tianshu/controls.spec.json'));
const probeArg = arg('probe');
const foundation = arg('foundation', 'antd');
const TOL = 1;

const fail = (msg) => { console.error(msg); process.exit(2); };
if (!probeArg) fail('需要 --probe <探针输出目录>（例：workflows/evidence/foundation-parity-2026-10-10/phase2-routes）');
if (!existsSync(specPath)) fail(`找不到规格 ${specPath}`);
const probeDir = resolve(KIT, probeArg);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const tokens = JSON.parse(readFileSync(resolve(dirname(specPath), spec.tokens), 'utf8')).tokens;

// 属性 → 探针取值
const PROPS = {
  height: (m) => m.box.h, width: (m) => m.box.w,
  paddingX: (m) => px(m.boxStyle.paddingLeft), paddingY: (m) => px(m.boxStyle.paddingTop),
  radius: (m) => px(m.boxStyle.borderTopLeftRadius),
  borderWidth: (m) => (m.boxStyle.borderTopStyle === 'none' ? 'none' : px(m.boxStyle.borderTopWidth)),
  borderColor: (m) => m.boxStyle.borderTopColor,
  borderBottomWidth: (m) => (m.boxStyle.borderBottomColor === 'n/a' ? 'none' : px(m.boxStyle.borderBottomWidth)),
  borderBottomColor: (m) => m.boxStyle.borderBottomColor,
  background: (m) => m.boxStyle.backgroundColor, shadow: (m) => m.boxStyle.boxShadow,
  textColor: (m) => m.text.color, fontSize: (m) => px(m.text.fontSize),
  fontWeight: (m) => Number(m.text.fontWeight), lineHeight: (m) => px(m.text.lineHeight),
  insetX: (m) => m.textInset?.x, insetY: (m) => m.textInset?.y,
  paddingRight: (m) => px(m.boxStyle.paddingRight), paddingBottom: (m) => px(m.boxStyle.paddingBottom),
  paddingTop: (m) => px(m.boxStyle.paddingTop),
  gapX: (m) => m.gapToNext,
  // 探针暂不测纵向间距，只能写在无测点（unmeasured）的部位；写进有测点的部位会因实测为空而报错。
  gapY: () => undefined
};
const COLOR_PROPS = new Set(['borderColor', 'borderBottomColor', 'background', 'textColor']);
const GEOMETRY = new Set(['height', 'width', 'insetX', 'insetY', 'paddingRight', 'paddingBottom', 'paddingTop', 'gapX', 'paddingX', 'paddingY', 'radius', 'fontSize', 'lineHeight', 'borderWidth', 'borderBottomWidth']);
function px(v) { if (v == null) return v; const n = parseFloat(v); return Number.isNaN(n) ? v : n; }

function tokenValue(path) {
  const node = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), tokens);
  if (!node || typeof node !== 'object' || !('value' in node)) return undefined;
  return node.value;
}
// 颜色统一成 rgba(r,g,b,a)，与探针的规范化写法一致。
function normColor(c) {
  if (c === 'transparent') return 'rgba(0,0,0,0)';
  if (c === 'none' || c === 'n/a') return 'n/a';
  if (typeof c !== 'string') return c;
  const s = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100 : 1;
    return a === 0 ? 'rgba(0,0,0,0)' : `rgba(${r},${g},${b},${a})`;
  }
  if (s === '#fff' || s === 'white') return 'rgba(255,255,255,1)';
  m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? Math.round(p[3] * 100) / 100 : 1;
    return a === 0 ? 'rgba(0,0,0,0)' : `rgba(${p[0]},${p[1]},${p[2]},${a})`;
  }
  return s;
}
function resolveValue(prop, v, where, errors) {
  if (typeof v === 'string' && v.startsWith('token:')) {
    const t = tokenValue(v.slice(6));
    if (t === undefined) { errors.push(`${where}.${prop}: token 不存在 ${v}`); return undefined; }
    v = t;
  }
  if (COLOR_PROPS.has(prop)) {
    // 无描边时不比颜色（与探针口径一致）
    return normColor(v);
  }
  if (prop === 'borderWidth' || prop === 'borderBottomWidth') return v === 'none' ? 'none' : px(v);
  if (prop === 'shadow') return v === 'none' ? 'none' : String(v);
  return typeof v === 'string' ? px(v) : v;
}

// 读探针原始数据
const probeCache = {};
function measure(route, anchor) {
  if (!probeCache[route]) {
    const p = resolve(probeDir, route, 'parity-report.json');
    if (!existsSync(p)) return { error: `探针报告不存在：${route}` };
    probeCache[route] = JSON.parse(readFileSync(p, 'utf8'));
  }
  const raw = probeCache[route].raw?.[foundation]?.results?.[anchor];
  if (!raw) return { error: `测点不存在：${route} ${anchor}（底座 ${foundation}）` };
  if (!raw.found) return { error: `测点在 ${foundation} 上未找到：${route} ${anchor}` };
  return { m: raw };
}

if (!spec.controls || typeof spec.controls !== 'object') fail('规格缺少 controls');

// 比对逻辑收在一个函数里，正常模式与 --self-check 共用同一份判据；--self-check 只改内存里的深拷贝，不落盘。
function compareControlSpec(spec) {
  const errors = [];
  const warnings = [];
  let checked = 0;
  for (const [cid, control] of Object.entries(spec.controls)) {
    if (!control.parts || !Object.keys(control.parts).length) { errors.push(`${cid}: 没有 parts`); continue; }
    for (const [pid, part] of Object.entries(control.parts)) {
      const where = `${cid}.${pid}`;
      const props = part.props || {};
      if (!Object.keys(props).length) { errors.push(`${where}: props 为空`); continue; }
      for (const k of Object.keys(props)) if (!PROPS[k]) errors.push(`${where}: 未知属性 ${k}`);
      for (const [st, sp] of Object.entries(part.states || {})) for (const k of Object.keys(sp)) if (!PROPS[k]) errors.push(`${where}.states.${st}: 未知属性 ${k}`);
      const anchors = part.baselineAnchors || [];
      if (!anchors.length) {
        if (part.unmeasured) warnings.push(`${where}: 无基准测点（${part.unmeasured}）`);
        else errors.push(`${where}: 没有 baselineAnchors，也没有写 unmeasured 原因`);
        continue;
      }
      for (const { route, anchor } of anchors) {
        const r = measure(route, anchor);
        if (r.error) { errors.push(`${where}: ${r.error}`); continue; }
        for (const [k, v] of Object.entries(props)) {
          if (!PROPS[k]) continue;
          const expected = resolveValue(k, v, where, errors);
          if (expected === undefined) continue;
          let actual = PROPS[k](r.m);
          if (COLOR_PROPS.has(k)) actual = normColor(actual);
          // 无描边时探针不记颜色
          if ((k === 'borderColor' && r.m.boxStyle.borderTopStyle === 'none') || (k === 'borderBottomColor' && r.m.boxStyle.borderBottomColor === 'n/a')) {
            if (expected !== 'n/a' && expected !== 'rgba(0,0,0,0)') errors.push(`${where} @${route} ${anchor}: ${k} 规格=${expected}，实测无描边`);
            checked += 1;
            continue;
          }
          checked += 1;
          const same = GEOMETRY.has(k) && typeof expected === 'number' && typeof actual === 'number'
            ? Math.abs(expected - actual) <= TOL
            : String(expected) === String(actual);
          if (!same) errors.push(`${where} @${route} ${anchor}: ${k} 规格=${expected} 实测=${actual}`);
        }
      }
    }
  }
  return { errors, warnings, checked };
}

if (process.argv.includes('--self-check')) {
  const N = compareControlSpec(spec).errors.length;
  // 负例：改坏内存深拷贝里的规格，重跑后错误数必须比正常跑多。
  const cases = [
    { name: '几何：button.primary 高度 +7', mutate: (s) => { s.controls.button.parts.primary.props.height += 7; } },
    { name: '样式：button.primary 背景改 #ff00ff', mutate: (s) => { s.controls.button.parts.primary.props.background = '#ff00ff'; } }
  ];
  const missed = [];
  for (const { name, mutate } of cases) {
    const mutated = JSON.parse(JSON.stringify(spec));
    mutate(mutated);
    const n = compareControlSpec(mutated).errors.length;
    const caught = n > N;
    console.log(`${caught ? '抓到' : '漏报'}：${name}（错误 ${N} → ${n}）`);
    if (!caught) missed.push(name);
  }
  if (missed.length) {
    console.error(`control spec self-check FAILED: ${missed.length}/${cases.length} 项负例漏报`);
    process.exit(1);
  }
  console.log(`control spec self-check passed: 正常跑 ${N} 处错误，负例 ${cases.length} 项全部报出`);
  process.exit(0);
}

const { errors, warnings, checked } = compareControlSpec(spec);
for (const w of warnings) console.warn(`警告 ${w}`);
if (errors.length) {
  console.error(`control spec FAILED（${foundation}）: ${errors.length} 处不一致，已比对 ${checked} 项`);
  for (const e of errors.slice(0, 200)) console.error('  ' + e);
  process.exit(1);
}
console.log(`control spec passed（${foundation}）: ${Object.keys(spec.controls).length} 种控件，已比对 ${checked} 项，${warnings.length} 条警告`);
