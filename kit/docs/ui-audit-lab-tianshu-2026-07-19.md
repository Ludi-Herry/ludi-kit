# Lab + 天枢全量 UI 走查（2026-07-19）

## 结论

Radesign Lab 8 个视图、天枢 16 条真实路由均完成逐页交互和视觉走查，24/24 通过。浏览器与独立 Playwright CLI 的 console error / warning 均为 0，页面横向溢出为 0，重复 ID 为 0。

天枢已按 `library-native / react / antd@6.5.0` 运行。产品页直接使用 `antd`、`@ant-design/icons`、官方 `ConfigProvider` 主题和组件语义；`@radesign/kit` 公共 API 由独立 canary 验证。

## 本轮修复

| 范围 | 发现 | 修复与验证 |
| --- | --- | --- |
| Lab 反馈回流 | 视图只能阅读，缺少页面级验收动作 | 增加展开/收起反馈验收条件及 live status |
| Lab Figma 映射 | 映射列表缺少真实检查反馈 | 增加“检查映射”，状态明确切换到被检查组件 |
| Lab 项目上下文 | 流程卡缺少可验证选择状态 | 增加“查看流程”与当前流程反馈 |
| Lab 页面模式 | 模式卡缺少明确选择结果 | 增加“选用模式”与当前模式状态 |
| 天枢权限页 | 停用角色流程缺少 native 危险确认 | 使用 Ant Design Modal 绑定真实开关状态，取消后保持角色启用 |
| 天枢固件页 | 回滚确认的焦点回归需要精确到目标行 | 取消后焦点恢复到 `v2.3.2-TJ-M1` 行的“回滚”按钮 |
| 天枢原生迁移 | Steps 与 Drawer 出现 Ant Design 6 弃用警告 | 使用 `content` 与 `size` 当前 API，console warning 清零 |

## 覆盖结果

- Lab：8/8。项目成品、组件库、页面样例、页面清单、页面模式、Figma 映射、项目上下文、反馈回流各执行一个真实交互。
- 天枢：16/16。工作台、生产履约 9 页、平台 3 页、广告 2 页、内容 1 页各执行一个关键交互。
- 固件补充交互：目标版本回滚确认取消后，焦点精确恢复到原触发按钮。
- Browser：Codex 内置 Browser，1440×900、DPR 1，稳定 viewport 截图。
- Playwright CLI：`@playwright/cli 1.61.1`，复用 `http://127.0.0.1:5188`；验证天枢路由跳转、Lab 模式选择、console、overflow 与重复 ID。

## 分账证据

| 账本 | 范围 | 结果 |
| --- | --- | --- |
| `projects/tianshu-ops/evidence/page-acceptance.technical.json` | 天枢 16 页技术验收 | passed |
| `projects/tianshu-ops/evidence/page-acceptance.visual.json` | 天枢 16 页视觉验收 | passed |
| `quality/lab-page-acceptance.technical.json` | Lab 8 视图技术验收 | passed |
| `quality/lab-page-acceptance.visual.json` | Lab 8 视图视觉验收 | passed |

原始浏览器记录为 `output/playwright/foundation-audit-2026-07-19/browser-run.json`；独立 CLI 记录为 `output/playwright/foundation-audit-2026-07-19/playwright-cli-run.json`。逐页截图与 SHA-256 均由原始记录绑定。

## 工程门

| 门 | 结果 |
| --- | --- |
| `npm run validate` | passed；39 components、7 patterns、3 projects / 30 pages、7 workflows |
| `npm run typecheck` | passed |
| `npm run check:dom` | passed |
| `npm run check:harness` | passed；天枢 17、SA 10、shared/sample 2 |
| `npm run check:package` | passed；487 files、90 manifest paths、tarball install 与 runner cross-cwd passed |
| `npm run check:bundle` | preview 689.88 / 700 KiB gzip；starter 278.83 / 320 KiB gzip |

## 边界

本轮未修改 700 / 320 KiB bundle 门或 Image2 固定视觉阈值。Figma 外部阶段继续为 `external-blocked`，外部 ID 继续为 `null`。Image2 raw visual-diff 的失败判定与已批准 semantic exception 均保持原记录。
