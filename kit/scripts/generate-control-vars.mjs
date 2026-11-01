#!/usr/bin/env node
// 从控件规格生成 CSS 变量文件（第 3 阶段）。
// 用法：node scripts/generate-control-vars.mjs --out <文件或目录> [--spec design-systems/tianshu/controls.spec.json]
//       node scripts/generate-control-vars.mjs --self-check   只做自检，不写文件

import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSpec, generate, cssValue } from '../foundations/control-adapters/css-vars.mjs';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const loaded = loadSpec(resolve(KIT, arg('spec', 'design-systems/tianshu/controls.spec.json')));

if (process.argv.includes('--self-check')) {
  const { vars, content } = generate(loaded);
  const failures = [];
  const names = new Set();
  for (const [name, value, src] of vars) {
    if (names.has(name)) failures.push(`变量重名：${name}`);
    names.add(name);
    if (!content.includes(`${name}: ${value};`)) failures.push(`未写出：${name}（${src}）`);
    if (/undefined|NaN|\[object/.test(value)) failures.push(`取值异常：${name} = ${value}`);
  }
  // 负例：token 引用解析必须跟随 token 变化
  const mutated = JSON.parse(JSON.stringify(loaded));
  mutated.tokens.color.brand.base.value = '#ff00ff';
  if (cssValue(mutated.tokens, 'background', 'token:color.brand.base') !== '#ff00ff') failures.push('负例失败：token 改动未传到变量');
  if (failures.length) { console.error(`control vars FAILED: ${failures.length}`); failures.forEach((f) => console.error('  ' + f)); process.exit(1); }
  console.log(`control vars passed: ${vars.length} 个变量，无重名，负例 1 项`);
  process.exit(0);
}

const out = arg('out');
if (!out) { console.error('需要 --out 或 --self-check'); process.exit(2); }
const { filename, content, vars } = generate(loaded);
let outPath = resolve(KIT, out);
if (existsSync(outPath) && statSync(outPath).isDirectory()) outPath = join(outPath, filename);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, content);
console.log(`${vars.length} 个控件变量 → ${outPath}`);
