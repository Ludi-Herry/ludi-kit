// 主题规则的客户端预检。协议要求「前后端共用算法语义」：这里按 WCAG 相对亮度实现
// 同一套判据（一组对比度配对、数值范围、字体白名单、阴影档位表）；服务端仍是最终判据，
// 本模块只做写入前的即时反馈与写入按钮的客户端闸口。

import type { Rule, ShadowLevel, ThemeDraft } from "./api";

export type NumericTokenKey =
  | "fontSize"
  | "lineHeight"
  | "sizeUnit"
  | "sizeStep"
  | "spaceSm"
  | "spaceMd"
  | "spaceLg"
  | "controlHeight"
  | "borderRadius"
  | "borderRadiusLG"
  | "lineWidth"
  | "motionUnit";

export const NUMERIC_TOKEN_KEYS: NumericTokenKey[] = [
  "fontSize",
  "lineHeight",
  "sizeUnit",
  "sizeStep",
  "spaceSm",
  "spaceMd",
  "spaceLg",
  "controlHeight",
  "borderRadius",
  "borderRadiusLG",
  "lineWidth",
  "motionUnit"
];

export type NumericRange = {
  min: number;
  max: number;
  step: number;
  source: string;
};

// bootstrap.tokenRules 解析不到时的回退阶梯。来源：antd 6.5.0 种子/派生默认与 PLAN §8 派工单给定的范围。
export const FALLBACK_RANGES: Record<NumericTokenKey, NumericRange> = {
  fontSize: { min: 12, max: 20, step: 2, source: "antd 字号阶梯（默认 14）" },
  lineHeight: { min: 1.3, max: 2, step: 0.05, source: "派工单数值范围（antd 行高默认 1.57）" },
  sizeUnit: { min: 2, max: 8, step: 1, source: "antd 间距单位（默认 4），派工单范围" },
  sizeStep: { min: 2, max: 8, step: 1, source: "antd 间距步长（默认 4），派工单范围" },
  spaceSm: { min: 4, max: 48, step: 2, source: "小豆盒 --do-space-sm（现 12），派工单范围" },
  spaceMd: { min: 4, max: 48, step: 2, source: "小豆盒 --do-space-md（现 16），派工单范围" },
  spaceLg: { min: 4, max: 48, step: 2, source: "小豆盒 --do-space-lg（现 24），派工单范围" },
  controlHeight: { min: 24, max: 48, step: 2, source: "antd 控件高度阶梯（默认 32，小豆盒 Button 覆盖 34）" },
  borderRadius: { min: 0, max: 16, step: 2, source: "antd 圆角常用区间；PLAN 验收要求容纳 4" },
  borderRadiusLG: { min: 0, max: 16, step: 2, source: "antd 大圆角（默认 8），沿用圆角阶梯" },
  lineWidth: { min: 1, max: 3, step: 1, source: "antd 线宽（默认 1），派工单范围" },
  motionUnit: { min: 0.05, max: 0.2, step: 0.01, source: "antd 动效单位秒（默认 0.1），派工单范围" }
};

// 阴影档位表：与 editor-server/theme.mjs 的 SHADOW_LEVELS 内容一致，两端改动必须同步。
export const SHADOW_LEVELS: Record<ShadowLevel, { label: string; boxShadow: string; boxShadowSecondary: string }> = {
  none: { label: "无", boxShadow: "none", boxShadowSecondary: "none" },
  light: {
    label: "轻",
    boxShadow: "0 2px 8px 0 rgba(0, 0, 0, 0.06), 0 1px 3px -2px rgba(0, 0, 0, 0.08)",
    boxShadowSecondary: "0 2px 6px 0 rgba(0, 0, 0, 0.04)"
  },
  default: {
    label: "默认",
    boxShadow: "0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)",
    boxShadowSecondary: "0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)"
  },
  deep: {
    label: "深",
    boxShadow: "0 9px 28px 8px rgba(0, 0, 0, 0.08), 0 6px 16px 0 rgba(0, 0, 0, 0.12), 0 3px 6px -4px rgba(0, 0, 0, 0.16)",
    boxShadowSecondary: "0 9px 28px 8px rgba(0, 0, 0, 0.06), 0 6px 16px 0 rgba(0, 0, 0, 0.1), 0 3px 6px -4px rgba(0, 0, 0, 0.12)"
  }
};

