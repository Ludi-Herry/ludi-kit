// antd 主题适配器：中立 token → antd ThemeConfig。
// 派生色（悬停、激活、浅底）也显式写出，不依赖 antd 的自动算法，保证与中立文件逐值一致。

import { get, resolveMap } from './shared.mjs';

// [antd token 名, 中立路径]
export const TOKEN_MAP = [
  ['colorPrimary', 'color.brand.base'],
  ['colorPrimaryHover', 'color.brand.hover'],
  ['colorPrimaryActive', 'color.brand.active'],
  ['colorPrimaryBg', 'color.brand.bg'],
  ['colorPrimaryBgHover', 'color.brand.bgHover'],
  ['colorPrimaryBorder', 'color.brand.border'],
  ['colorPrimaryBorderHover', 'color.brand.borderHover'],
  ['colorPrimaryText', 'color.brand.text'],
  ['colorPrimaryTextHover', 'color.brand.textHover'],
  ['colorPrimaryTextActive', 'color.brand.textActive'],
  ['colorText', 'color.text.primary'],
  ['colorTextHeading', 'color.text.heading'],
  ['colorTextSecondary', 'color.text.secondary'],
  ['colorTextTertiary', 'color.text.tertiary'],
  ['colorTextQuaternary', 'color.text.quaternary'],
  ['colorTextPlaceholder', 'color.text.placeholder'],
  ['colorTextDisabled', 'color.text.disabled'],
  ['colorTextLightSolid', 'color.text.inverse'],
  ['colorLink', 'color.text.link'],
  ['colorBgLayout', 'color.bg.track'],
  ['colorBgContainer', 'color.bg.container'],
  ['colorBgElevated', 'color.bg.elevated'],
  ['colorBgSpotlight', 'color.bg.spotlight'],
  ['colorBgMask', 'color.bg.mask'],
  ['colorBgContainerDisabled', 'color.bg.disabled'],
  ['colorFill', 'color.bg.fill'],
  ['colorFillSecondary', 'color.bg.fillSecondary'],
  ['colorFillTertiary', 'color.bg.fillTertiary'],
  ['colorFillQuaternary', 'color.bg.fillQuaternary'],
  ['colorBorder', 'color.border.default'],
  ['colorBorderSecondary', 'color.border.secondary'],
  ['colorSplit', 'color.border.split'],
  ['colorInfo', 'color.status.processing.solid'],
  ['colorSuccess', 'color.status.success.solid'],
  ['colorWarning', 'color.status.warning.solid'],
  ['colorError', 'color.status.error.solid'],
  ['borderRadiusXS', 'radius.xs'],
  ['borderRadiusSM', 'radius.sm'],
  ['borderRadius', 'radius.base'],
  ['borderRadiusLG', 'radius.lg'],
  ['fontFamily', 'font.family'],
  ['fontFamilyCode', 'font.familyMono'],
  ['fontSizeSM', 'font.size.sm'],
  ['fontSize', 'font.size.base'],
  ['fontSizeLG', 'font.size.lg'],
  ['fontSizeXL', 'font.size.xl'],
  ['fontWeightStrong', 'font.weight.strong'],
  ['lineHeight', 'font.lineHeight.base'],
  ['lineHeightSM', 'font.lineHeight.sm'],
  ['lineHeightLG', 'font.lineHeight.lg'],
  ['controlHeightSM', 'size.control.sm'],
  ['controlHeight', 'size.control.base'],
  ['controlHeightLG', 'size.control.lg'],
  ['lineWidth', 'size.lineWidth'],
  ['boxShadow', 'shadow.base'],
  ['boxShadowSecondary', 'shadow.secondary'],
  ['boxShadowTertiary', 'shadow.tertiary'],
  ['motionDurationFast', 'motion.fast'],
  ['motionDurationMid', 'motion.mid'],
  ['motionDurationSlow', 'motion.slow'],
  ['motionEaseInOut', 'motion.easeInOut']
];

export function toThemeConfig(neutral) {
  const t = neutral.tokens;
  const token = Object.fromEntries(resolveMap(t, TOKEN_MAP).map(([k, v]) => [k, v]));
  return {
    cssVar: { key: 'device-ops' },
    hashed: false,
    token: { ...token, wireframe: false },
    components: {
      Layout: { bodyBg: get(t, 'color.bg.page'), headerBg: get(t, 'color.bg.container'), siderBg: get(t, 'color.bg.container') },
      Table: { headerBg: get(t, 'color.bg.tableHeader'), borderColor: get(t, 'color.border.default') }
    }
  };
}

export function generate(neutral) {
  const config = toThemeConfig(neutral);
  const body = JSON.stringify(config, null, 2);
  return {
    filename: 'theme.generated.ts',
    content: `// 由 kit/scripts/generate-foundation-themes.mjs 从中立 token 生成，勿手改。\n// 控件尺寸覆盖（如 Button.controlHeight）属于控件规格，不在本文件。\nimport type { ThemeConfig } from "antd";\n\nexport const generatedTheme = ${body} satisfies ThemeConfig;\n`
  };
}
