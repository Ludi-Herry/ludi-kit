// 子端（小豆盒页面 iframe / 组件矩阵 iframe）的草稿应用：
// 只改内存里的 deviceOpsTheme 对象并触发重渲染，DeviceOpsApp 内部 ConfigProvider
// 重新读取同一对象后真正换主题；不触碰源码，清除时从快照逐字段恢复。
// components overrides 的同步接受两种可以从现有源码证明的关系：
//  1) 覆盖字段与草稿 token 同名（Button.controlHeight ↔ controlHeight）；
//  2) 同义词映射（Layout.bodyBg ↔ colorBgBase、Menu.itemBorderRadius ↔ borderRadius、
//     Table.borderColor ↔ colorBorder，与服务端 syncTarget 一致）。
// 跟随 / 单独设置（2026-10-02 裁决 A）：载荷里的 statuses（bootstrap 从源码算出）为真值；
// 缺省时回退到「覆盖项原值与全局 token 原值相等即跟随」。不等于的视为已单独设置，预览不同步。
// 组件级草稿（L1）：写入或显式恢复的项目直接覆盖 / 删除内存里的同名组件项，不受跟随状态约束。
// shadowLevel 按档位表展开成 boxShadow / boxShadowSecondary；custom 意味着源码阴影不在档位内，
// 预览不动这两个 token。spaceSm/Md/Lg 只同步 --do-space-* 变量。

import { deviceOpsTheme, deviceOpsComponentStyles } from "../../../projects/tianshu-device-ops/theme";
import { nestedStyles, setInstancePreview } from "./instance-preview";
import type { PreviewPayload } from "./api";
import { SHADOW_LEVELS } from "./theme-rules";

const DRAFT_KEYS = [
  "colorPrimary",
  "colorSuccess",
  "colorWarning",
  "colorError",
  "colorInfo",
  "colorText",
  "colorTextSecondary",
  "colorBorder",
  "colorBgBase",
  "colorBgContainer",
  "fontFamily",
  "fontFamilyCode",
  "fontSize",
  "lineHeight",
  "sizeUnit",
  "sizeStep",
  "controlHeight",
  "borderRadius",
  "borderRadiusLG",
  "lineWidth",
  "motion",
  "motionUnit"
] as const;

type DraftKey = (typeof DRAFT_KEYS)[number];

// 与服务端 theme.mjs 的 SYNC_SYNONYMS 一致。
const SYNC_SYNONYMS: Record<string, DraftKey> = {
  itemBorderRadius: "borderRadius",
  bodyBg: "colorBgBase",
  headerBg: "colorBgContainer",
  siderBg: "colorBgContainer",
  borderColor: "colorBorder"
};

function syncTarget(key: string): DraftKey | null {
  if ((DRAFT_KEYS as readonly string[]).includes(key)) return key as DraftKey;
  return SYNC_SYNONYMS[key] ?? null;
}

type Binding = { component: string; field: string; target: DraftKey };

const themeToken = deviceOpsTheme.token as Record<string, unknown>;
const themeComponents = deviceOpsTheme.components as
  | Record<string, Record<string, unknown>>
  | undefined;

let original: { token: Record<string, unknown>; components: Record<string, Record<string, unknown>> } | null =
  null;
let bindings: Binding[] = [];
const structureConfig = deviceOpsComponentStyles as Record<string, Record<string, unknown>>;
let originalStructures: typeof structureConfig | null = null;

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function ensureSnapshot() {
  if (original) return;
  originalStructures = structuredClone(structureConfig);
  original = {
    token: structuredClone(themeToken),
    components: structuredClone(themeComponents ?? {})
  };
  bindings = [];
  for (const [component, overrides] of Object.entries(original.components)) {
    for (const field of Object.keys(overrides)) {
      const target = syncTarget(field);
      if (target) bindings.push({ component, field, target });
    }
  }
}

function setCssVar(name: string, value: string | null) {
  const targets: Array<HTMLElement | null> = [
    document.documentElement,
    document.querySelector<HTMLElement>(".device-ops-shell")
  ];
  for (const target of targets) {
    if (!target) continue;
    if (value === null) target.style.removeProperty(name);
    else target.style.setProperty(name, value);
  }
}

