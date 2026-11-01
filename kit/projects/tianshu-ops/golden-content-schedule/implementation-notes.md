# Golden 1 · 内容排期页实现记录

## 当前结论

2026-08-09 已完成并由用户明确接受 Golden 1 v0，状态为 `accepted`。本轮计入 13 次总迭代预算，当前为 1/13；holdout 尚未使用。

页面入口：`http://127.0.0.1:5188/tianshu/content/schedule`

桌面证据：`output/playwright/golden-1-content-schedule-v0.png`

## 实现边界

- 使用 `projects/tianshu-ops/business-context.json`、AntD 6.5.0 design pack、冻结的 AntD generation knowledge 与 batch-01 内容排期参考图。
- 新增通用 `operationalList` 描述合同，由 `generate-project-pages.mjs` 生成步骤、标签、查询区、状态表格和三类 Drawer。
- 页面在 `projects/tianshu-ops/app.tsx` 的运行时路由层覆盖旧内容排期组件。`projects/tianshu-ops/generated/pages.tsx` 保持原字节和 SHA-256，冻结 Image2 source receipt 未漂移。
- 未读取或登记最后一份 eligible PRD；未修改 raw diff、Reviewer、阈值或 batch-01 冻结证据。

## 关键取舍

- 优先级使用普通文本，冲突与生命周期状态使用语义 Tag，减少全表彩色标签造成的噪声。
- 只有冲突行显示“冲突调整”，普通行只保留“详情”。
- 1440×1100 下表格 `clientWidth` 与 `scrollWidth` 均为 1103，无横向溢出。
- 生成器保留既有 6 个 fixture 的字节哈希，新 Golden fixture 两次生成一致，并增加 4 个 operational contract 负例。
- 正式 AntD knowledge 中未冻结 Radio 参考，本页优先级筛选与 Drawer 字段统一使用 Select。

## 已通过

- `npm run test:project-generator`
- `npm run typecheck`
- `npm run antd:lint:projects`
- `npm run test:image2-quality-pivot`
- `npm run validate:image2-quality-pivot`
- `npm run test:image2-calibration`
- `npm run validate:image2-calibration`
- `npm run build --prefix preview`
- `npm run validate`（251.5 秒，退出码 0）
- Codex 内置 Browser：1440×1100 可见性、桌面表格无横向溢出、0 console error。
- Playwright CLI：排期 ID 筛选 3→1、重置 1→3、冲突筛选 3→1；新建排期、上传素材、排期详情 Drawer；上下架审批空状态；1440、1024、390 三视口截图；0 error / 0 warning。

## 待完成

- `npm run build:preview` 的一次执行在外层 364 秒超时，未形成通过或失败结论；直接 preview build 与全量 `npm run validate` 均已通过，因此该记录只保留为非阻塞诊断。
- Golden 2、Golden 3、两组预冻结 holdout 与最终 Figma capture/readback 由新任务继续；范围不扩展到 19 组校准扩样。

完整收据与交互记录：`projects/tianshu-ops/golden-content-schedule/evidence/golden-1-v0.json`
