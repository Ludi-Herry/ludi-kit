// 行为不变验收：当前派生得出的生效区块登记 vs git e5f1728 时刻的静态 PAGE_REGISTRIES，逐字段机械 diff。
// 用法：`node editor-server/page-mold-diff.mjs [--out <报告.json>] [--goto <commit>]`
// 退出码：0 = 0 差异；1 = 有差异或读取失败。只读，不写任何项目文件。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registries, literalExport } from './blocks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const flagValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const BASELINE_COMMIT = flagValue('--goto') ?? 'e5f1728';
const OUT = flagValue('--out');

function loadBaseline(commit) {
  const source = execFileSync('git', ['-C', resolve(KIT, '..'), 'show', `${commit}:kit/preview/src/editor/page-blocks.ts`], { encoding: 'utf8' });
  return literalExport(source, 'PAGE_REGISTRIES');
}

function diff(a, b, path, out, limit = 50) {
  if (out.length >= limit) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { out.push({ path, kind: 'array-length', baseline: a.length, derived: b.length }); return; }
    a.forEach((item, i) => diff(item, b[i], `${path}[${i}]`, out, limit));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!(key in a)) out.push({ path: path ? `${path}.${key}` : key, kind: 'missing-in-baseline' });
      else if (!(key in b)) out.push({ path: path ? `${path}.${key}` : key, kind: 'missing-in-derived', baseline: a[key] });
      else diff(a[key], b[key], path ? `${path}.${key}` : key, out, limit);
    }
    return;
  }
  if (a !== b) out.push({ path, kind: 'value', baseline: a, derived: b });
}

const baseline = loadBaseline(BASELINE_COMMIT);
const derived = registries();
const mismatches = [];
diff(baseline, derived, '', mismatches);
const report = {
  baseline: { commit: BASELINE_COMMIT, source: `git show ${BASELINE_COMMIT}:kit/preview/src/editor/page-blocks.ts`, entries: baseline.length, blocks: baseline.reduce((n, e) => n + e.blocks.length, 0) },
  derived: { source: 'PAGE_BLOCK_MAP × patterns.manifest.json（page-mold-derive.mjs）', entries: derived.length, blocks: derived.reduce((n, e) => n + e.blocks.length, 0) },
  mismatches,
  verdict: mismatches.length === 0 ? '0 差异' : `${mismatches.length} 处差异`
};
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ verdict: report.verdict, baseline: report.baseline, derived: report.derived, mismatchCount: mismatches.length }, null, 2));
for (const m of mismatches) console.log(JSON.stringify(m));
process.exit(mismatches.length === 0 ? 0 : 1);
