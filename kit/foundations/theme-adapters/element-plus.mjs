// Element Plus 主题适配器：中立 token → Element Plus CSS 变量（:root，浅色）。
// Element Plus 运行时不派生浅色阶，需要把整级 light-N / dark-2 预先给出（剪藏原话）。
// 这里不按 Element Plus 自己的「与白色混合 N0%」算法，而是按组件实际用途对到中立角色，
// 保证同一状态在两个库里是同一个颜色：
//   light-3 → 悬停色，dark-2 → 按下色，light-9 → 浅底，light-8 → 浅底悬停，
//   light-7 → 浅描边，light-5 → 浅描边悬停。其余档位从中立色板取最接近的一级。

import { get, px, resolveMap } from './shared.mjs';

const brandScale = [
  ['', 'color.brand.base'],
  ['-light-3', 'color.brand.hover'],
  ['-light-5', 'color.brand.borderHover'],
  ['-light-7', 'color.brand.border'],
  ['-light-8', 'color.brand.bgHover'],
  ['-light-9', 'color.brand.bg'],
  ['-dark-2', 'color.brand.active']
];
const LIGHT_FROM_PALETTE = { '-light-3': '5', '-light-5': '4', '-light-7': '3', '-light-8': '2', '-light-9': '1', '-dark-2': '7' };
const statusScale = (el, palette, solidPath) => [
  [`--el-color-${el}`, solidPath],
  ...Object.entries(LIGHT_FROM_PALETTE).map(([suffix, step]) => [`--el-color-${el}${suffix}`, `color.palette.${palette}.${step}`])
];

export const VAR_MAP = [
  ...brandScale.map(([suffix, path]) => [`--el-color-primary${suffix}`, path]),
  ...statusScale('success', 'green', 'color.status.success.solid'),
  ...statusScale('warning', 'gold', 'color.status.warning.solid'),
  ...statusScale('danger', 'red', 'color.status.error.solid'),
  ...statusScale('error', 'red', 'color.status.error.solid'),
  ['--el-color-info', 'color.status.neutral.solid'],
  ['--el-text-color-primary', 'color.text.primary'],
  ['--el-text-color-regular', 'color.text.primary'],
  ['--el-text-color-secondary', 'color.text.secondary'],
  ['--el-text-color-placeholder', 'color.text.placeholder'],
  ['--el-text-color-disabled', 'color.text.disabled'],
  ['--el-bg-color', 'color.bg.container'],
  ['--el-bg-color-page', 'color.bg.page'],
  ['--el-bg-color-overlay', 'color.bg.elevated'],
  ['--el-border-color', 'color.border.default'],
  ['--el-border-color-light', 'color.border.secondary'],
  ['--el-border-color-lighter', 'color.border.secondary'],
  ['--el-fill-color-light', 'color.bg.tableHeader'],
  ['--el-fill-color-lighter', 'color.bg.fillQuaternary'],
  ['--el-disabled-bg-color', 'color.bg.disabled'],
  ['--el-disabled-text-color', 'color.text.disabled'],
  ['--el-border-radius-small', (t) => px(get(t, 'radius.sm'))],
  ['--el-border-radius-base', (t) => px(get(t, 'radius.base'))],
  ['--el-border-radius-round', (t) => px(get(t, 'radius.lg'))],
  ['--el-font-family', 'font.family'],
  ['--el-font-size-base', (t) => px(get(t, 'font.size.base'))],
  ['--el-font-size-small', (t) => px(get(t, 'font.size.sm'))],
  ['--el-font-size-medium', (t) => px(get(t, 'font.size.lg'))],
  ['--el-font-weight-primary', 'font.weight.strong'],
  ['--el-component-size-small', (t) => px(get(t, 'size.control.sm'))],
  ['--el-component-size', (t) => px(get(t, 'size.control.base'))],
  ['--el-component-size-large', (t) => px(get(t, 'size.control.lg'))],
  ['--el-box-shadow-light', 'shadow.tertiary'],
  ['--el-box-shadow', 'shadow.secondary']
];

export function toVars(neutral) {
  return resolveMap(neutral.tokens, VAR_MAP);
}

export function generate(neutral) {
  const lines = toVars(neutral).map(([k, v, src]) => `  ${k}: ${v}; /* ${src} */`);
  return {
    filename: 'theme.generated.css',
    content: `/* 由 kit/scripts/generate-foundation-themes.mjs 从中立 token 生成，勿手改。 */\n:root {\n${lines.join('\n')}\n}\n`
  };
}
