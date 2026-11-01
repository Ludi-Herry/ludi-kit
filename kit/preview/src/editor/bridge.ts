// iframe postMessage 桥接（协议「iframe postMessage 桥接」一节）：
// 信封固定 {channel:"ludi-editor",version:1,projectId,type,payload}；
// origin 恒等于同源，source 逐帧逐项检查，targetOrigin 固定为 location.origin，禁止 "*"。

import { parseBlockOps } from "./block-ops";
import {
  PROJECT_ID,
  PROTOCOL_VERSION,
  THEME_KEYS,
  type ComponentComputedValues,
  type Loc,
  type PreviewPayload,
  type ThemeDraft
} from "./api";

export const BRIDGE_CHANNEL = "ludi-editor";

export type BridgeEnvelope = {
  channel: typeof BRIDGE_CHANNEL;
  version: number;
  projectId: string;
  type: string;
  payload: unknown;
};

export type SelectionRect = { x: number; y: number; width: number; height: number };
export type ComponentSelectedPayload = { loc: Loc; rect: SelectionRect; instanceKey?: string | null; instanceCount?: number };

export function makeEnvelope(type: string, payload: unknown): BridgeEnvelope {
  return { channel: BRIDGE_CHANNEL, version: PROTOCOL_VERSION, projectId: PROJECT_ID, type, payload };
}

export function parseEnvelope(raw: unknown): BridgeEnvelope | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record.channel !== BRIDGE_CHANNEL) return null;
  if (record.version !== PROTOCOL_VERSION) return null;
  if (record.projectId !== PROJECT_ID) return null;
  if (typeof record.type !== "string") return null;
  return {
    channel: BRIDGE_CHANNEL,
    version: PROTOCOL_VERSION,
    projectId: PROJECT_ID,
    type: record.type,
    payload: record.payload
  };
}

export function postToChild(frame: HTMLIFrameElement | null, type: string, payload: unknown): boolean {
  if (!frame?.contentWindow) return false;
  frame.contentWindow.postMessage(makeEnvelope(type, payload), window.location.origin);
  return true;
}

export function postToParent(type: string, payload: unknown) {
  window.parent.postMessage(makeEnvelope(type, payload), window.location.origin);
}

export function parseThemeDraft(raw: unknown): ThemeDraft | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  for (const key of THEME_KEYS) {
    const value = record[key];
    if (key === "motion") {
      if (typeof value !== "boolean") return null;
    } else if (key === "shadowLevel") {
      if (typeof value !== "string" || !["none", "light", "default", "deep", "custom"].includes(value)) return null;
    } else if (key === "fontFamily" || key === "fontFamilyCode" || key.startsWith("color")) {
      if (typeof value !== "string") return null;
    } else if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
  }
  return { ...(record as unknown as ThemeDraft) };
}

function isDraftValue(value: unknown): boolean {
  return value === null || typeof value === "number" || typeof value === "string";
}

function isRecordShallow(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null;
}

// L1 起 theme-preview 的载荷统一为 {theme, components, statuses}（L0 主题草稿 + 组件 token 草稿 + 跟随状态）。
export function parsePreviewPayload(raw: unknown): PreviewPayload | null {
  if (!isRecordShallow(raw)) return null;
  const theme = parseThemeDraft(raw.theme);
  if (!theme) return null;
  const components: PreviewPayload["components"] = {};
  if (isRecordShallow(raw.components)) {
    for (const [component, entries] of Object.entries(raw.components)) {
      if (!isRecordShallow(entries)) return null;
      if (!Object.values(entries).every(isDraftValue)) return null;
      components[component] = { ...(entries as PreviewPayload["components"][string]) };
    }
  }
  const statuses: PreviewPayload["statuses"] = {};
  if (isRecordShallow(raw.statuses)) {
    for (const [component, entries] of Object.entries(raw.statuses)) {
      if (!isRecordShallow(entries)) return null;
      for (const [field, status] of Object.entries(entries)) {
        if (status !== "following" && status !== "custom") return null;
        (statuses[component] ??= {})[field] = status;
      }
    }
  }
  const structures = isRecordShallow(raw.structures) ? raw.structures as PreviewPayload["structures"] : {};
  const instances = Array.isArray(raw.instances) ? raw.instances as PreviewPayload["instances"] : [];
  const blocks = parseBlockOps(raw.blocks);
  if (blocks === null) return null;
  return { theme, components, statuses, structures, instances, blocks };
}

