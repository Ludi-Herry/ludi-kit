import { createRequire } from 'node:module';
import { parse, walk, unwrap, property, name, raw, edits } from './ast.mjs';
const require = createRequire(import.meta.url);
const seed = require('../../node_modules/antd/lib/theme/themes/seed.js').default;

// 「基础」六分组的全部可写字段（协议主题字段，26 个）。spaceSm/Md/Lg 只写 generated/styles.css 的 --do-space-*，
// shadowLevel 映射成 boxShadow / boxShadowSecondary 两行 token，colorLink 仍派生跟随 colorPrimary（非独立字段）。
export const themeKeys = [
  'colorPrimary', 'colorSuccess', 'colorWarning', 'colorError', 'colorInfo',
  'colorText', 'colorTextSecondary', 'colorBorder', 'colorBgBase', 'colorBgContainer',
  'fontFamily', 'fontFamilyCode', 'fontSize', 'lineHeight',
  'sizeUnit', 'sizeStep', 'spaceSm', 'spaceMd', 'spaceLg', 'controlHeight',
  'borderRadius', 'borderRadiusLG', 'lineWidth', 'shadowLevel', 'motion', 'motionUnit'
];
const colorKeys = themeKeys.slice(0, 10);
const fontKeys = ['fontFamily', 'fontFamilyCode'];
// token 直写字段 = 26 个协议字段减去 CSS 专用的 space* 与档位字段 shadowLevel。
const tokenKeys = themeKeys.filter(k => !['spaceSm', 'spaceMd', 'spaceLg', 'shadowLevel'].includes(k));

// 数值分两档：阶梯值沿用现有行为（就近吸附并夹回），严格范围值越界一律拒绝。
export const tokenRules = {
  colorPrimary: { type: 'color' }, colorSuccess: { type: 'color' }, colorWarning: { type: 'color' },
  colorError: { type: 'color' }, colorInfo: { type: 'color' }, colorText: { type: 'color' },
  colorTextSecondary: { type: 'color' }, colorBorder: { type: 'color' },
  colorBgBase: { type: 'color' }, colorBgContainer: { type: 'color' },
  fontFamily: { type: 'font' }, fontFamilyCode: { type: 'font' },
  borderRadius: { type: 'number', min: 0, max: 16, step: 2, values: [0, 2, 4, 6, 8, 10, 12, 14, 16] },
  borderRadiusLG: { type: 'number', min: 0, max: 16, step: 2, values: [0, 2, 4, 6, 8, 10, 12, 14, 16] },
  fontSize: { type: 'number', min: 12, max: 20, step: 2, values: [12, 14, 16, 18, 20] },
  controlHeight: { type: 'number', min: 24, max: 48, step: 2, values: Array.from({length: 13}, (_, i) => 24 + i * 2) },
  lineHeight: { type: 'number', min: 1.3, max: 2, step: 0.05, strict: true },
  sizeUnit: { type: 'number', min: 2, max: 8, step: 1, strict: true, integer: true },
  sizeStep: { type: 'number', min: 2, max: 8, step: 1, strict: true, integer: true },
  spaceSm: { type: 'number', min: 4, max: 48, step: 2, strict: true, integer: true },
  spaceMd: { type: 'number', min: 4, max: 48, step: 2, strict: true, integer: true },
  spaceLg: { type: 'number', min: 4, max: 48, step: 2, strict: true, integer: true },
  lineWidth: { type: 'number', min: 1, max: 3, step: 1, strict: true, integer: true },
  motionUnit: { type: 'number', min: 0.05, max: 0.2, step: 0.01, strict: true },
  shadowLevel: { type: 'enum', values: ['none', 'light', 'default', 'deep'] },
  motion: { type: 'boolean' }
};

// 阴影档位 → boxShadow / boxShadowSecondary（antd 6.5.0 getDesignToken 默认值为 default 档，空白已折叠）。
// 客户端 theme-rules.ts 内有一份内容一致的副本，改动必须两端同步。
export const SHADOW_LEVELS = {
  none: { label: '无', boxShadow: 'none', boxShadowSecondary: 'none' },
  light: {
    label: '轻',
    boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.06), 0 1px 3px -2px rgba(0, 0, 0, 0.08)',
    boxShadowSecondary: '0 2px 6px 0 rgba(0, 0, 0, 0.04)'
  },
  default: {
    label: '默认',
    boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
    boxShadowSecondary: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)'
  },
  deep: {
    label: '深',
    boxShadow: '0 9px 28px 8px rgba(0, 0, 0, 0.08), 0 6px 16px 0 rgba(0, 0, 0, 0.12), 0 3px 6px -4px rgba(0, 0, 0, 0.16)',
    boxShadowSecondary: '0 9px 28px 8px rgba(0, 0, 0, 0.06), 0 6px 16px 0 rgba(0, 0, 0, 0.1), 0 3px 6px -4px rgba(0, 0, 0, 0.12)'
  }
};

