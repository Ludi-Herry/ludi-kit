# tianshu-ops — 天枢运营管理平台（real-product）

kit 的**第一个真实业务项目**（`business-context.json` → `contextType: real-product`，brief 已确认 2026-07-09）。

- 业务事实源：`<local-path-omitted>`（界面级 PRD v1.0 + 架构共识 v0.1）
- kit 侧 brief：`../../docs/tianshu-ops.business-brief.md`
- 裁剪版 PRD：`prd.mdx`（覆盖原有 15 页与 firmware held-out 迭代页，共 16 页当前上下文）
- 页面规划：`flows.json`（7 流程）+ `pages.json`（16 页，流程卡/意图卡/组件计划）；逐页完成度以 technical / visual 双账本为准
- 状态文案映射：`status-copy.md`（项目层唯一来源，含正向、逆向、广告与内容状态）
- 前端合同：`library-native / react / antd@6.5.0`；`app.tsx`、`native-ui.tsx` 与 `generated/` 直接使用 Ant Design 原生组件、业务组合组件和项目覆盖
- AntD 知识：生成前读取 `../../foundations/knowledge/antd-6.5.0/` 的页面模板、决策卡、CLI 组件引用、按页 Blog 子集和视觉用例；`npm run antd:lint:projects` 对全部 native 合同执行硬门
- 回流：`feedback/`（BulkActionBar、ForbiddenState 与交互底座均已完成 promotion 记录和 dry-run 应用计划）
- 图标：静态通用图库固定为 `@ant-design/icons@6.3.2`，产品源码直接具名导入；候选库治理见 `../../docs/icon-library-candidates.md`
- 公共 kit 验证：`generator/fixtures/kit-consumer-canary/` 独立负责 `@ai-readable/kit` 导入边界，天枢不承担 canary 职责
- 页面验收：`evidence/page-acceptance.technical.json` 与 `evidence/page-acceptance.visual.json` 分别记录 16 页技术和视觉结论
- 设计走查：`evidence/antd-design-audit-2026-07-22.md` 记录 23→0 的 API/lint 清零结果、7 组系统性页面债务和后续修复顺序

## 本地应用入口

- 直接入口：`http://127.0.0.1:5188/tianshu/dashboard`
- 页面地址：统一使用 `/tianshu` 前缀，例如 `/tianshu/production/inbound`、`/tianshu/platform/rbac`。
- 侧栏：16 页按总览、生产履约、平台能力、广告变现、内容运营分组，所有菜单项均保留真实 `href`，应用内导航与浏览器前进/后退同步。
- 内部截图/差异入口：原有 `?render=tianshu-ops:<pageId>` 保持不变，继续服务冻结证据与视觉差异流程。

生产正向、RMA 逆向、广告投放/对账、内容排期/发布、RBAC 与审计页面均已落地。外部生产接口、竞价引擎、支付结算和内容分发服务仍保持显式边界。
