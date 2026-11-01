#!/usr/bin/env node
// 从中立 token 生成各底座主题文件（第 2 阶段：单一设计源）。
// 用法：node scripts/generate-foundation-themes.mjs --target antd|shadcn|element-plus --out <文件或目录>
//       [--tokens design-systems/tianshu/tokens.neutral.json]
// --out 为目录时写入适配器给出的默认文件名。

import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNeutral } from '../foundations/theme-adapters/shared.mjs';
import * as antd from '../foundations/theme-adapters/antd.mjs';
import * as shadcn from '../foundations/theme-adapters/shadcn.mjs';
import * as elementPlus from '../foundations/theme-adapters/element-plus.mjs';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTERS = { antd, shadcn, 'element-plus': elementPlus };
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };

const target = arg('target');
const out = arg('out');
if (!ADAPTERS[target] || !out) {
  console.error(`需要 --target（${Object.keys(ADAPTERS).join(' / ')}）与 --out`);
  process.exit(2);
}
const neutral = loadNeutral(resolve(KIT, arg('tokens', 'design-systems/tianshu/tokens.neutral.json')));
const { filename, content } = ADAPTERS[target].generate(neutral);
let outPath = resolve(KIT, out);
if (existsSync(outPath) && statSync(outPath).isDirectory()) outPath = join(outPath, filename);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, content);
console.log(`${target} → ${outPath}`);
