// 主题适配器共用工具：读中立 token、按路径取值。
// 适配器（每个底座一个）只做「中立角色 → 该组件库主题写法」的翻译，不新增数值。

import { readFileSync } from 'node:fs';

export function loadNeutral(path) {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  return json;
}

// 取 token 值：get(tokens, 'color.brand.base')。路径不存在时抛错，避免静默漏映射。
export function get(tokens, path) {
  const node = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), tokens);
  if (!node || typeof node !== 'object' || !('value' in node)) throw new Error(`中立 token 缺少 ${path}`);
  return node.value;
}

export const px = (n) => (typeof n === 'number' ? `${n}px` : n);

// 每个适配器导出的映射表都写成 [目标名, 中立路径或取值函数]，便于测试逐项回读。
export function resolveMap(tokens, map) {
  return map.map(([target, source]) => [target, typeof source === 'function' ? source(tokens) : get(tokens, source), typeof source === 'string' ? source : 'derived']);
}
