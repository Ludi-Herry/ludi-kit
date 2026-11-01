# 测试清单

每一项跑完，在 Issues 记录结果。卡住了也算有效结果，不用自己绕过去。

## 怎么反馈

每个问题开一个 Issue，写清：

1. 测的是哪一项，比如“B3 导出工程”。
2. 系统和版本：Windows、macOS 或 Linux，加上 `node -v` 的输出。
3. 操作步骤。
4. 期望结果和实际结果。
5. 报错原文或截图。

顺手告诉我：哪一步最花时间、哪里看不懂、哪个功能你真的想用。

## A. 安装（必测）

| 编号 | 操作 | 期望结果 |
| --- | --- | --- |
| A1 | 按 README 跑完安装和 `npm run check:all` | 退出码为 0 |
| A2 | 在 `kit/preview` 运行 `npm run dev`，打开终端打印的地址 | 首页正常显示 |
| A3 | 记录从克隆到首页打开用了多久 | 把时间写进反馈 |

## B. 不需要额外账号的功能

命令都在 `kit/` 目录运行。

| 编号 | 功能 | 操作 | 期望结果 |
| --- | --- | --- | --- |
| B1 | 可视化编辑器 | 打开 `/editor`，改颜色或圆角，点“写入项目”，再撤销 | 页面跟着变；四项检查通过；撤销后文件恢复。第一次写入约 30 秒 |
| B2 | 页面生成器 | `npm run generate:project -- --description generator/fixtures/field-service/project-description.json --context generator/fixtures/field-service/business-context.json --out output/field-service` | `output/field-service` 生成页面文件 |
| B3 | 工程导出 | `npm run export:project -- --project tianshu-device-ops --out <仓库外的绝对路径>`，再到导出目录运行 `npm install` 和 `npm run dev` | 独立工程能打开，`handoff/` 有 API 合同和 mock 数据 |
| B4 | 只读 CLI | `npm run ai-readable -- inspect --project tianshu-ops --page production-inbound --json` | 输出页面上下文 JSON，退出码为 0 |
| B5 | 打包和 starter | `npm run pack:local`，再运行 `npm run build:starter` | 生成 `.tgz`，starter 构建通过 |
| B6 | 代码验收器 | `npm run check:harness`，再运行 `npm run check:harness:negative` | 正例通过，反例被拒绝 |
| B7 | Image2 `existing` 路由 | `npm run validate:image2`，再运行 `npm run run:image2:existing` | 检查通过，运行记录写到 `output/` |
| B8 | 多底座 | 看首页的项目入口，切换不同底座的页面 | 页面正常，记录哪个底座出问题 |

## C. 用你自己的 AI Agent 测

让 Claude Code、Codex 或其他 Agent 在 `kit/` 目录工作，它会读 `AGENTS.md`。

| 编号 | 任务 | 怎么算通过 |
| --- | --- | --- |
| C1 | 给它一段真实后台页面需求，让它按 Kit 生成页面 | 页面能跑，组件和样式来自 Kit，记录你改了多少才能用 |
| C2 | 让它换一套主题，再改出一个你自己要用的页面 | 不用手写大量样式 |
| C3 | 让它走一遍 `docs/WORKFLOW-ROUTING.md` 选链路 | 它选的链路符合你的任务，或者你能说清哪里不对 |

## D. 需要额外条件的链路

机器可读的状态在 `kit/workflows.manifest.json`，选择方法看 `docs/WORKFLOW-ROUTING.md`。

| 编号 | 链路 | 需要什么 |
| --- | --- | --- |
| D1 | 需求到最终页面（`requirement-to-final-page`） | AI Agent、Playwright |
| D2 | 现有 Figma 组件库到页面（`existing-figma-library-to-page`） | Figma 写权限、你自己的组件库文件 |
| D3 | PRD + antd 到 Figma 校准页（`prd-antd-to-figma-calibrated-page`） | Figma 写权限、你自己的目标文件 |
| D4 | Figma 规范到代码底座（`figma-spec-to-code-foundation`） | Figma 权限、你自己的规范文件 |
| D5 | 设计系统从零到一（`design-system-zero-to-one`） | Figma 权限、AI Agent |
| D6 | Figma 3D 大屏（`figma-3d-situation-screen`） | Figma 权限、3D 素材，读 `kit/skills/figma-3d-situation-screen` |
| D7 | Image2 探索路由（`image2-to-figma-page` 的 `exploratory`） | 图像生成工具；写入 Figma 时还要 Figma 权限 |

这些链路依赖的本机 Skill（如 `figma-component-builder`）没有随仓库提供。缺什么就在 Issue 里记下来，这正是要测的内容。

## 已知限制

- 真实 Figma 文件标识已替换为 `<your-figma-file-key>`，Figma 链路要换成你自己的文件。
- 编辑器的 `browser.edge-smoke` 检查要调用 Microsoft Edge。没装 Edge 时写入会被检查拦下，并自动恢复文件。
- macOS 和 Linux 还没有验证，这是重点测试内容。
- Image2 链路状态是 `partial`。内部 3 个 Golden 样本通过，Holdout 13 轮迭代全部 NO-GO。`exploratory` 的浏览器证据检查写死了工具名。
- 编辑器的 AI 建议需要本机配置模型，未配置时会显示不可用。
- 部分内部命令（`validate:internal`、`validate:workflows`、`validate:figma:*`、`validate:integrity` 等）要读没带来的内部历史，失败属于预期。
- `product.category = ai-product` 的可选知识包没有随仓库提供。
- 示范项目的数据是模拟数据。手机号的中间四位统一写成 `0000`。
