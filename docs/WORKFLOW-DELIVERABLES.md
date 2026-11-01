# 工作流交付合同

这份文档定义任务结束时用户首先拿到什么，以及 Agent 怎样呈现成品。七条 canonical workflow 的具体目标、打开命令和阻塞恢复信息由 [`kit/workflows.manifest.json`](../kit/workflows.manifest.json) 中的 `handoff` 维护。

## 产物分层

| 层级 | 回答的问题 | 示例 | 可以单独作为主交付吗 |
| --- | --- | --- | --- |
| Primary deliverable | 用户现在能直接使用、查看、安装或编辑什么 | 浏览器页面、Figma node、package、规范站、交互式大屏、审计报告 | 可以 |
| Supporting evidence | 什么证据证明成品达到合同 | Browser 记录、截图、heatmap、metrics、harness、性能报告、SHA | 不可以 |
| Source / internal artifacts | 后续怎样维护和复跑 | TSX、CSS、schema、prompt、manifest、component index、脚本 | 不可以 |

截图用于预览和验收；交互式页面仍需提供可打开入口。源码用于维护交接；用户仍需知道怎样运行成品。package 交付还要包含安装命令和最小消费示例。

## 结束任务前

1. 读取 workflow 的 `handoff.target`、`handoff.open` 和 `blockedDelivery`。
2. UI、Web 或大屏任务复用唯一 server，确认终端报告的实际端口。
3. 在应用内 Browser 打开主入口，执行至少一个合同内真实交互并检查 console。
4. 保持主交付 tab 可见，让用户可以继续检查。
5. 最终回复先给成品名称、入口和状态，再给源码与证据。
6. 外部目标缺失时，交付 `blockedDelivery.deliverNow` 指定的现有材料，并列出缺失字段、权限范围和恢复动作。
7. raw gate 失败时保留原 verdict；人工或语义接受单独记录。

## 按链路选择主交付物

| 链路 | Primary deliverable | 必带支持证据 | 完成边界 |
| --- | --- | --- | --- |
| PRD → 可运行项目 | 可交互 Web 页面和可部署 build | 项目合同、Browser、harness、bundle | 主任务可完成，稳定 route 可打开 |
| 参考图或无稿探索 → 新页面 | 选定方向后的可交互页面；需求包含 Figma 时追加 node URL | 冻结 brief、参考图、raw diff、Reviewer 和用户 verdict | 页面可用；Figma 阶段单独验收 |
| 已有规范 → 规范内新页面 | 本地规范交 Web 页面；Figma Library 交真实 page/node | design pack hash、组件映射、Browser、readback | 两个支路按各自目标交付 |
| Figma 规范 → 代码底座 | 可安装 package 和可浏览组件目录 | tokens、component map、variant map、Figma readback | 独立消费方能安装、导入和构建 |
| 0 → 1 设计系统 | 规范站和 package；授权后追加 Figma Library | Design.md、tokens、component index、验收报告 | 团队能查规则并在项目中消费 |
| 数据大屏或态势大屏 | 可全屏运行的页面和 production build | 数据接入说明、性能、响应式、恢复测试 | 关键交互、性能和异常状态可验证 |
| Figma 移动端还原 | 可触控的响应式页面 | Figma node、safe area、溢出和跳转证据 | 目标设备可操作 |
| 已有项目迭代与反馈回流 | 更新后的同一产品 route 或 release build | feedback record、diff、回归结果 | 修改抵达权威输入并通过受影响流程 |
| AI 设计走查 | 可浏览的问题清单或差异报告 | 原图、实现图、heatmap、metrics | 每个问题可定位、有严重度和状态 |
| Kit 发布与跨项目消费 | 可安装 package 和最小消费示例 | SHA、文件清单、cross-cwd、bundle | 独立消费方能安装、导入和构建 |

## Canonical workflow 映射

| Workflow | 目标种类 |
| --- | --- |
| `requirement-to-final-page` | 可交互业务页面 |
| `existing-figma-library-to-page` | 使用真实组件库搭建的 Figma page 或 node |
| `image2-to-figma-page` | 可交互重建页面；按请求追加 Figma node |
| `prd-antd-to-figma-calibrated-page` | 可交互 PRD 页面和校准后的 Figma node |
| `figma-spec-to-code-foundation` | 可安装代码底座和组件目录 |
| `design-system-zero-to-one` | 设计系统规范站和 package |
| `figma-3d-situation-screen` | 交互式大屏和 production build |

表格只说明稳定目标种类。当前状态、标签、入口、证据 ID 和 blocked fallback 从 manifest 读取。

## 交付自检

- [ ] 主交付物真实存在，入口经过当前会话验证。
- [ ] 用户能直接打开、使用、安装或继续编辑。
- [ ] 至少一个关键交互已验证。
- [ ] console 和受影响的质量门已记录。
- [ ] 技术与视觉 verdict 分开呈现。
- [ ] 支持证据没有冒充主交付物。
- [ ] 阻塞项写清当前可交内容、缺失输入和恢复动作。
