#!/usr/bin/env node
// 从 antd 天枢现版抽取中立 token 初稿（Owner 10-10 裁决：目标外观以 antd 现版为初稿，签字后生效）。
// 数值来源：antd theme.getDesignToken(deviceOpsTheme) 的解析结果、@ant-design/colors 预设色板，
// 以及天枢页面级样式的实测值（视觉探针 antd 原始数据）。每个 token 都记录 source，便于追溯。
// 输出是「按角色命名」的中立文件，不使用任何组件库的 token 名作为键。
//
// 用法：node scripts/derive-tianshu-neutral-tokens.mjs [--out design-systems/tianshu/tokens.neutral.json]

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(KIT, 'package.json'));
const { theme } = require('antd');
const { presetPalettes } = require('@ant-design/colors');
const esbuild = createRequire(resolve(KIT, 'preview/package.json'))('esbuild');

const outArg = process.argv.indexOf('--out');
const outPath = resolve(KIT, outArg > 0 ? process.argv[outArg + 1] : 'design-systems/tianshu/tokens.neutral.json');

// 读 antd 天枢主题（TS，只含 import type），转成可执行模块。
const themePath = resolve(KIT, 'projects/tianshu-device-ops/theme.ts');
const themeSrc = readFileSync(themePath, 'utf8');
const js = esbuild.transformSync(themeSrc, { loader: 'ts', format: 'esm' }).code;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const cfg = mod.deviceOpsTheme;
const t = theme.getDesignToken(cfg);

// 页面级实测值（antd 基准），来自视觉探针原始数据。
const probePath = resolve(KIT, 'workflows/evidence/foundation-parity-2026-10-10/routes/dashboard/parity-report.json');
const probe = JSON.parse(readFileSync(probePath, 'utf8'));
const h1 = probe.raw.antd.results.h1.text;
const tagProbe = JSON.parse(readFileSync(resolve(KIT, 'workflows/evidence/foundation-parity-2026-10-10/routes/feedback/parity-report.json'), 'utf8'));
const neutralTagBg = tagProbe.raw.antd.results['tag:类型'].boxStyle.backgroundColor;

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v);
const tok = (value, source, note) => (note ? { value: clean(value), source, note } : { value: clean(value), source });
const a = (name, note) => tok(t[name], `antd:${name}`, note);
const pal = (name) => Object.fromEntries(presetPalettes[name].map((v, i) => [String(i + 1), tok(v, `palette:${name}.${i + 1}`)]));
const statusFamily = (palette, solidSource) => ({
  text: tok(presetPalettes[palette][6], `palette:${palette}.7`),
  bg: tok(presetPalettes[palette][0], `palette:${palette}.1`),
  border: tok(presetPalettes[palette][2], `palette:${palette}.3`),
  solid: solidSource ? a(solidSource) : tok(presetPalettes[palette][5], `palette:${palette}.6`)
});