// seed 缺省（或派生）字段的显式回退，保证读出的 26 字段完整。
// lineHeight（antd 派生 1.57）、borderRadiusLG（派生 8）不在 seed.js 里，手填的回退与 antd 6.5.0 派生一致。
const FALLBACK = {
  colorText: '#000000', colorTextSecondary: '#595959', colorBorder: '#d9d9d9',
  lineHeight: 1.57, borderRadiusLG: 8, shadowLevel: 'default', motion: true, lineWidth: 1
};

export function contrastPair(foreground, background) {
  const lum = hex => {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  };
  const a = lum(foreground), b = lum(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
export function contrast(color) { return contrastPair(color, '#ffffff'); }

// 前景色对指定背景不达标时：按亮度逐档调暗，返回第一个满足 4.5:1 的 hex。
export function suggestedAgainst(color, background, minimum = 4.5) {
  const rgb = color.slice(1).match(/../g).map(v => parseInt(v, 16));
  for (let i = 0; i <= 255; i++) {
    const next = '#' + rgb.map(v => Math.max(0, v - i).toString(16).padStart(2, '0')).join('');
    if (contrastPair(next, background) >= minimum) return next;
  }
  return '#000000';
}
export function suggestedColor(color) { return suggestedAgainst(color, '#ffffff'); }

// 字体族：逗号分隔列表，只接受字母、数字、中文、空格、连字符、引号与逗号，长度不超过 300；
// 白名单天然排除 ; { } < > \ / 与 url(。末尾不是通用族时按字段补 sans-serif / monospace。
const FONT_ALLOWED = /^[\p{L}\p{N}\s,'"-]+$/u;
const GENERIC_FAMILIES = ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
function normalizeFont(value, key) {
  if (typeof value !== 'string') throw new Error('字体族必须为字符串');
  const items = value.split(',').map(item => item.trim()).filter(Boolean).join(', ');
  if (!items) throw new Error('字体族不能为空');
  if (items.length > 300) throw new Error('字体族长度不能超过 300 字符');
  if (!FONT_ALLOWED.test(items)) throw new Error('字体族含不允许的字符（仅接受字母、数字、中文、空格、连字符、引号与逗号）');
  const last = items.split(',').at(-1).trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (!GENERIC_FAMILIES.includes(last)) return `${items}, ${key === 'fontFamilyCode' ? 'monospace' : 'sans-serif'}`;
  return items;
}

function normalizeColor(value) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('颜色必须为六位十六进制');
  return value.toLowerCase();
}

// current：服务端从项目源码读出的当前主题（不信任客户端）。对比度只拦「把值改成不达标」：
// 构成检查配对的客户端值与当前源码值一致时（未改动），现状不达标降为 pass + 建议色提示，不阻断其他字段写回。
export function normalizeTheme(theme, current) {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme) || Object.keys(theme).length !== themeKeys.length || themeKeys.some(k => !(k in theme))) throw new Error(`主题必须包含协议的 ${themeKeys.length} 个字段`);
  const normalized = {}, rules = [];
  for (const key of themeKeys) {
    const rule = tokenRules[key], value = theme[key];
    if (rule.type === 'color') normalized[key] = normalizeColor(value);
    else if (rule.type === 'font') normalized[key] = normalizeFont(value, key);
    else if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`${key} 必须为布尔值`);
      normalized[key] = value;
    } else if (rule.type === 'enum') {
      if (typeof value !== 'string' || !rule.values.includes(value)) throw new Error(value === 'custom' ? '源码中的阴影值不是档位，请先手工对齐后再用编辑器调整' : `${key} 取值不在档位内`);
      normalized[key] = value;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Token 数值无效');
      if (rule.strict) {
        if (value < rule.min || value > rule.max) throw new Error(`${key} 超出允许范围 ${rule.min}–${rule.max}`);
        if (rule.integer && !Number.isInteger(value)) throw new Error(`${key} 必须为整数`);
        normalized[key] = value;
      } else normalized[key] = rule.values.reduce((best, item) => Math.abs(item - value) < Math.abs(best - value) ? item : best, rule.values[0]);
    }
    let message = `${key} = ${normalized[key]}`;
    if (['colorSuccess', 'colorWarning', 'colorInfo'].includes(key)) message += ` · 对白对比度 ${contrast(normalized[key]).toFixed(2)}（仅提示，不拦截）`;
    rules.push({ id: `token.${key}`, status: 'pass', message });
  }
  if (!(normalized.spaceSm <= normalized.spaceMd && normalized.spaceMd <= normalized.spaceLg)) throw new Error('--do-space 三档必须满足 sm ≤ md ≤ lg');
  const unchanged = key => typeof current?.[key] !== 'undefined' && normalizeColor(String(current[key])) === normalized[key];
  const guard = (key, pairs, label) => {
    // pairs: [{fg, bgName, bg, bgLabel}]；任一配对发生变化且对比度不足 4.5 → fail；未变化但现状不足 → pass + 建议色。
    // 文案与既有断言一致：fail「<label>与<bgLabel>对比度不足 4.5:1」，现状提示「现状<label>对比度 X 低于 4.5:1，建议 #xxxxxx」。
    const failing = [], suggestive = [];
    for (const pair of pairs) {
      const ratio = contrastPair(normalized[pair.fg], pair.bg);
      if (ratio >= 4.5) continue;
      const changed = !unchanged(pair.fg) || (pair.bgName ? !unchanged(pair.bgName) : false);
      (changed ? failing : suggestive).push({ ...pair, ratio });
    }
    const index = themeKeys.indexOf(key);
    if (failing.length) {
      const first = failing[0];
      rules[index] = { id: `token.${key}`, status: 'fail', message: `${label}与${first.bgLabel}对比度不足 4.5:1`, suggestedValue: suggestedAgainst(normalized[key], first.bg) };
    } else if (suggestive.length) {
      const first = suggestive[0], suggestedValue = suggestedAgainst(normalized[key], first.bg);
      rules[index] = { id: `token.${key}`, status: 'pass', message: `现状${label}对比度 ${first.ratio.toFixed(2)} 低于 4.5:1，建议 ${suggestedValue}`, suggestedValue };
    }
  };
  guard('colorPrimary', [{ fg: 'colorPrimary', bgName: null, bg: '#ffffff', bgLabel: '白字' }], '主色');
  guard('colorError', [{ fg: 'colorError', bgName: null, bg: '#ffffff', bgLabel: '白字' }], '错误色');
  guard('colorText', [
    { fg: 'colorText', bgName: 'colorBgContainer', bg: normalized.colorBgContainer, bgLabel: '容器底色' },
    { fg: 'colorText', bgName: 'colorBgBase', bg: normalized.colorBgBase, bgLabel: '页面底色' }
  ], '文字色');
  guard('colorTextSecondary', [{ fg: 'colorTextSecondary', bgName: 'colorBgContainer', bg: normalized.colorBgContainer, bgLabel: '容器底色' }], '次级文字');
  return { theme: normalized, rules };
}

