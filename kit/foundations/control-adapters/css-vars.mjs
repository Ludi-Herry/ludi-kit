// 控件规格 → 与框架无关的 CSS 变量（第 3 阶段）。
// 每个「控件.部位.属性[.状态]」生成一个变量，token 引用解析成具体值。
// shadcn 的 components/ui 与 Element Plus 套件都读这批变量；数值只来自中立 token 与控件规格。
//
// 命名：--ctl-<控件>-<部位>-<属性>[-<状态>]，全部转成 kebab-case。
//   例：button.primary.height → --ctl-button-primary-height
//       button.primary.states.hover.background → --ctl-button-primary-bg-hover

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const PROP_VAR = {
  height: 'height', width: 'width', paddingX: 'px', paddingY: 'py', radius: 'radius',
  borderWidth: 'border-width', borderColor: 'border-color',
  borderBottomWidth: 'border-bottom-width', borderBottomColor: 'border-bottom-color',
  background: 'bg', shadow: 'shadow', textColor: 'color', fontSize: 'font-size',
  fontWeight: 'font-weight', lineHeight: 'line-height',
  // 文字距可见外框左 / 上边的距离；内边距写在内层元素上的控件用它表达留白，套件按自身结构换算成 padding。
  insetX: 'inset-x', insetY: 'inset-y',
  paddingRight: 'pr', paddingBottom: 'pb', paddingTop: 'pt',
  // 与同组下一项的水平间距（页签、分段项、单选项）。
  gapX: 'gap-x',
  // 与下一项的纵向间距（页头整列）。
  gapY: 'gap-y'
};
const UNITLESS = new Set(['fontWeight']);
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export function loadSpec(specPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const tokens = JSON.parse(readFileSync(resolve(dirname(specPath), spec.tokens), 'utf8')).tokens;
  return { spec, tokens };
}

function tokenValue(tokens, path) {
  const node = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), tokens);
  if (!node || typeof node !== 'object' || !('value' in node)) throw new Error(`控件规格引用了不存在的 token：${path}`);
  return node.value;
}

export function cssValue(tokens, prop, raw) {
  let v = raw;
  if (typeof v === 'string' && v.startsWith('token:')) v = tokenValue(tokens, v.slice(6));
  if (v === 'none') return prop === 'shadow' ? 'none' : '0px';
  if (typeof v === 'number') return UNITLESS.has(prop) ? String(v) : `${v}px`;
  return String(v);
}

// 返回 [变量名, 值, 来源] 列表；未知属性抛错，避免静默丢失。
export function toVars({ spec, tokens }) {
  const out = [];
  for (const [cid, control] of Object.entries(spec.controls)) {
    for (const [pid, part] of Object.entries(control.parts || {})) {
      const base = `--ctl-${kebab(cid)}-${kebab(pid)}`;
      for (const [prop, raw] of Object.entries(part.props || {})) {
        if (!PROP_VAR[prop]) throw new Error(`${cid}.${pid}: 未知属性 ${prop}`);
        out.push([`${base}-${PROP_VAR[prop]}`, cssValue(tokens, prop, raw), `${cid}.${pid}.${prop}`]);
      }
      for (const [state, props] of Object.entries(part.states || {})) {
        for (const [prop, raw] of Object.entries(props)) {
          if (!PROP_VAR[prop]) throw new Error(`${cid}.${pid}.states.${state}: 未知属性 ${prop}`);
          out.push([`${base}-${PROP_VAR[prop]}-${kebab(state)}`, cssValue(tokens, prop, raw), `${cid}.${pid}.states.${state}.${prop}`]);
        }
      }
    }
  }
  return out;
}

export function generate(loaded) {
  const vars = toVars(loaded);
  const lines = vars.map(([k, v, src]) => `  ${k}: ${v}; /* ${src} */`);
  return {
    filename: 'controls.generated.css',
    vars,
    content: `/* 由 kit/scripts/generate-control-vars.mjs 从控件规格生成，勿手改。\n   来源：design-systems/tianshu/controls.spec.json + tokens.neutral.json */\n:root {\n${lines.join('\n')}\n}\n`
  };
}
