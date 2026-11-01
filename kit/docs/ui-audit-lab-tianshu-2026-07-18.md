# Lab + 天枢全量 UI 走查（2026-07-18）

## 结论

本轮已完成修复与回归。Radesign Lab 8 个视图、天枢 16 条路由在 1280×720 与 390×844 下均可进入；页面级横向溢出为 0，重复 ID 为 0，整页入场动画为 0，Browser 与 Playwright 的 console error / warning 均为 0。

本轮没有改动视觉阈值、700 / 320 KiB bundle 门、Figma 外部状态或外部 ID。

## 参考校准

选择 Ant Design 作为主参考，原因是当前 kit 与天枢都使用 antd 6.x，导航、后台布局和数据展示规则可以直接落进现有组件合同。校准重点为：固定侧栏与流式内容区、当前导航的最高强调、操作密集后台的侧栏导航、时间/状态/操作列保持可读，以及移动端逐步披露导航。

- Ant Design Layout: https://ant.design/components/layout/
- Ant Design Navigation: https://ant.design/docs/spec/navigation/
- Ant Design Data Display: https://ant.design/docs/spec/data-display/
- Atlassian Navigation: https://atlassian.design/components/navigation-system/

## 已修复问题

| 优先级 | 问题 | 修复结果 |
| --- | --- | --- |
| P1 | 390 px 下完整侧栏先于正文出现，首屏需要长距离滚动 | Lab 与天枢改为折叠式移动导航，默认收起，选择页面后自动收回 |
| P1 | Lab 与生成页使用 500 ms 模糊、位移的整页入场动画 | 壳层与天枢页面取消整页动画，保留 150–250 ms 的状态反馈与 reduced-motion |
| P1 | 95 个按钮或筛选动作缺少可见结果 | 工作台主操作与快捷入口接真实本地路由；其余本地演示操作进入 live region，明确不会写入外部系统 |
| P2 | Lab 把统计信息渲染成可点击按钮 | 组件数、页面数、映射数、应用计划与 public API 标识改为 Badge；页面模式数同步为 7 |
| P2 | 内容排期等 9–10 列表格过度压缩 | 天枢壳层给三类页面设置表格最小宽度，由表格容器承接横向滚动，页面本身保持 0 溢出 |
| P2 | 产品页暴露 PRD、MVP、第二批、预埋等研发文案 | 工作台、烧录、SN、测试与权限页改成业务状态、约束和下一步 |
| P2 | 多组 SideNav 都使用相同的“主导航”名称 | SideNav 新增 `ariaLabel`，Lab 与天枢按分组输出唯一导航名称，并补齐 focus-visible |
| P2 | 403 验收页混在平台日常功能中 | 403 页面移到“验收辅助”分组，返回工作台接真实路由 |

## 浏览器与交互证据

- Lab 8/8：项目成品、组件库、页面模式、页面样例、页面清单、项目上下文、Figma 映射、反馈回流。
- 天枢 16/16：工作台、生产履约 9 页、平台 3 页、广告 2 页、内容 1 页。
- 工作台“处理最高优先级待办”跳转到 `/tianshu/production/flashing`。
- 烧录表单缺少固件时显示必填错误；选择固件后显示本地创建结果。
- “存草稿”等无外部后端动作进入 `role=status`，反馈文案说明演示边界。
- Lab 查询参数路由支持浏览器前进与后退。
- 390×844 下两套导航默认隐藏分组，展开后为 `grid`，页面横向溢出为 0。

详细记录：`output/playwright/ui-audit-2026-07-18/browser-evidence.json`。

## 验收门

| 门 | 结果 |
| --- | --- |
| `npm run typecheck` | passed |
| `npm run validate` | passed；7 workflows = implemented 1 / external-blocked 4 / partial 2 |
| `npm run check:harness:tianshu` | 17/17 passed；每个场景 100 分、0 错、0 警告 |
| `npm run check:dom` | passed |
| `npm run build:preview` | 641.51 KiB gzip / 700 KiB |
| `npm run build:starter` | 278.83 KiB gzip / 320 KiB |
| `npm run check:package` | 414 files；73 manifest paths；tarball install 与 cross-cwd passed |
| `npm run check:bundle` | Preview 与 Starter passed |
| Browser + Playwright | Lab 8/8、天枢 16/16、console 0/0 |

## 工作流影响

本轮属于已实现页面的 UI 回归与修复，没有推动工作流阶段状态：

- `requirement-to-final-page`: `implemented`
- `existing-figma-library-to-page`: `external-blocked`
- `image2-to-figma-page`: `external-blocked`
- `prd-antd-to-figma-calibrated-page`: `external-blocked`
- `figma-spec-to-code-foundation`: `external-blocked`
- `design-system-zero-to-one`: `partial`
- `figma-3d-situation-screen`: `partial`

Figma `fileKey` 与目标 `pageNodeId` 继续为 `null`，没有生成占位 ID。