export function themeObject(source) {
  const ast = parse(source); let root;
  walk(ast, n => { if (n.type === 'VariableDeclarator' && n.id.name === 'deviceOpsTheme') root = unwrap(n.init); });
  if (root?.type !== 'ObjectExpression') throw new Error('deviceOpsTheme 必须为静态对象');
  return root;
}
export function safeObject(node) {
  if (node?.type !== 'ObjectExpression' || node.properties.some(p => p.type !== 'ObjectProperty' || p.computed || p.method)) throw new Error('动态主题对象不允许写回');
  const keys = node.properties.map(p => name(p.key));
  if (new Set(keys).size !== keys.length) throw new Error('重复主题字段');
  return node;
}
export function literal(node) {
  if (!['NumericLiteral', 'StringLiteral', 'BooleanLiteral'].includes(node?.type)) throw new Error('Token 或组件覆盖必须为静态值');
  return node.value;
}

// L0 与组件覆盖的同步对应：同名（组件项名 ∈ token 直写字段）或同义词映射。
const SYNC_SYNONYMS = { itemBorderRadius: 'borderRadius', bodyBg: 'colorBgBase', headerBg: 'colorBgContainer', siderBg: 'colorBgContainer', borderColor: 'colorBorder' };
export function syncTarget(key) { return tokenKeys.includes(key) ? key : SYNC_SYNONYMS[key] ?? null; }

// Global values exclude component overrides so a component cannot classify itself as following.
export function globalValues(source, css) {
  return readTheme(source, css);
}

// 组件项与全局值的相等判定：颜色忽略大小写，其余严格相等。
export function valuesEqual(a, b) {
  if (typeof a === 'string' && typeof b === 'string' && /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b)) return a.toLowerCase() === b.toLowerCase();
  return a === b;
}
const collapse = value => String(value).replace(/\s+/g, ' ').trim();

function readCssSpace(css) {
  const out = {};
  for (const [key, variable] of [['spaceSm', '--do-space-sm'], ['spaceMd', '--do-space-md'], ['spaceLg', '--do-space-lg']]) {
    const match = new RegExp(`${variable}\\s*:\\s*(\\d+)px`).exec(css);
    if (!match) throw new Error(`styles.css 缺少 ${variable} 声明`);
    out[key] = Number(match[1]);
  }
  return out;
}

