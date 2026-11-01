// /editor 入口：外壳（含 /editor 与 /editor/page）与组件矩阵子端（/editor/matrix）分开。
// 外壳使用独立 --ludi-* 变量与 antd prefixCls="ludi"；矩阵在自己的 iframe 文档里
// 使用小豆盒主题与默认 antd prefix（见 matrix/MatrixView.tsx）。

import { Suspense, lazy } from "react";
import { ConfigProvider, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { ThemeConfig } from "antd";
import { EditorShell } from "./EditorShell";
import "./editor.css";

const MatrixView = lazy(() => import("./matrix/MatrixView"));
const BlockThumb = lazy(() => import("./BlockThumb"));

// 外壳主题：中性灰阶 + 黑色主按钮，独立于小豆盒主题（cssVar 前缀 ludi，prefixCls ludi）。
const EDITOR_THEME = {
  cssVar: { key: "ludi" },
  hashed: false,
  token: {
    colorPrimary: "#111111",
    colorText: "#0a0a0a",
    colorTextSecondary: "#737373",
    colorBgBase: "#f5f5f5",
    colorBgContainer: "#ffffff",
    colorBorder: "#e5e5e5",
    colorBorderSecondary: "#ececec",
    borderRadius: 8,
    fontSize: 13,
    controlHeight: 28,
    motionDurationFast: "0.12s",
    motionDurationMid: "0.16s",
    motionDurationSlow: "0.2s",
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    fontFamilyCode: 'ui-monospace, "Cascadia Code", Consolas, monospace',
    controlItemBgHover: "#f5f5f5",
    controlItemBgActive: "#ececec",
    controlItemBgActiveHover: "#e2e2e2",
    controlHeightSM: 24,
    controlHeightLG: 32
  },
  components: {
    Button: { defaultShadow: "none", primaryShadow: "none", dangerShadow: "none", fontWeight: 500 },
    Select: {
      optionActiveBg: "#f5f5f5",
      optionSelectedBg: "#ececec",
      optionSelectedColor: "#0a0a0a",
      optionSelectedFontWeight: 500
    },
    Segmented: {
      trackBg: "transparent",
      trackPadding: 2,
      itemColor: "#737373",
      itemHoverBg: "#f5f5f5",
      itemSelectedBg: "#ececec",
      itemSelectedColor: "#0a0a0a"
    }
  }
} satisfies ThemeConfig;

export default function EditorApp() {
  const isMatrix = window.location.pathname === "/editor/matrix";

  if (window.location.pathname === "/editor/block-thumb") {
    return (
      <Suspense fallback={null}>
        <BlockThumb />
      </Suspense>
    );
  }

  if (isMatrix) {
    return (
      <Suspense fallback={<Spin delay={300} style={{ display: "block", margin: "48px auto" }} />}>
        <MatrixView />
      </Suspense>
    );
  }

  return (
    <ConfigProvider button={{ autoInsertSpace: false }} locale={zhCN} prefixCls="ludi" theme={EDITOR_THEME}>
      <EditorShell />
    </ConfigProvider>
  );
}
