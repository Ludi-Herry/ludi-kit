#!/usr/bin/env node
// 主题适配器自检：
// 1. antd：生成的 ThemeConfig 经 antd 自己的算法解析后，每个映射项都等于中立 token（往返一致）；
//    并且与 antd 天枢现版主题解析结果一致（初稿阶段，中立文件就是从现版抽出来的，应 0 差异）。
// 2. shadcn / element-plus：生成的 CSS 变量逐项回读，值等于对应中立 token。
// 3. 负例：改动一个中立值，三个适配器的输出都必须跟着变（证明不是写死的）。
// 退出码：0 通过，1 失败。

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNeutral, get } from '../foundations/theme-adapters/shared.mjs';
import * as antd from '../foundations/theme-adapters/antd.mjs';
import * as shadcn from '../foundations/theme-adapters/shadcn.mjs';
import * as elementPlus from '../foundations/theme-adapters/element-plus.mjs';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(KIT, 'package.json'));
const { theme } = require('antd');
const esbuild = createRequire(resolve(KIT, 'preview/package.json'))('esbuild');

const neutral = loadNeutral(resolve(KIT, 'design-systems/tianshu/tokens.neutral.json'));
const failures = [];
const norm = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().toLowerCase() : v);

// 1. antd 往返
const generated = antd.toThemeConfig(neutral);
const resolvedGen = theme.getDesignToken(generated);
for (const [name, path] of antd.TOKEN_MAP) {
  if (norm(resolvedGen[name]) !== norm(get(neutral.tokens, path))) failures.push(`antd 往返 ${name}: ${resolvedGen[name]} ≠ ${path}=${get(neutral.tokens, path)}`);
}
const themeSrc = readFileSync(resolve(KIT, 'projects/tianshu-device-ops/theme.ts'), 'utf8');
const mod = await import(`data:text/javascript;base64,${Buffer.from(esbuild.transformSync(themeSrc, { loader: 'ts', format: 'esm' }).code).toString('base64')}`);
const resolvedCurrent = theme.getDesignToken(mod.deviceOpsTheme);
let currentDiffs = 0;
for (const [name] of antd.TOKEN_MAP) {
  if (norm(resolvedGen[name]) !== norm(resolvedCurrent[name])) { currentDiffs += 1; failures.push(`antd 与现版不一致 ${name}: 生成=${resolvedGen[name]} 现版=${resolvedCurrent[name]}`); }
}

// 2. CSS 变量回读
for (const [label, adapter] of [['shadcn', shadcn], ['element-plus', elementPlus]]) {
  const css = adapter.generate(neutral).content;
  for (const [name, value] of adapter.toVars(neutral)) {
    const m = new RegExp(`\\s${name.replace(/[-]/g, '\\-')}: ([^;]+);`).exec(css);
    if (!m || norm(m[1]) !== norm(String(value))) failures.push(`${label} ${name}: 输出=${m?.[1]} 期望=${value}`);
  }
}

// 3. 负例：改主色，三个输出都要变
const mutated = JSON.parse(JSON.stringify(neutral));
mutated.tokens.color.brand.base.value = '#ff00ff';
const changed = [
  ['antd', antd.generate(neutral).content !== antd.generate(mutated).content],
  ['shadcn', shadcn.generate(neutral).content !== shadcn.generate(mutated).content],
  ['element-plus', elementPlus.generate(neutral).content !== elementPlus.generate(mutated).content]
];
for (const [label, ok] of changed) if (!ok) failures.push(`负例失败：改主色后 ${label} 输出未变化`);
const mutatedResolved = theme.getDesignToken(antd.toThemeConfig(mutated));
if (norm(mutatedResolved.colorPrimary) !== '#ff00ff') failures.push('负例失败：antd 解析后主色未跟随');

const total = antd.TOKEN_MAP.length * 2 + shadcn.toVars(neutral).length + elementPlus.toVars(neutral).length + 4;
if (failures.length) {
  console.error(`theme adapters FAILED: ${failures.length}/${total}`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`theme adapters passed: antd 往返 ${antd.TOKEN_MAP.length} 项、与现版一致 ${antd.TOKEN_MAP.length} 项、shadcn ${shadcn.toVars(neutral).length} 变量、element-plus ${elementPlus.toVars(neutral).length} 变量、负例 4 项`);