export function readTheme(source, css) {
  const root = safeObject(themeObject(source)), token = safeObject(property(root, 'token')?.value);
  const theme = Object.fromEntries(tokenKeys.map(key => {
    const prop = property(token, key);
    let value = prop ? literal(prop.value) : key in seed ? seed[key] : FALLBACK[key];
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) value = value.toLowerCase();
    return [key, value];
  }));
  theme.lineHeight = Math.round(Number(theme.lineHeight) * 100) / 100;
  Object.assign(theme, readCssSpace(css));
  // 阴影档位：token 里没有 boxShadow 时 antd 运行态回退默认值，按 default 档读出；显式值与档位表折叠空白后逐项比对。
  const shadowProp = property(token, 'boxShadow');
  theme.shadowLevel = 'default';
  if (shadowProp) {
    const value = collapse(literal(shadowProp.value));
    theme.shadowLevel = 'custom';
    for (const [level, entry] of Object.entries(SHADOW_LEVELS)) if (entry.boxShadow === value) { theme.shadowLevel = level; break; }
  }
  // 读不出完整的 26 个协议字段就是读取失败：fail closed，不部分放行。
  if (themeKeys.some(k => typeof theme[k] === 'undefined') || !Number.isFinite(theme.lineHeight)) throw new Error('主题读取不完整，停止写回');
  return theme;
}

export function changeTheme(source, css, theme) {
  const root = safeObject(themeObject(source)), token = safeObject(property(root, 'token')?.value), comps = safeObject(property(root, 'components')?.value), changes = [];
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  function set(object, key, value, required = false) {
    const prop = property(object, key);
    if (prop) { literal(prop.value); changes.push({start: prop.value.start, end: prop.value.end, text: JSON.stringify(value)}); }
    else if (required) missing.push(`${key}: ${JSON.stringify(value)}`);
  }
  const missing = [];
  for (const key of tokenKeys) set(token, key, theme[key], true);
  // colorLink 是 antd 种子 token、默认为空（运行时回退 colorInfo）；主色写回时派生同步。
  // colorLinkHover/colorLinkActive 由 genColorMapToken 从 colorLink 调色板再派生，无需另行写回。
  set(token, 'colorLink', theme.colorPrimary, true);
  // 阴影档位展开为两条 token；档位表固定，客户端不能提交任意阴影字符串。
  const level = SHADOW_LEVELS[theme.shadowLevel];
  if (!level) throw new Error('阴影档位无效');
  set(token, 'boxShadow', level.boxShadow, true);
  set(token, 'boxShadowSecondary', level.boxShadowSecondary, true);
  if (missing.length) {
    const last = token.properties.at(-1), tail = source.slice(last?.end ?? token.start + 1, token.end - 1);
    changes.push({start: token.end - 1, end: token.end - 1, text: `${last && !tail.includes(',') ? ',' : ''}${eol}    ${missing.join(`,${eol}    `)}${eol}  `});
  }
  // 跟随 / 单独设置（Owner 2026-10-02 裁决 A）：组件项源码值等于改动前全局有效值视为「跟随」，继续同步；
  // 不等的视为「已单独设置」，L0 写回不覆盖它。
  const globals = globalValues(source, css);
  for (const comp of comps.properties) {
    const object = safeObject(comp.value);
    for (const prop of object.properties) {
      const key = name(prop.key), target = syncTarget(key);
      if (target && valuesEqual(literal(prop.value), globals[target])) set(object, key, theme[target]);
    }
  }
  const mapped = {'--do-primary': 'colorPrimary', '--do-bg': 'colorBgBase', '--do-surface': 'colorBgContainer', '--do-text': 'colorText', '--do-text-secondary': 'colorTextSecondary', '--do-border': 'colorBorder', '--do-space-sm': 'spaceSm', '--do-space-md': 'spaceMd', '--do-space-lg': 'spaceLg', '--do-font-size': 'fontSize', '--do-radius': 'borderRadius', '--do-control-height': 'controlHeight'};
  const counts = {};
  const nextCss = css.replace(/(--do-(?:primary|bg|surface|text-secondary|text|border|space-sm|space-md|space-lg|font-size|radius|control-height)\s*:\s*)([^;{}]+)(;)/g, (all, prefix, value, suffix) => {
    const variable = prefix.split(':')[0].trim(), key = mapped[variable]; counts[key] = (counts[key] ?? 0) + 1;
    return prefix + theme[key] + (typeof theme[key] === 'number' ? 'px' : '') + suffix;
  });
  if (['colorPrimary', 'colorBgBase', 'colorBgContainer', 'colorText', 'colorTextSecondary', 'colorBorder', 'spaceSm', 'spaceMd', 'spaceLg'].some(k => !counts[k])) throw new Error('缺少必需 CSS Token 声明');
  return [edits(source, changes), nextCss];
}
