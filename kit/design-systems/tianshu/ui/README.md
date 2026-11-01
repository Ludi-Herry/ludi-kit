# 天枢共享 UI 层（design-systems/tianshu/ui）

本目录是天枢设计系统（同级的 tokens / controls / structure 已签字规格）的 **antd 参照实现层**，为 projects 下多个 real-product 项目共享的一套 library-native 实现：`theme.ts`（主题 tokens）、`ui.tsx`（页面组件与演示态）、`shell.css`（壳层与组件样式）与 `shell.tsx`（泛化应用壳 `OpsPlatformShell`）。当前由 `projects/sample-scan-ops`、`projects/sample-flow-ops`、`projects/sample-access-ops` 三个 real-product 项目引用；实现语义与 `projects/tianshu-ops` 保持一一对齐（三份文件自 tianshu-ops 的 `native-theme.ts` / `native-ui.tsx` / `app.css` 原样迁移而来），任何语义改动须先与 tianshu-ops 侧对齐并同步两边的行为与 `.tianshu-*` 类名合同。