// 容错 tokenRules 的几种常见形状：{key:{min,max,step}}、{ranges:{...}}、{fields:[{key,...}]}。
export function parseTokenRules(raw: unknown): {
  ranges: Partial<Record<NumericTokenKey, NumericRange>>;
  parsed: boolean;
} {
  const out: Partial<Record<NumericTokenKey, NumericRange>> = {};
  let parsed = false;
  const readOne = (key: string, value: unknown) => {
    if (!(NUMERIC_TOKEN_KEYS as string[]).includes(key)) return;
    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    const min = typeof record.min === "number" ? record.min : null;
    const max = typeof record.max === "number" ? record.max : null;
    if (min === null || max === null || min > max) return;
    out[key as NumericTokenKey] = {
      min,
      max,
      step: typeof record.step === "number" && record.step > 0 ? record.step : FALLBACK_RANGES[key as NumericTokenKey].step,
      source: "bootstrap tokenRules"
    };
    parsed = true;
  };
  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) readOne(key, value);
    const ranges = record.ranges;
    if (typeof ranges === "object" && ranges !== null) {
      for (const [key, value] of Object.entries(ranges as Record<string, unknown>)) readOne(key, value);
    }
    const fields = record.fields;
    if (Array.isArray(fields)) {
      for (const field of fields) {
        if (typeof field === "object" && field !== null && typeof (field as { key?: unknown }).key === "string") {
          readOne((field as { key: string }).key, field);
        }
      }
    }
  }
  return { ranges: out, parsed };
}

export function clampNumber(value: number, range: NumericRange): { value: number; clamped: boolean } {
  const clamped = Math.min(range.max, Math.max(range.min, value));
  return { value: clamped, clamped: clamped !== value };
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.trim().toLowerCase();
  const match = /^#(?:([0-9a-f]{3})|([0-9a-f]{6}))$/.exec(normalized);
  if (!match) return null;
  const full = match[1]
    ? match[1].split("").map((ch) => ch + ch).join("")
    : match[2];
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channelLuminance);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG 对比度；白色文字与主色背景。
export function contrastWithWhite(hex: string): number | null {
  const luminance = relativeLuminance(hex);
  if (luminance === null) return null;
  return 1.05 / (luminance + 0.05);
}