type CssVarTokenKey = "colorPrimary" | "colorBgBase" | "colorBgContainer" | "colorText" | "colorTextSecondary" | "colorBorder";

const CSS_VAR_PAIRS: ReadonlyArray<readonly [string, CssVarTokenKey]> = [
  ["--do-primary", "colorPrimary"],
  ["--do-bg", "colorBgBase"],
  ["--do-surface", "colorBgContainer"],
  ["--do-text", "colorText"],
  ["--do-text-secondary", "colorTextSecondary"],
  ["--do-border", "colorBorder"]
];

const CSS_SPACE_PAIRS: ReadonlyArray<readonly [string, "spaceSm" | "spaceMd" | "spaceLg"]> = [
  ["--do-space-sm", "spaceSm"],
  ["--do-space-md", "spaceMd"],
  ["--do-space-lg", "spaceLg"]
];

export function applyEditorDraft(payload: PreviewPayload) {
  ensureSnapshot();
  // Each payload is the full draft; fields removed by preview undo must restore.
  if (themeComponents && original) {
    for (const key of Object.keys(themeComponents)) delete themeComponents[key];
    Object.assign(themeComponents, structuredClone(original.components));
  }
  for (const key of Object.keys(structureConfig)) delete structureConfig[key];
  Object.assign(structureConfig,structuredClone(originalStructures ?? {}));
  for (const [component,parts] of Object.entries(payload.structures ?? {})) {
    const key=component.toLowerCase(),config=structureConfig[key] ??= {};
    config.styles=nestedStyles((config.styles ?? {}) as Record<string,unknown>,parts);
  }
  setInstancePreview(payload.instances ?? []);
  const theme = payload.theme;
  for (const key of DRAFT_KEYS) themeToken[key] = theme[key];
  // 预览与写回一致：colorLink 派生跟随 colorPrimary；恢复时走下方快照还原。
  themeToken.colorLink = theme.colorPrimary;
  if (theme.shadowLevel !== "custom") {
    themeToken.boxShadow = SHADOW_LEVELS[theme.shadowLevel].boxShadow;
    themeToken.boxShadowSecondary = SHADOW_LEVELS[theme.shadowLevel].boxShadowSecondary;
  }
  if (themeComponents) {
    for (const binding of bindings) {
      const overrides = themeComponents[binding.component];
      if (!overrides || !original) continue;
      const reported = payload.statuses[binding.component]?.[binding.field];
      const follows =
        reported === "following" ||
        (reported === undefined &&
          deepEqual(original.components[binding.component]?.[binding.field], original.token[binding.target]));
      if (follows) overrides[binding.field] = theme[binding.target];
    }
    // 组件 token 草稿（L1）：写值或恢复跟随全局（null → 删除该行）。
    for (const [component, entries] of Object.entries(payload.components)) {
      if (!entries) continue;
      const overrides = (themeComponents[component] ??= {});
      for (const [key, value] of Object.entries(entries)) {
        if (value === null || value === undefined) delete overrides[key];
        else overrides[key] = value;
      }
    }
  }
  for (const [name, key] of CSS_VAR_PAIRS) setCssVar(name, theme[key]);
  for (const [name, key] of CSS_SPACE_PAIRS) setCssVar(name, `${theme[key]}px`);
}

export function restoreThemeDraft() {
  if (!original) return;
  for (const key of Object.keys(structureConfig)) delete structureConfig[key];
  Object.assign(structureConfig,structuredClone(originalStructures ?? {}));
  setInstancePreview([]);
  for (const key of Object.keys(themeToken)) {
    if (!(key in original.token)) delete themeToken[key];
  }
  Object.assign(themeToken, structuredClone(original.token));
  if (themeComponents) {
    for (const [component, overrides] of Object.entries(themeComponents)) {
      const originalOverrides = original.components[component];
      if (!originalOverrides) {
        delete themeComponents[component];
        continue;
      }
      for (const field of Object.keys(overrides)) {
        if (!(field in originalOverrides)) delete overrides[field];
      }
      Object.assign(overrides, structuredClone(originalOverrides));
    }
  }
  for (const [name] of CSS_VAR_PAIRS) setCssVar(name, null);
  for (const [name] of CSS_SPACE_PAIRS) setCssVar(name, null);
}
