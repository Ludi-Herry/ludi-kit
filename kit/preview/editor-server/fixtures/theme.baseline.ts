import type { ThemeConfig } from "antd";

// Editor-owned semantic styles; tokens stay in deviceOpsTheme.components.
export const deviceOpsComponentStyles: Pick<import("antd").ConfigProviderProps, "button" | "input" | "select" | "tag" | "table" | "alert" | "modal" | "drawer" | "popconfirm"> = {};

export const deviceOpsTheme = {
  cssVar: { key: "device-ops" },
  hashed: false,
  token: {
    colorPrimary: "#1677ff",
    colorText: "#1f2937",
    colorTextSecondary: "#6b7280",
    colorBgBase: "#f6f8fb",
    colorBgContainer: "#ffffff",
    colorBorder: "#d8dee8",
    borderRadius: 6,
    borderRadiusLG: 8,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
    wireframe: false
  },
  components: {
    Button: { borderRadius: 6, controlHeight: 34 },
    Layout: { bodyBg: "#f6f8fb", headerBg: "#ffffff", siderBg: "#ffffff" },
    Menu: { itemBorderRadius: 6, itemHeight: 38 },
    Table: { borderColor: "#d8dee8", headerBg: "#f8fafc" }
  }
} satisfies ThemeConfig;