const tokens = {
  color: {
    brand: {
      base: a('colorPrimary'),
      hover: a('colorPrimaryHover'),
      active: a('colorPrimaryActive'),
      bg: a('colorPrimaryBg'),
      bgHover: a('colorPrimaryBgHover'),
      border: a('colorPrimaryBorder'),
      borderHover: a('colorPrimaryBorderHover'),
      text: a('colorPrimaryText'),
      textHover: a('colorPrimaryTextHover'),
      textActive: a('colorPrimaryTextActive')
    },
    text: {
      primary: a('colorText', '正文、标题'),
      heading: a('colorTextHeading'),
      secondary: a('colorTextSecondary', '次要文字、描述'),
      tertiary: a('colorTextTertiary'),
      quaternary: a('colorTextQuaternary'),
      placeholder: a('colorTextPlaceholder'),
      disabled: a('colorTextDisabled'),
      inverse: a('colorTextLightSolid', '深色底上的文字，如主按钮'),
      link: a('colorLink')
    },
    bg: {
      page: tok(cfg.components?.Layout?.bodyBg ?? t.colorBgLayout, cfg.components?.Layout?.bodyBg ? 'antd:components.Layout.bodyBg' : 'antd:colorBgLayout', '页面底色'),
      container: a('colorBgContainer', '卡片、表格、输入框底色'),
      elevated: a('colorBgElevated', '弹层、下拉、抽屉'),
      tableHeader: tok(cfg.components?.Table?.headerBg, 'antd:components.Table.headerBg'),
      track: a('colorBgLayout', '分段控制器轨道等嵌入式底色；天枢页面底色另由 page 定义，两者不同'),
      spotlight: a('colorBgSpotlight', 'Tooltip 底色'),
      mask: a('colorBgMask'),
      disabled: a('colorBgContainerDisabled'),
      fill: a('colorFill'),
      fillSecondary: a('colorFillSecondary'),
      fillTertiary: a('colorFillTertiary', '悬停底色'),
      fillQuaternary: a('colorFillQuaternary')
    },
    border: {
      default: a('colorBorder', '输入框、按钮描边'),
      secondary: a('colorBorderSecondary', '卡片、表格分隔'),
      split: a('colorSplit')
    },
    // 状态语义色：天枢业务枚举（data.ts meta）按以下五族取色；Tag 等组件用 text/bg/border，实心用 solid。
    status: {
      processing: statusFamily('blue', 'colorInfo'),
      success: statusFamily('green', 'colorSuccess'),
      warning: statusFamily('gold', 'colorWarning'),
      error: statusFamily('red', 'colorError'),
      shipped: statusFamily('geekblue'),
      neutral: {
        text: a('colorText'),
        bg: tok(neutralTagBg, 'measured:antd 中性 Tag 底色（feedback tag:类型）', 'antd Tag 默认底色，不是 colorFillQuaternary；控件规格复核时更正（10-10）'),
        border: a('colorBorder'),
        solid: a('colorTextTertiary')
      }
    },
    // 完整色板：给只接受色阶的组件库（如 Element Plus 的 light-N）推导用。
    palette: {
      blue: pal('blue'),
      green: pal('green'),
      gold: pal('gold'),
      red: pal('red'),
      geekblue: pal('geekblue')
    }
  },
  radius: {
    xs: a('borderRadiusXS'),
    sm: a('borderRadiusSM', 'Tag 等小件'),
    base: a('borderRadius', '按钮、输入框'),
    lg: a('borderRadiusLG', '卡片、弹窗')
  },
  font: {
    family: a('fontFamily'),
    familyMono: a('fontFamilyCode'),
    size: {
      sm: a('fontSizeSM'),
      base: a('fontSize'),
      lg: a('fontSizeLG'),
      xl: a('fontSizeXL'),
      pageTitle: tok(parseFloat(h1.fontSize), 'measured:antd h1（dashboard）', '页面主标题')
    },
    weight: {
      regular: tok(400, 'antd:默认字重'),
      strong: a('fontWeightStrong', '表头、标题'),
      pageTitle: tok(Number(h1.fontWeight), 'measured:antd h1（dashboard）')
    },
    lineHeight: {
      base: a('lineHeight'),
      sm: a('lineHeightSM'),
      lg: a('lineHeightLG')
    }
  },
  size: {
    control: {
      sm: a('controlHeightSM'),
      base: a('controlHeight', '输入框、下拉'),
      lg: a('controlHeightLG')
    },
    lineWidth: a('lineWidth')
  },
  shadow: {
    base: a('boxShadow'),
    secondary: a('boxShadowSecondary', '弹层'),
    tertiary: a('boxShadowTertiary')
  },
  motion: {
    fast: a('motionDurationFast'),
    mid: a('motionDurationMid'),
    slow: a('motionDurationSlow'),
    easeInOut: a('motionEaseInOut')
  }
};

const out = {
  version: '0.1.0',
  name: 'tianshu',
  status: 'draft-pending-owner-signoff',
  note: '天枢中立 token：按角色命名，不使用任何组件库的 token 名。初稿数值取自 antd 天枢现版，Owner 签字后才是权威；签字前各底座生成器可以消费，但不得据此回改 antd 基准。控件怎么用这些数值（高度、内边距、描边画法）不在本文件，见第 3 阶段控件规格。',
  derivedFrom: {
    antdTheme: { path: 'projects/tianshu-device-ops/theme.ts', sha256: createHash('sha256').update(themeSrc).digest('hex') },
    antdVersion: require('antd/package.json').version,
    probe: { path: 'workflows/evidence/foundation-parity-2026-10-10/routes/dashboard/parity-report.json' }
  },
  tokens
};
// 签字后中立 token 是权威，不能再用 antd 现值整份覆盖；改数值直接改文件并记录裁决依据。
if (existsSync(outPath) && JSON.parse(readFileSync(outPath, 'utf8')).status === 'signed') {
  console.error(`${outPath} 已签字（status: signed），拒绝用 antd 现值覆盖。改数值请直接改该文件并记录裁决依据。`);
  process.exit(1);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
const count = (o) => Object.values(o).reduce((n, v) => n + (v && typeof v === 'object' && !('value' in v) ? count(v) : 1), 0);
console.log(`写出 ${outPath}，${count(tokens)} 个 token`);
