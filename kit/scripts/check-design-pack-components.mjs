#!/usr/bin/env node
// design pack 的 components / knownGaps 新写法检查（4.6，试运行：只报告、不拦截）。
// 用法：node scripts/check-design-pack-components.mjs              报告 foundations/design-packs 下全部 pack
//       node scripts/check-design-pack-components.mjs --pack <文件>  只报告一份 pack
//       node scripts/check-design-pack-components.mjs --self-check   跑负例，检查本脚本能抓到错误
// 退出码：试运行期间报告里的错误不影响退出码（0）；只有脚本自身失败或 --self-check 漏报时为 1。
// 新旧写法都接受：旧写法（组件名字符串、无 layer / decision 的缺口）计入「旧格式」，不算错误。
// 裁决口径见 rules/foundation-differences.md。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_DIR = join(KIT, 'foundations/design-packs');
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validate = ajv.compile(readJson(join(KIT, 'schema/design-pack-components.schema.json')));

// JSON Pointer 取值；不存在返回 undefined
const at = (doc, pointer) => {
  if (pointer === '' || pointer === undefined) return doc;
  let cur = doc;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur === null || typeof cur !== 'object' || !(key in cur)) return undefined;
    cur = cur[key];
  }
  return cur;
};

const jsonCache = new Map();
const kitJson = (path) => {
  const abs = resolve(KIT, path);
  if (!jsonCache.has(abs)) jsonCache.set(abs, existsSync(abs) ? readJson(abs) : null);
  return jsonCache.get(abs);
};

/** 检查一份 pack，返回 { errors, notes, stats }。errors 是新写法里的问题；旧写法只计数。 */
export function checkPack(pack, label) {
  const errors = [];
  const subset = {};
  if ('components' in pack) subset.components = pack.components;
  if ('knownGaps' in pack) subset.knownGaps = pack.knownGaps;
  if (!validate(subset)) {
    for (const e of validate.errors) errors.push(`schema ${e.instancePath || '/'} ${e.message}`);
  }

  const components = Array.isArray(pack.components) ? pack.components : null;
  const gaps = Array.isArray(pack.knownGaps) ? pack.knownGaps : null;
  const stats = {
    components: components ? components.length : null,
    legacyComponents: 0,
    v2Components: 0,
    specCandidate: 0,
    specConfirmed: 0,
    compensation: { implemented: 0, 'none-confirmed': 0, unknown: 0 },
    gaps: gaps ? gaps.length : null,
    legacyGaps: 0,
    verdicts: { unify: 0, preserve: 0, 'pending-owner': 0 }
  };

  const names = new Map();
  for (const [i, c] of (components ?? []).entries()) {
    const name = typeof c === 'string' ? c : c?.name;
    if (typeof name === 'string') {
      if (names.has(name)) errors.push(`components 重名：${name}（第 ${names.get(name)} 与第 ${i} 项）`);
      else names.set(name, i);
    }
    if (typeof c === 'string') { stats.legacyComponents += 1; continue; }
    if (!c || typeof c !== 'object') continue;
    stats.v2Components += 1;

    const ref = c.source?.ref;
    if (typeof ref === 'string' && ref.includes('#')) {
      const [path, pointer] = ref.split('#');
      const doc = kitJson(path);
      if (doc === null) errors.push(`${name}: source.ref 文件不存在 ${path}`);
      else if (at(doc, pointer) === undefined) errors.push(`${name}: source.ref 指针不存在 ${ref}`);
    }
    if (c.source?.kind === 'unknown' && c.source?.ref !== null) errors.push(`${name}: source.kind 为 unknown 时 ref 应为 null`);

    for (const s of Array.isArray(c.spec) ? c.spec : []) {
      if (s?.status === 'candidate') stats.specCandidate += 1;
      if (s?.status === 'confirmed') stats.specConfirmed += 1;
      const doc = s?.ref?.path ? kitJson(s.ref.path) : undefined;
      if (doc === null) errors.push(`${name}: spec.ref 文件不存在 ${s.ref.path}`);
      else if (doc && at(doc, s.ref.pointer) === undefined) errors.push(`${name}: spec.ref 指针不存在 ${s.ref.path}#${s.ref.pointer}`);
      if (s?.status === 'confirmed' && doc && doc.status && /draft/.test(doc.status)) {
        errors.push(`${name}: 规格仍是草案（${doc.status}），spec 不能写 confirmed`);
      }
    }

    const comp = c.compensation;
    if (comp && comp.status in stats.compensation) stats.compensation[comp.status] += 1;
    if (comp?.status === 'implemented' && !(comp.implementation?.length > 0)) errors.push(`${name}: compensation 为 implemented 但没写实现位置`);
    if (comp?.status !== 'unknown' && comp && !(comp.evidence?.length > 0)) errors.push(`${name}: compensation 为 ${comp.status} 但没有证据`);
  }

  for (const g of gaps ?? []) {
    if (!g || typeof g !== 'object') continue;
    if (!('layer' in g) || !('decision' in g)) { stats.legacyGaps += 1; }
    const d = g.decision;
    if (!d) continue;
    if (d.verdict in stats.verdicts) stats.verdicts[d.verdict] += 1;
    if ((d.verdict === 'unify' || d.verdict === 'preserve') && !(d.evidence?.length > 0)) {
      errors.push(`缺口「${g.component}」: 裁决为 ${d.verdict} 但没有证据（Owner 裁决须指向原记录）`);
    }
    if (d.verdict === 'preserve' && Array.isArray(d.answers) && d.answers.some((a) => typeof a === 'string' && /^会/.test(a))) {
      errors.push(`缺口「${g.component}」: 三问里有「会」，不能裁决为 preserve`);
    }
  }

  const notes = [];
  if (components === null) notes.push('未登记 components（缺省不等于确认没有）');
  if (gaps === null) notes.push('未登记 knownGaps（缺省不等于确认没有）');
  return { label, errors, notes, stats };
}

