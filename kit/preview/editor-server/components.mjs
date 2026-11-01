import { unwrap, property, name, edits } from './ast.mjs';
import { createRequire } from 'node:module';
import { COMPONENT_TOKENS, P0_COMPONENT_NAMES } from './component-tokens.mjs';
import { contrastPair, suggestedAgainst, globalValues, syncTarget, valuesEqual, themeObject, safeObject, literal } from './theme.mjs';

const require = createRequire(import.meta.url);
const { theme: antdTheme } = require('antd');
const { FastColor } = require('@ant-design/fast-color');
const preparers = Object.fromEntries(P0_COMPONENT_NAMES.map(component => {
  const path = component.toLowerCase();
  const module = require(`antd/lib/${path}/style/${['Button','Select'].includes(component) ? 'token' : 'index'}.js`);
  return [component, module.prepareComponentToken ?? module.initComponentToken];
}));

// Use the installed, contract-pinned AntD defaults instead of guessing missing source overrides.
// deriveDefaults：给定 26 字段全局种子，按 antd 自己的链（getDesignToken + 各组件 prepare）算组件默认值。
// 写回校验与预览派生共用同一条链，任何一边升级 antd 不会岔开。
export function deriveDefaults(seed) {
  const global = antdTheme.getDesignToken({ token: seed });
  const components = Object.fromEntries(P0_COMPONENT_NAMES.map(component => [component,
    Object.fromEntries(Object.entries(preparers[component](global)).filter(([, value]) => typeof value === 'string' || typeof value === 'number'))
  ]));
  return { global, components };
}

export function componentDefaults(source) {
  const root = themeObject(source), token = safeObject(property(root, 'token')?.value);
  const seed = Object.fromEntries(token.properties.map(prop => [name(prop.key), literal(prop.value)]));
  return deriveDefaults(seed);
}

function color(value) {
  if (value === 'transparent') return new FastColor({ r: 0, g: 0, b: 0, a: 0 });
  return typeof value === 'string' && /^(?:#[0-9a-f]{3,8}|rgba?\(|hsla?\(|transparent$)/i.test(value) ? new FastColor(value) : null;
}

function contrastColors(component, def, current, changes, defaults, global) {
  const effective = { ...defaults[component], ...current[component] };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) effective[key] = defaults[component]?.[key];
    else effective[key] = value;
  }
  const foreground = color(effective[def.name]);
  const background = color(def.pair.startsWith('global:') ? global[def.pair.slice(7)] : effective[def.pair]);
  const underlay = color(component === 'Modal' ? effective.contentBg : global.colorBgContainer);
  if (!foreground || !background || !underlay) return null;
  const opaqueBackground = background.onBackground(underlay.onBackground(new FastColor('#ffffff')));
  return [foreground.onBackground(opaqueBackground).toHexString(), opaqueBackground.toHexString()];
}

// component-tokens.mjs 结构与 src/editor/component-token.ts 同步；服务端只消费校验所需字段。
const defs = new Map();
for (const component of P0_COMPONENT_NAMES) for (const def of COMPONENT_TOKENS[component]) defs.set(`${component}.${def.name}`, def);

function normalizeColor(value, key) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${key} 必须为六位十六进制颜色`);
  return value.toLowerCase();
}

// tokens: {name: value|null}。value 为 null = 删除该项（恢复跟随全局）。
// current：{comp: {key: value}} 当前源码读出的组件项；theme：当前 L0 主题（26 字段，global: 配对用它求值）。
export function normalizeComponentTokens(component, tokens, current, theme, defaults) {
  if (!P0_COMPONENT_NAMES.includes(component)) throw new Error(`组件「${component}」不在九个 P0 组件登记范围`);
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens) || Object.keys(tokens).length === 0) throw new Error('tokens 必须至少包含一项');
  if (Object.keys(tokens).length > 40) throw new Error('单次写回的 token 项数超限');
  const normalized = {}, rules = [];
  for (const [key, value] of Object.entries(tokens)) {
    const def = defs.get(`${component}.${key}`);
    if (!def) throw new Error(`组件 ${component} 未登记 token「${key}」`);
    if (!def.writable) throw new Error(`token「${key}」为只读：${def.reason}`);
    if (value === null) { normalized[key] = null; continue; }
    if (def.type === 'color') normalized[key] = normalizeColor(value, key);
    else if (def.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} 必须为有限数值`);
      const { min, max, integer } = def.range;
      if (value < min || value > max) throw new Error(`${key} 超出允许范围 ${min}–${max}`);
      if (integer && !Number.isInteger(value)) throw new Error(`${key} 必须为整数`);
      normalized[key] = value;
    } else throw new Error(`token「${key}」类型不明，暂不开放写回`);
    rules.push({ id: `component.${component}.${key}`, status: 'pass', message: `${component}.${key} = ${typeof normalized[key] === 'string' ? normalized[key] : normalized[key]}` });
  }
  // Resolve both sides, including AntD defaults and transparent Modal header backgrounds.
  for (const def of COMPONENT_TOKENS[component]) {
    if (!def.pair || !def.writable) continue;
    const key = def.name;
    const pair = def.pair;
    const before = contrastColors(component, def, current, {}, defaults?.components ?? {}, defaults?.global ?? theme);
    const after = contrastColors(component, def, current, normalized, defaults?.components ?? {}, defaults?.global ?? theme);
    if (!after || !before) {
      const changed = key in normalized || pair in normalized || (component === 'Modal' && 'contentBg' in normalized);
      rules.push({ id: `component.${component}.${key}.contrast`, status: changed ? 'fail' : 'pass', message: changed ? '无法解析文字与背景的有效颜色，禁止写回' : '当前配对无法解析；未改动，不阻断其他项' });
      continue;
    }
    const [fg, bg] = after;
    const ratio = contrastPair(fg, bg);
    if (ratio >= 4.5) continue;
    const changed = fg !== before[0] || bg !== before[1];
    if (changed) {
      rules.push({ id: `component.${component}.${key}.contrast`, status: 'fail', message: `${component}.${key} 与背景对比度 ${ratio.toFixed(2)}:1，低于 4.5:1，禁止写回`, suggestedValue: suggestedAgainst(fg, bg) });
    } else {
      const suggestion = suggestedAgainst(fg, bg);
      rules.push({ id: `component.${component}.${key}.contrast`, status: 'pass', message: `现状对比度 ${ratio.toFixed(2)} 低于 4.5:1，建议 ${suggestion}；未改动，不阻断其他 token 写回`, suggestedValue: suggestion });
    }
  }
  return { tokens: normalized, rules };
}