// 矩阵子端上报的组件 CSS 变量计算值：{component, values: {token: 计算值 | null}}。
export function parseComponentValues(raw: unknown): { component: string; values: Record<string, string | null> } | null {
  if (!isRecordShallow(raw) || typeof raw.component !== "string") return null;
  const record: Record<string, string | null> = {};
  if (isRecordShallow(raw.values)) {
    for (const [key, value] of Object.entries(raw.values)) {
      if (typeof value !== "string" && value !== null) return null;
      record[key] = value;
    }
  }
  return { component: raw.component, values: record };
}

// antd css-in-js 的 token2CSSVar 同款换算。小豆盒 cssVar.prefix 走默认 prefixCls "ant"
// （cssVar.key = "device-ops" 只做 hash 作用域类，变量名以 ant 为前缀），token 为 kebab 小写。
export function cssVarName(component: string, token: string): string {
  const kebab = token
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z0-9]+)/g, "$1-$2")
    .toLowerCase();
  return `--ant-${component.toLowerCase()}-${kebab}`;
}

// 注入 CSS 变量的作用域元素：antd 把整套变量挂在 cssVar.key 命名的 class 上。
export function cssVarScope(): Element | null {
  return document.querySelector(".device-ops") ?? document.documentElement;
}

export type { ComponentComputedValues };

export function isEditorChild(): boolean {
  return new URLSearchParams(window.location.search).get("editor") === "1";
}

// data-ludi-loc="文件:行:列"（行从 1、列从 0），文件名自身可含冒号时取末尾两段。
export function parseLocAttr(locAttr: string, compAttr: string | null): Loc | null {
  const trimmed = locAttr.trim();
  const match = /^(.*):(\d+):(\d+)$/.exec(trimmed);
  if (!match) return null;
  const file = match[1];
  const line = Number.parseInt(match[2], 10);
  const column = Number.parseInt(match[3], 10);
  if (!file || Number.isNaN(line) || Number.isNaN(column)) return null;
  return { file, line, column, component: compAttr?.trim() || "（未命名组件）" };
}

/* ------------------------------------------------------------------ 第二阶段：图层与只读详情
   旧消息（ready / theme-preview / clear-preview / selection-mode / component-selected / bridge-error）语义不变，
   下面是新增消息，均沿用同一信封与 origin / source 校验。

   子 → 父
   - layer-tree     页面子端：{kind:"page", nodes, total, truncated, route}；矩阵子端：{kind:"matrix", component, rootCount, parts}
   - element-detail 页面子端选中元素后上报（与 component-selected 同时发出）：位置、标签、祖先链、DOM bounds、计算样式
   - part-detail    矩阵子端选中组件某一层后上报
   - shortcut       子端文档里按下 V / I / Ctrl+Z / Ctrl+Shift+Z（焦点不在输入框内）时转发给父页
   父 → 子
   - request-layers 请求重新上报图层树
   - select-element {loc, nth} 页面子端：按 loc 与同 loc 的第 nth 个元素选中、滚动到可见并高亮
   - select-part    {key, nth} 矩阵子端：选中第 nth 个匹配该层的元素
   - selection-mode {enabled} 复用：true = 选择模式（拦截点击只选中），false = 交互模式（放行业务点击）
   ------------------------------------------------------------------ */

export const MAX_LAYER_NODES = 1500;

// b：这个节点是已登记页面的哪个区块（区块根元素才有），图层树据此显示区块中文名。
export type LayerNode = { i: number; p: number; loc: string; comp: string; nth: number; t?: string; b?: string };
export type PageLayerTree = { kind: "page"; nodes: LayerNode[]; total: number; truncated: boolean; route: string };
export type MatrixLayerTree = {
  kind: "matrix";
  component: string;
  rootCount: number;
  parts: Array<{ key: string; count: number }>;
};
export type LayerTreePayload = PageLayerTree | MatrixLayerTree;