function format(r) {
  const s = r.stats;
  const parts = [];
  if (s.components !== null) parts.push(`组件 ${s.components}（旧格式 ${s.legacyComponents}，新格式 ${s.v2Components}）`);
  if (s.v2Components) parts.push(`规格候选 ${s.specCandidate} / 已确认 ${s.specConfirmed}，补偿 已实现 ${s.compensation.implemented} / 确认无需 ${s['compensation']['none-confirmed']} / 未知 ${s.compensation.unknown}`);
  if (s.gaps !== null) parts.push(`缺口 ${s.gaps}（旧格式 ${s.legacyGaps}；统一 ${s.verdicts.unify} / 保留 ${s.verdicts.preserve} / 待 Owner ${s.verdicts['pending-owner']}）`);
  const lines = [`${r.errors.length ? '✗' : '·'} ${r.label}: ${parts.join('；') || '无 components / knownGaps'}`];
  for (const n of r.notes) lines.push(`    注：${n}`);
  for (const e of r.errors) lines.push(`    错误：${e}`);
  return lines.join('\n');
}

if (process.argv.includes('--self-check')) {
  // 「草案规格写 confirmed」负例用内存里的草案规格，不依赖真实规格文件当前是否已签字（2026-10-13 三份规格已签字）。
  const DRAFT_SPEC = 'self-check/draft.spec.json';
  jsonCache.set(resolve(KIT, DRAFT_SPEC), { status: 'draft-pending-owner-signoff', controls: { table: {} } });
  const good = {
    components: [
      'legacy-name',
      {
        name: 'table',
        source: { kind: 'registry', ref: 'foundations/design-packs/shadcn-4.13.1.json#/source' },
        spec: [{ ref: { path: 'design-systems/tianshu/controls.spec.json', pointer: '/controls/table' }, status: 'candidate' }],
        compensation: { status: 'implemented', implementation: ['lab:shadcn/src/suite/controls.suite.css#data-slot=table'], evidence: ['phase4-3/FINDINGS.md'] }
      }
    ],
    knownGaps: [
      { component: '旧缺口', status: '历史表述' },
      { component: '新缺口', status: '待定', layer: 'visual', decision: { definitionRef: 'rules/foundation-differences.md', answers: ['不会：x', '不会：y', '不会：z'], verdict: 'pending-owner', evidence: [] } }
    ]
  };
  const bad = [
    ['重名', { components: ['a', 'a'] }],
    ['规格指针不存在', { components: [{ name: 'x', source: { kind: 'unknown', ref: null }, spec: [{ ref: { path: 'design-systems/tianshu/controls.spec.json', pointer: '/controls/no-such' }, status: 'candidate' }], compensation: { status: 'unknown', implementation: [], evidence: [] } }] }],
    ['草案规格写 confirmed', { components: [{ name: 'x', source: { kind: 'unknown', ref: null }, spec: [{ ref: { path: DRAFT_SPEC, pointer: '/controls/table' }, status: 'confirmed' }], compensation: { status: 'unknown', implementation: [], evidence: [] } }] }],
    ['implemented 无实现位置', { components: [{ name: 'x', source: { kind: 'unknown', ref: null }, spec: [], compensation: { status: 'implemented', implementation: [], evidence: ['e'] } }] }],
    ['none-confirmed 无证据', { components: [{ name: 'x', source: { kind: 'unknown', ref: null }, spec: [], compensation: { status: 'none-confirmed', implementation: [], evidence: [] } }] }],
    ['source 指针不存在', { components: [{ name: 'x', source: { kind: 'registry', ref: 'foundations/design-packs/shadcn-4.13.1.json#/no/such' }, spec: [], compensation: { status: 'unknown', implementation: [], evidence: [] } }] }],
    ['缺字段', { components: [{ name: 'x', source: { kind: 'registry', ref: null } }] }],
    ['非法 layer', { knownGaps: [{ component: 'g', status: 's', layer: 'pixel' }] }],
    ['保留但三问有会', { knownGaps: [{ component: 'g', status: 's', layer: 'logic', decision: { definitionRef: null, answers: ['会：改变数据', '不会', '不会'], verdict: 'preserve', evidence: ['x'] } }] }],
    ['统一无证据', { knownGaps: [{ component: 'g', status: 's', layer: 'visual', decision: { definitionRef: null, answers: [null, null, null], verdict: 'unify', evidence: [] } }] }]
  ];
  const failures = [];
  const g = checkPack(good, 'good');
  if (g.errors.length) failures.push(`正例误报：${g.errors.join('；')}`);
  if (g.stats.legacyComponents !== 1 || g.stats.v2Components !== 1 || g.stats.legacyGaps !== 1) failures.push('正例计数不对');
  for (const [name, pack] of bad) if (checkPack(pack, name).errors.length === 0) failures.push(`负例漏报：${name}`);
  if (failures.length) { console.error(`design pack components self-check FAILED: ${failures.length}`); failures.forEach((f) => console.error('  ' + f)); process.exit(1); }
  console.log(`design pack components self-check passed: 正例 1 项无误报，负例 ${bad.length} 项全部报出`);
  process.exit(0);
}

const only = arg('pack');
const files = only ? [resolve(process.cwd(), only)] : readdirSync(PACK_DIR).filter((f) => f.endsWith('.json')).sort().map((f) => join(PACK_DIR, f));
let errorCount = 0;
let legacyPacks = 0;
for (const file of files) {
  const r = checkPack(readJson(file), relative(KIT, file).replace(/\\/g, '/'));
  errorCount += r.errors.length;
  if (r.stats.legacyComponents || r.stats.legacyGaps) legacyPacks += 1;
  console.log(format(r));
}
console.log(`design pack components（试运行，只报告）: ${files.length} 份 pack，含旧格式 ${legacyPacks} 份，新写法错误 ${errorCount} 条`);
