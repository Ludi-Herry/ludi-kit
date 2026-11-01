# 合成旧产品输入：天枢 Vue 2 基线

适用：已授权的老框架延展与迁移试验。此文档是读取入口草案，不注册新的 canonical workflow，也不扩展 kit 的 framework schema。

本轮用户于 2026-10-02 指定根据旧版 Figma 导出制作合成旧产品，源码入口为 `<local-path-omitted>`，替代 09-30 开工包默认下载 vue-element-admin 的基线选择。原有 T6/T7 的范围与独立验收仍按 `docs/HANDOFF-并行链路开工包-2026-09-30.md`。

读取顺序：外部项目 `README.md` → `docs/source-map.json` → `docs/legacy-profile.md` → `src/domain/pages.js` → 相关 view、mixin、API 与 mock → `evidence/` 当前验收结果。实际文件哈希与运行结果决定可用状态，说明文档不代替源码。

在外部项目运行 `npm run dev`，使用严格端口 5396；在同目录运行 `npm run build` 与 `npm test`。kit 内不安装 Vue 2 / Element UI 依赖。T6 后续新增页面须按既有源码写法与权限习惯实施；T7 先提炼行为合同，再用同一套断言比较新旧实现。

2026-10-03 已交付可运行基线：构建、5 条数据检查及内置 Browser 分段交互核验通过，视觉等待 Owner 签收。当前记录入口为外部项目 `docs/acceptance.md`、`evidence/validation.json`、`evidence/browser-check.json` 与 `evidence/source-baseline.json`；保留初次失败及其定向修复记录。`npm run test:browser` CLI 本轮尚未完整执行。

这是合成测试输入，不是真实客户 PRD、历史旧产品代码、Blind qualifying 输入或 Image2 Holdout。当前 kit 正式生成路径只有登记的 React / Vue 3 等底座；本基线独立启动并验收，不能以 `validate:workflows` 通过宣布 T6/T7 完成。