export type ElementStyles = Record<string, string>;
export type AncestorRef = { loc: string; comp: string; nth: number };
export type ElementDetail = {
  /** 元素自身文字（前 14 字，没有为空）。 */
  text?: string;
  /** 元素属于已登记页面的哪个区块；self 表示选中的就是区块本身。 */
  block?: { id: string; self: boolean };
  loc: Loc;
  selfLoc: string;
  comp: string;
  tag: string;
  nth: number;
  ownerComp?: string;
  ancestors: AncestorRef[];
  bounds: SelectionRect;
  styles: ElementStyles;
};
export type PartDetail = {
  component: string;
  key: string;
  nth: number;
  tag: string;
  bounds: SelectionRect;
  styles: ElementStyles;
};
export type ShortcutPayload = { key: string; ctrl: boolean; shift: boolean };

// 只读详情只取这些计算样式：宽高、内外边距、字号字重行高、颜色、背景、边框、圆角。
export const STYLE_KEYS: Array<[string, string]> = [
  ["width", "宽度"],
  ["height", "高度"],
  ["marginTop", "外边距 上"],
  ["marginRight", "外边距 右"],
  ["marginBottom", "外边距 下"],
  ["marginLeft", "外边距 左"],
  ["paddingTop", "内边距 上"],
  ["paddingRight", "内边距 右"],
  ["paddingBottom", "内边距 下"],
  ["paddingLeft", "内边距 左"],
  ["fontSize", "字号"],
  ["fontWeight", "字重"],
  ["lineHeight", "行高"],
  ["color", "文字颜色"],
  ["backgroundColor", "背景色"],
  ["borderTopWidth", "边框 宽度"],
  ["borderTopStyle", "边框 样式"],
  ["borderTopColor", "边框 颜色"],
  ["borderRadius", "圆角"]
];

export function readStyles(el: Element): ElementStyles {
  const computed = window.getComputedStyle(el);
  const out: ElementStyles = {};
  for (const [key] of STYLE_KEYS) out[key] = String((computed as unknown as Record<string, string>)[key] ?? "");
  return out;
}

export function readBounds(el: Element): SelectionRect {
  const rect = el.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null;
}

function isRect(raw: unknown): raw is SelectionRect {
  return (
    isRecord(raw) &&
    typeof raw.x === "number" &&
    typeof raw.y === "number" &&
    typeof raw.width === "number" &&
    typeof raw.height === "number"
  );
}

function isStyles(raw: unknown): raw is ElementStyles {
  return isRecord(raw) && Object.values(raw).every((value) => typeof value === "string");
}

export function parseLayerTree(raw: unknown): LayerTreePayload | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "page") {
    if (!Array.isArray(raw.nodes) || typeof raw.total !== "number" || typeof raw.route !== "string") return null;
    const nodes: LayerNode[] = [];
    for (const item of raw.nodes.slice(0, MAX_LAYER_NODES)) {
      if (
        !isRecord(item) ||
        typeof item.i !== "number" ||
        typeof item.p !== "number" ||
        typeof item.loc !== "string" ||
        typeof item.comp !== "string" ||
        typeof item.nth !== "number"
      ) {
        return null;
      }
      nodes.push({
        i: item.i,
        p: item.p,
        loc: item.loc,
        comp: item.comp,
        nth: item.nth,
        t: typeof item.t === "string" ? item.t : undefined,
        b: typeof item.b === "string" ? item.b : undefined
      });
    }
    return { kind: "page", nodes, total: raw.total, truncated: raw.truncated === true, route: raw.route };
  }
  if (raw.kind === "matrix") {
    if (typeof raw.component !== "string" || typeof raw.rootCount !== "number" || !Array.isArray(raw.parts)) return null;
    const parts: Array<{ key: string; count: number }> = [];
    for (const item of raw.parts) {
      if (!isRecord(item) || typeof item.key !== "string" || typeof item.count !== "number") return null;
      parts.push({ key: item.key, count: item.count });
    }
    return { kind: "matrix", component: raw.component, rootCount: raw.rootCount, parts };
  }
  return null;
}