// 任意前景 × 背景的 WCAG 对比度（浅色在上）。
export function contrastRatio(foreground: string, background: string): number | null {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  if (a === null || b === null) return null;
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

// 前景色不达标时找最近合规色：对给定背景按亮度递减步进调暗，返回第一个满足阈值的 hex。
export function nearestCompliantAgainst(hex: string, background: string, minimum = 4.5): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  if ((contrastRatio(hex, background) ?? 0) >= minimum) return hex.toLowerCase();
  for (let step = 1; step <= 255; step += 1) {
    const candidate = rgb.map((channel) => Math.max(0, channel - step));
    const candidateHex = `#${candidate.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    if ((contrastRatio(candidateHex, background) ?? 0) >= minimum) return candidateHex;
  }
  return null;
}

// 主色不达标时找最近的合规色（对白 4.5:1）。保留旧函数名，画布与文本检查共用。
export function nearestCompliantPrimary(hex: string, minimum = 4.5): string | null {
  return nearestCompliantAgainst(hex, "#ffffff", minimum);
}

// 值是否等于项目当前值（规范化为小写 hex 后比较）；基准未知时按「已改动」处理，不放行。
export function colorUnchanged(value: string, baseline: string | null | undefined): boolean {
  return Boolean(baseline) && baseline!.trim().toLowerCase() === value.trim().toLowerCase();
}

export function primaryUnchanged(draft: Pick<ThemeDraft, "colorPrimary">, baseline: string | null | undefined): boolean {
  return colorUnchanged(draft.colorPrimary, baseline);
}

// 字体族白名单（与服务端 normalizeFont 同语义）：字母、数字、中文、空格、连字符、引号、逗号。
const FONT_ALLOWED = /^[\p{L}\p{N}\s,'"-]+$/u;

export function fontFamilyProblem(value: string): string | null {
  const items = value.split(",").map((item) => item.trim()).filter(Boolean).join(", ");
  if (!items) return "字体族不能为空";
  if (items.length > 300) return "字体族长度不能超过 300 字符";
  if (!FONT_ALLOWED.test(items)) return "字体族含不允许的字符（仅接受字母、数字、中文、空格、连字符、引号与逗号）";
  return null;
}

// 对比度检查的客户端镜像：只拦「把值改成不达标」；构成配对的值都与项目当前值一致时，
// 现状不达标给 pass + 建议色提示，不阻断其他 Token 写回（与服务端 normalizeTheme 同语义）。
function contrastRule(params: {
  id: string;
  label: string;
  fg: string;
  fgBaseline: string | null | undefined;
  pairs: Array<{ bg: string; bgBaseline: string | null | undefined; bgLabel: string }>;
}): Rule {
  const suggestive: Array<{ bg: string; bgLabel: string; ratio: number }> = [];
  for (const pair of params.pairs) {
    const ratio = contrastRatio(params.fg, pair.bg);
    if (ratio === null) {
      return { id: params.id, status: "blocked", message: `${params.label}或背景不是可解析的 hex 颜色，无法计算对比度` };
    }
    if (ratio >= 4.5) continue;
    const unchanged = colorUnchanged(params.fg, params.fgBaseline) && colorUnchanged(pair.bg, pair.bgBaseline);
    if (!unchanged) {
      const suggestion = nearestCompliantAgainst(params.fg, pair.bg) ?? undefined;
      return {
        id: params.id,
        status: "fail",
        message: `${params.label}与${pair.bgLabel}对比度 ${ratio.toFixed(2)}:1，低于 4.5:1（WCAG AA），禁止写入`,
        suggestedValue: suggestion
      };
    }
    suggestive.push({ ...pair, ratio });
  }
  if (suggestive.length > 0) {
    const first = suggestive[0];
    const suggestion = nearestCompliantAgainst(params.fg, first.bg) ?? undefined;
    return {
      id: params.id,
      status: "pass",
      message: `现状${params.label}对比度 ${first.ratio.toFixed(2)} 低于 4.5:1，建议 ${suggestion?.toUpperCase() ?? "更深的颜色"}；未改动，不阻断其他 Token 写回`,
      suggestedValue: suggestion
    };
  }
  return { id: params.id, status: "pass", message: `${params.label}对比度满足 ≥ 4.5:1（WCAG AA）` };
}

// baselineTheme：bootstrap 里项目当前源码的主题。只有改动后才按新值判定。
export function themeClientRules(
  draft: ThemeDraft,
  routes: { id: string; source: string }[],
  baselineTheme?: ThemeDraft | null
): Rule[] {
  const rules: Rule[] = [];
  rules.push(
    contrastRule({
      id: "editor.theme.contrast.colorPrimary",
      label: "主色",
      fg: draft.colorPrimary,
      fgBaseline: baselineTheme?.colorPrimary,
      pairs: [{ bg: "#ffffff", bgBaseline: "#ffffff", bgLabel: "白字" }]
    })
  );
  for (const key of ["colorError", "colorSuccess", "colorWarning", "colorInfo"] as const) {
    if (key === "colorError") {
      rules.push(
        contrastRule({
          id: "editor.theme.contrast.colorError",
          label: "错误色",
          fg: draft.colorError,
          fgBaseline: baselineTheme?.colorError,
          pairs: [{ bg: "#ffffff", bgBaseline: "#ffffff", bgLabel: "白字" }]
        })
      );
    } else {
      const ratio = contrastWithWhite(draft[key]);
      const label = { colorSuccess: "成功色", colorWarning: "警告色", colorInfo: "信息色" }[key];
      rules.push({
        id: `editor.theme.contrast.${key}`,
        status: "pass",
        message: ratio === null ? `${label}不是可解析的 hex 颜色` : `${label}对白对比度 ${ratio.toFixed(2)}（仅提示，不拦截）`
      });
    }
  }
  rules.push(
    contrastRule({
      id: "editor.theme.contrast.colorText",
      label: "文字色",
      fg: draft.colorText,
      fgBaseline: baselineTheme?.colorText,
      pairs: [
        { bg: draft.colorBgContainer, bgBaseline: baselineTheme?.colorBgContainer, bgLabel: "容器底色" },
        { bg: draft.colorBgBase, bgBaseline: baselineTheme?.colorBgBase, bgLabel: "页面底色" }
      ]
    })
  );
  rules.push(
    contrastRule({
      id: "editor.theme.contrast.colorTextSecondary",
      label: "次级文字",
      fg: draft.colorTextSecondary,
      fgBaseline: baselineTheme?.colorTextSecondary,
      pairs: [{ bg: draft.colorBgContainer, bgBaseline: baselineTheme?.colorBgContainer, bgLabel: "容器底色" }]
    })
  );
  for (const key of ["fontFamily", "fontFamilyCode"] as const) {
    const problem = fontFamilyProblem(draft[key]);
    rules.push({
      id: `editor.theme.font.${key}`,
      status: problem ? "fail" : "pass",
      message: problem ?? `${key} 字符合法；末尾缺少通用族时写回自动补 ${key === "fontFamilyCode" ? "monospace" : "sans-serif"}`
    });
  }
  rules.push({
    id: "editor.theme.shadow.level",
    status: draft.shadowLevel === "custom" ? "fail" : "pass",
    message:
      draft.shadowLevel === "custom"
        ? "源码中的阴影值不是档位值，请先在源码对齐到档位后再用编辑器调整"
        : "阴影档位在允许范围内（无 / 轻 / 默认 / 深）"
  });
  rules.push({
    id: "editor.theme.spacing.order",
    status: draft.spaceSm <= draft.spaceMd && draft.spaceMd <= draft.spaceLg ? "pass" : "fail",
    message:
      draft.spaceSm <= draft.spaceMd && draft.spaceMd <= draft.spaceLg
        ? "--do-space 三档满足 sm ≤ md ≤ lg"
        : "--do-space 三档必须满足 sm ≤ md ≤ lg，禁止写入"
  });
  for (const { id, source } of routes) {
    rules.push({ id, status: "pass", message: `数值在允许阶梯内（${source}）` });
  }
  return rules;
}
