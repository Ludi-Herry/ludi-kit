import type { ThemeConfig } from "antd";

// 清新玻璃质感（Glass Fresh）：语义色与 Badge 同色系；组件 token 负责尺寸、描边、阴影，渐变与玻璃层在 app.css 组件层。
const glassShadowFloat = "0 18px 40px -16px rgb(30 64 175 / 22%), 0 0 0 1px rgb(227 234 245 / 90%)";
const glassFocusRing = "0 0 0 3px rgb(47 123 246 / 14%)";

export const tianshuTheme = {
  cssVar: { key: "tianshu" },
  hashed: false,
  token: {
    colorPrimary: "#2f7bf6",
    colorSuccess: "#14a155",
    colorWarning: "#e5780f",
    colorError: "#e5484d",
    colorInfo: "#2f7bf6",
    colorText: "#1f2937",
    colorTextSecondary: "#6b7280",
    colorBgBase: "#f6f8fb",
    colorBgContainer: "#ffffff",
    colorBorder: "#dfe6f1",
    colorBorderSecondary: "#edf1f8",
    colorSuccessBg: "#eafaf1",
    colorSuccessBorder: "#c5efd7",
    colorWarningBg: "#fff5ea",
    colorWarningBorder: "#ffdcb5",
    colorErrorBg: "#fff1f1",
    colorErrorBorder: "#ffd1d3",
    colorInfoBg: "#edf4ff",
    colorInfoBorder: "#cfe0ff",
    borderRadius: 8,
    borderRadiusSM: 6,
    borderRadiusLG: 12,
    controlHeight: 34,
    controlOutline: "rgb(47 123 246 / 14%)",
    boxShadowSecondary: glassShadowFloat,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
    wireframe: false
  },
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 34,
      fontWeight: 500,
      defaultBorderColor: "#dfe6f1",
      defaultHoverBorderColor: "#a9c6fb",
      defaultHoverColor: "#2f7bf6",
      defaultShadow: "0 1px 2px rgb(30 64 175 / 6%)",
      primaryShadow: "0 6px 14px -6px rgb(47 111 245 / 55%)",
      dangerShadow: "0 6px 14px -6px rgb(229 72 77 / 45%)"
    },
    Input: { activeShadow: glassFocusRing, hoverBorderColor: "#a9c6fb" },
    InputNumber: { activeShadow: glassFocusRing, hoverBorderColor: "#a9c6fb" },
    Select: {
      activeOutlineColor: "rgb(47 123 246 / 14%)",
      hoverBorderColor: "#a9c6fb",
      optionActiveBg: "#f5f9ff",
      optionSelectedBg: "#edf4ff",
      optionSelectedColor: "#2f7bf6",
      optionSelectedFontWeight: 600
    },
    DatePicker: { activeShadow: glassFocusRing, hoverBorderColor: "#a9c6fb", cellActiveWithRangeBg: "#edf4ff" },
    Layout: {
      bodyBg: "transparent",
      headerBg: "transparent",
      siderBg: "transparent"
    },
    Menu: {
      itemBorderRadius: 10,
      itemHeight: 40,
      itemHoverBg: "rgb(47 123 246 / 6%)",
      itemSelectedBg: "rgb(47 123 246 / 8%)",
      itemSelectedColor: "#1f5fd6"
    },
    Table: {
      borderColor: "#edf1f8",
      headerBg: "#f4f7fc",
      headerColor: "#4a5568",
      headerBorderRadius: 12,
      rowHoverBg: "#f5f9ff",
      rowSelectedBg: "#f0f6ff",
      rowSelectedHoverBg: "#e8f1ff"
    },
    Tabs: { inkBarColor: "#2f7bf6", itemColor: "#5b6577", itemHoverColor: "#2f7bf6", itemSelectedColor: "#2f7bf6", titleFontSize: 14 },
    Steps: { dotSize: 8, iconSize: 30 },
    Pagination: { itemActiveBg: "#edf4ff", itemSize: 32 },
    Tag: { defaultBg: "#f2f5f9", defaultColor: "#5b6577" },
    Alert: { withDescriptionPadding: "14px 16px" },
    Card: { headerFontSize: 17, borderRadiusLG: 16 },
    Modal: { borderRadiusLG: 16, titleFontSize: 17 },
    Drawer: { footerPaddingBlock: 12, footerPaddingInline: 24 },
    Descriptions: { labelBg: "#f7faff", titleMarginBottom: 12 },
    Segmented: { itemSelectedBg: "#ffffff", trackBg: "#f4f7fc", itemSelectedColor: "#2f7bf6" },
    Switch: { handleShadow: "0 2px 4px rgb(30 64 175 / 18%)" },
    Tooltip: { colorBgSpotlight: "rgb(31 41 55 / 92%)" },
    Dropdown: { controlItemBgHover: "#f5f9ff", controlItemBgActive: "#edf4ff" }
  }
} satisfies ThemeConfig;

export const tianshuCalmTheme = {
  ...tianshuTheme,
  token: {
    ...tianshuTheme.token,
    colorPrimary: "#28786c",
    colorInfo: "#366f9b",
    colorText: "#1f2a28",
    colorTextSecondary: "#687572",
    colorBgBase: "#f7f6f2",
    colorBgContainer: "#fffdfa",
    colorBorder: "#d8d6cd"
  },
  components: {
    ...tianshuTheme.components,
    Layout: {
      bodyBg: "#f7f6f2",
      headerBg: "#fffdfa",
      siderBg: "#fffdfa"
    },
    Table: {
      borderColor: "#d8d6cd",
      headerBg: "#f2f1ec"
    }
  }
} satisfies ThemeConfig;

export const tianshuThemes = {
  vivid: tianshuTheme,
  calm: tianshuCalmTheme
} as const;
