// shadcn 主题适配器：中立 token → shadcn / Tailwind v4 的 CSS 变量（:root，浅色）。
// 变量名沿用 shadcn 官方约定和天枢工程已在用的 --status-* 名称，页面代码不用改。
// shadcn 只有一个 --border，无法同时表达 antd 的「输入框描边」和「表格分隔」两种边框；
// 另出 --border-secondary 供套件使用，用到哪种由第 3 阶段控件规格决定。

import { get, px, resolveMap } from './shared.mjs';

export const VAR_MAP = [
  ['--radius', (t) => px(get(t, 'radius.base'))],
  ['--radius-tag', (t) => px(get(t, 'radius.sm'))],
  ['--radius-card', (t) => px(get(t, 'radius.lg'))],
  ['--background', 'color.bg.page'],
  ['--foreground', 'color.text.primary'],
  ['--card', 'color.bg.container'],
  ['--card-foreground', 'color.text.primary'],
  ['--popover', 'color.bg.elevated'],
  ['--popover-foreground', 'color.text.primary'],
  ['--primary', 'color.brand.base'],
  ['--primary-foreground', 'color.text.inverse'],
  ['--primary-hover', 'color.brand.hover'],
  ['--primary-active', 'color.brand.active'],
  ['--primary-bg', 'color.brand.bg'],
  ['--primary-bg-hover', 'color.brand.bgHover'],
  ['--primary-border', 'color.brand.border'],
  ['--secondary', 'color.bg.tableHeader'],
  ['--secondary-foreground', 'color.text.primary'],
  ['--muted', 'color.bg.tableHeader'],
  ['--muted-foreground', 'color.text.secondary'],
  ['--accent', 'color.bg.fillTertiary'],
  ['--accent-foreground', 'color.text.primary'],
  ['--destructive', 'color.status.error.solid'],
  ['--destructive-foreground', 'color.text.inverse'],
  ['--border', 'color.border.default'],
  ['--border-secondary', 'color.border.secondary'],
  ['--input', 'color.border.default'],
  ['--ring', 'color.brand.base'],
  ['--text-tertiary', 'color.text.tertiary'],
  ['--text-placeholder', 'color.text.placeholder'],
  ['--text-disabled', 'color.text.disabled'],
  ['--bg-disabled', 'color.bg.disabled'],
  ['--table-header', 'color.bg.tableHeader'],
  ['--track', 'color.bg.track'],
  ...['processing', 'success', 'warning', 'error'].flatMap((s) => [
    [`--status-${s}`, `color.status.${s}.text`],
    [`--status-${s}-bg`, `color.status.${s}.bg`],
    [`--status-${s}-border`, `color.status.${s}.border`],
    [`--status-${s}-solid`, `color.status.${s}.solid`]
  ]),
  // 工程沿用 antd 预设色名：geekblue = 中立 shipped，default = 中立 neutral。
  ['--status-geekblue', 'color.status.shipped.text'],
  ['--status-geekblue-bg', 'color.status.shipped.bg'],
  ['--status-geekblue-border', 'color.status.shipped.border'],
  ['--status-default', 'color.status.neutral.text'],
  ['--status-default-bg', 'color.status.neutral.bg'],
  ['--status-default-border', 'color.status.neutral.border'],
  ['--font-family-base', 'font.family'],
  ['--font-family-mono', 'font.familyMono'],
  ['--font-size-base', (t) => px(get(t, 'font.size.base'))],
  ['--font-size-sm', (t) => px(get(t, 'font.size.sm'))],
  ['--font-size-page-title', (t) => px(get(t, 'font.size.pageTitle'))],
  ['--font-weight-strong', 'font.weight.strong'],
  ['--line-height-base', 'font.lineHeight.base'],
  ['--shadow-elevated', 'shadow.secondary']
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
