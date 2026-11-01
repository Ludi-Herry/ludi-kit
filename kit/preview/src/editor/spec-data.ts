// 规范视图与检查器共用的派生数据：antd 派生 Token、WCAG 对比度分级、项目固定值读取。
// 派生值一律交给 antd 的 theme.getDesignToken 计算，不在此重写算法；
// 计算输入 = 小豆盒 theme.ts 现有 token + 当前草稿的可写字段（草稿优先）。

import { theme, type ThemeConfig } from "antd";
import { deviceOpsTheme } from "../../../projects/tianshu-device-ops/theme";
import type { ThemeDraft } from "./api";
import { relativeLuminance, SHADOW_LEVELS } from "./theme-rules";

const projectToken = deviceOpsTheme.token as Record<string, unknown>;

export const PROJECT_TEXT_SECONDARY = typeof projectToken.colorTextSecondary === "string" ? projectToken.colorTextSecondary : "#6b7280";

export function formatPx(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}px`;
}

export function upperHex(value: string): string {
  return value.toUpperCase();
}

export function contrastBetween(foreground: string, background: string): number | null {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  if (a === null || b === null) return null;
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

export type ContrastLevel = { label: string; tone: "pass" | "warn" | "fail" };

export function contrastLevel(ratio: number | null): ContrastLevel {
  if (ratio === null) return { label: "无法计算", tone: "fail" };
  if (ratio >= 7) return { label: "AAA", tone: "pass" };
  if (ratio >= 4.5) return { label: "AA", tone: "pass" };
  if (ratio >= 3) return { label: "AA large", tone: "warn" };
  return { label: "不达标", tone: "fail" };
}

// 草稿里参与 antd 派生计算的字段（颜色 / 文字 / 间距 / 圆角与效果，不含 CSS 专用的 space* 与 shadowLevel）。
function draftToken(draft: ThemeDraft): ThemeConfig["token"] {
  return {
    ...(projectToken as ThemeConfig["token"]),
    colorPrimary: draft.colorPrimary,
    colorLink: draft.colorPrimary,
    colorSuccess: draft.colorSuccess,
    colorWarning: draft.colorWarning,
    colorError: draft.colorError,
    colorInfo: draft.colorInfo,
    colorText: draft.colorText,
    colorTextSecondary: draft.colorTextSecondary,
    colorBorder: draft.colorBorder,
    colorBgBase: draft.colorBgBase,
    colorBgContainer: draft.colorBgContainer,
    fontFamily: draft.fontFamily,
    fontFamilyCode: draft.fontFamilyCode,
    fontSize: draft.fontSize,
    lineHeight: draft.lineHeight,
    sizeUnit: draft.sizeUnit,
    sizeStep: draft.sizeStep,
    controlHeight: draft.controlHeight,
    borderRadius: draft.borderRadius,
    borderRadiusLG: draft.borderRadiusLG,
    lineWidth: draft.lineWidth,
    motion: draft.motion,
    motionUnit: draft.motionUnit,
    ...(draft.shadowLevel === "custom"
      ? {}
      : {
          boxShadow: SHADOW_LEVELS[draft.shadowLevel].boxShadow,
          boxShadowSecondary: SHADOW_LEVELS[draft.shadowLevel].boxShadowSecondary
        })
  };
}

export type DerivedTokens = {
  radius: { xs: number; sm: number; base: number; lg: number };
  font: { sm: number; base: number; lg: number; xl: number; headings: number[] };
  control: { sm: number; base: number; lg: number };
  space: { xs: number; sm: number; md: number; lg: number; xl: number };
  color: {
    primaryHover: string;
    primaryActive: string;
    primaryBg: string;
    primaryBgHover: string;
    primaryBorder: string;
    primaryBorderHover: string;
  };
};

export function deriveTokens(draft: ThemeDraft): DerivedTokens {
  const token = theme.getDesignToken({ token: draftToken(draft) });
  return {
    radius: {
      xs: token.borderRadiusXS,
      sm: token.borderRadiusSM,
      base: token.borderRadius,
      lg: token.borderRadiusLG
    },
    font: {
      sm: Number(token.fontSizeSM),
      base: Number(token.fontSize),
      lg: Number(token.fontSizeLG),
      xl: Number(token.fontSizeXL),
      headings: [
        Number(token.fontSizeHeading1),
        Number(token.fontSizeHeading2),
        Number(token.fontSizeHeading3),
        Number(token.fontSizeHeading4),
        Number(token.fontSizeHeading5)
      ]
    },
    control: {
      sm: Number(token.controlHeightSM),
      base: Number(token.controlHeight),
      lg: Number(token.controlHeightLG)
    },
    space: {
      xs: Number(token.paddingXS),
      sm: Number(token.paddingSM),
      md: Number(token.padding),
      lg: Number(token.paddingLG),
      xl: Number(token.paddingXL)
    },
    color: {
      primaryHover: String(token.colorPrimaryHover),
      primaryActive: String(token.colorPrimaryActive),
      primaryBg: String(token.colorPrimaryBg),
      primaryBgHover: String(token.colorPrimaryBgHover),
      primaryBorder: String(token.colorPrimaryBorder),
      primaryBorderHover: String(token.colorPrimaryBorderHover)
    }
  };
}

// 规范卡片里真实 antd 组件的主题：小豆盒固定 token + 当前草稿；Button 的两个组件级覆盖与
// 预览一致（theme-apply 里 Button.borderRadius / controlHeight 绑定草稿）。不继承外壳主题。
export function sampleTheme(draft: ThemeDraft): ThemeConfig {
  return {
    inherit: false,
    cssVar: { key: "ludi-sample" },
    hashed: false,
    token: draftToken(draft),
    components: { Button: { borderRadius: draft.borderRadius, controlHeight: draft.controlHeight } }
  };
}