// 读出 theme.ts 里每个组件已写的项：{comp: {key: value}}
export function readComponentState(source) {
  const root = themeObject(source), comps = safeObject(property(root, 'components')?.value);
  const out = {};
  for (const compProp of comps.properties) {
    const comp = name(compProp.key), object = safeObject(unwrap(compProp.value));
    out[comp] = {};
    for (const prop of object.properties) out[comp][name(prop.key)] = literal(prop.value);
  }
  return out;
}

// bootstrap 下发的每个组件项状态：与全局 token/default 比较源码值（hex 规范化比较），
// 相等即「跟随」，不等即「已单独设置」；无全局对应也算「已单独设置」（L0 本来就不动它）。
export function componentTokenStatus(source, css) {
  const state = readComponentState(source), globals = globalValues(source, css), out = {};
  for (const [comp, entries] of Object.entries(state)) {
    out[comp] = {};
    for (const [key, value] of Object.entries(entries)) {
      const target = syncTarget(key);
      const following = Boolean(target) && valuesEqual(value, globals[target]);
      out[comp][key] = { value, status: following ? 'following' : 'custom', global: target ?? null };
    }
  }
  return out;
}

function deleteProperty(changes, list, target) {
  const index = list.indexOf(target);
  if (index === -1) throw new Error('内部定位失败');
  if (index === list.length - 1 && index > 0) changes.push({ start: list[index - 1].end, end: target.end, text: '' });
  else if (index === 0 && list.length === 1) changes.push({ start: target.start, end: target.end, text: '' });
  else changes.push({ start: target.start, end: list[index + 1].start, text: '' });
}

export function changeComponentTokens(source, component, tokens) {
  const root = themeObject(source), comps = safeObject(property(root, 'components')?.value);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const changes = [];
  const compProp = property(comps, component);
  const additions = Object.entries(tokens).filter(([, value]) => value !== null);
  const deletions = Object.entries(tokens).filter(([, value]) => value === null).map(([key]) => key);
  if (!compProp) {
    if (deletions.length) throw new Error('恢复跟随全局的组件在源码中没有记录，未做写回');
    const text = `${component}: { ${additions.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ')} }`;
    const last = comps.properties.at(-1), tail = source.slice(last?.end ?? comps.start + 1, comps.end - 1);
    changes.push({ start: comps.end - 1, end: comps.end - 1, text: `${last && !tail.includes(',') ? ',' : ''}${eol}    ${text}${eol}  ` });
    return edits(source, changes);
  }
  const object = safeObject(unwrap(compProp.value));
  const knownKeys = object.properties.map(p => name(p.key));
  const finalKeys = new Set([...knownKeys.filter(key => !deletions.includes(key)), ...additions.map(([key]) => key)]);
  if (finalKeys.size === 0) {
    deleteProperty(changes, comps.properties, compProp);
    return edits(source, changes);
  }
  for (const [key, value] of additions) {
    const prop = property(object, key);
    if (prop) { literal(prop.value); changes.push({ start: prop.value.start, end: prop.value.end, text: JSON.stringify(value) }); }
    else {
      const last = object.properties.at(-1);
      if (!last) throw new Error('组件对象为空，无法追加');
      const singleLine = !source.slice(object.start, object.end).includes('\n');
      if (singleLine) changes.push({ start: last.end, end: last.end, text: `, ${key}: ${JSON.stringify(value)}` });
      else changes.push({ start: last.end, end: last.end, text: `,${eol}    ${key}: ${JSON.stringify(value)}` });
    }
  }
  // 删除按连续区段合成一个 edit，避免相邻删除的区间重叠。
  const indices = object.properties.map((p, i) => deletions.includes(name(p.key)) ? i : -1).filter(i => i >= 0).sort((a, b) => a - b);
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const first = run[0], last = run[run.length - 1];
    if (last === object.properties.length - 1 && first > 0) changes.push({ start: object.properties[first - 1].end, end: object.properties[last].end, text: '' });
    else changes.push({ start: object.properties[first].start, end: object.properties[last + 1].start, text: '' });
    run = [];
  };
  for (const i of indices) {
    if (run.length && i === run[run.length - 1] + 1) run.push(i);
    else { flush(); run = [i]; }
  }
  flush();
  return edits(source, changes);
}