export function parseElementDetail(raw: unknown): ElementDetail | null {
  if (!isRecord(raw) || !isRecord(raw.loc)) return null;
  const loc = raw.loc;
  if (
    typeof loc.file !== "string" ||
    typeof loc.line !== "number" ||
    typeof loc.column !== "number" ||
    typeof loc.component !== "string" ||
    typeof raw.selfLoc !== "string" ||
    typeof raw.comp !== "string" ||
    typeof raw.tag !== "string" ||
    typeof raw.nth !== "number" ||
    !Array.isArray(raw.ancestors) ||
    !isRect(raw.bounds) ||
    !isStyles(raw.styles)
  ) {
    return null;
  }
  const ancestors: AncestorRef[] = [];
  for (const item of raw.ancestors.slice(0, 200)) {
    if (!isRecord(item) || typeof item.loc !== "string" || typeof item.comp !== "string" || typeof item.nth !== "number") {
      return null;
    }
    ancestors.push({ loc: item.loc, comp: item.comp, nth: item.nth });
  }
  const block = isRecord(raw.block) && typeof raw.block.id === "string" && typeof raw.block.self === "boolean" ? { id: raw.block.id, self: raw.block.self } : undefined;
  return {
    text: typeof raw.text === "string" && raw.text ? raw.text : undefined,
    block,
    loc: { file: loc.file, line: loc.line, column: loc.column, component: loc.component },
    selfLoc: raw.selfLoc,
    comp: raw.comp,
    tag: raw.tag,
    nth: raw.nth,
    ownerComp: typeof raw.ownerComp === "string" ? raw.ownerComp : undefined,
    ancestors,
    bounds: raw.bounds,
    styles: raw.styles
  };
}

export function parsePartDetail(raw: unknown): PartDetail | null {
  if (
    !isRecord(raw) ||
    typeof raw.component !== "string" ||
    typeof raw.key !== "string" ||
    typeof raw.nth !== "number" ||
    typeof raw.tag !== "string" ||
    !isRect(raw.bounds) ||
    !isStyles(raw.styles)
  ) {
    return null;
  }
  return { component: raw.component, key: raw.key, nth: raw.nth, tag: raw.tag, bounds: raw.bounds, styles: raw.styles };
}

// 子端上报的区块状态：当前页登记区块里哪些在页面上、哪些看得见（按有效顺序）。
export type BlockStatePayload = { page: string; present: string[]; visible: string[] };

export function parseBlockState(raw: unknown): BlockStatePayload | null {
  if (!isRecord(raw) || typeof raw.page !== "string" || !Array.isArray(raw.present) || !Array.isArray(raw.visible)) return null;
  if (!raw.present.every((item) => typeof item === "string") || !raw.visible.every((item) => typeof item === "string")) return null;
  return { page: raw.page, present: raw.present as string[], visible: raw.visible as string[] };
}

export function parseShortcut(raw: unknown): ShortcutPayload | null {
  if (!isRecord(raw) || typeof raw.key !== "string" || typeof raw.ctrl !== "boolean" || typeof raw.shift !== "boolean") {
    return null;
  }
  return { key: raw.key, ctrl: raw.ctrl, shift: raw.shift };
}

// 子端转发快捷键：只转发 V / I / Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y，焦点在文本输入处不转发（交给浏览器原生）。
export function isTextEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  // 单选、复选、按钮类 input 不是文本输入，快捷键照常生效。
  if (tag === "input") return !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test((el as HTMLInputElement).type);
  return tag === "textarea" || tag === "select" || el.isContentEditable;
}

export function installShortcutForwarding(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (isTextEditingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    const ctrl = event.ctrlKey || event.metaKey;
    const wanted = ctrl ? key === "z" || key === "y" : !event.altKey && (key === "v" || key === "i");
    if (!wanted) return;
    event.preventDefault();
    postToParent("shortcut", { key, ctrl, shift: event.shiftKey });
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
