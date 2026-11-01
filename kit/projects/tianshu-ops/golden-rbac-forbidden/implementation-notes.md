# Golden 3 · RBAC 无权限页实现记录

## 当前结论

Golden 3 v1 已完成正式生成、技术检查、三视口、关键交互、console 与证据收据，并于 2026-08-11 获得用户明确视觉接受。canonical `npm run validate` 在提交 `b4fdcb1` 以退出码 `0` 通过，耗时 `362.8s`。v0 因 JSX 模板错误和两条 AntD 6.5 废弃属性警告失败，原始错误已保存到 `evidence/golden-3-v0.failed.json`。本轮计入总预算后为 4/13，剩余 9 次，其中 2 次继续保留给 Holdout 终评。

页面入口：`http://127.0.0.1:5188/tianshu/platform/rbac/forbidden-preview`

桌面证据：`evidence/screenshots/golden-3-rbac-forbidden-v1-1440x1100.png`

移动证据：`evidence/screenshots/golden-3-rbac-forbidden-v1-390x844.png`

候选收据：`evidence/golden-3-v1.json`

## 实现边界

- 使用冻结的 RBAC 403 参考图、天枢页面合同、业务上下文与 AntD 6.5.0 design pack。
- 输出来自正式 `library-native + React + antd@6.5.0 + @ant-design/icons` generator；没有一次性 HTML，也没有导入 `@ai-readable/kit`。
- schema 与 generator 只在 `detail-page.content.permissionState` 存在时启用权限状态路径。旧 fixture 的确定性哈希保持不变。
- 403 页面只呈现缺失权限标识、恢复路径与安全申请说明。页面和申请面板都没有角色、用户或权限点表格。
- 既有 `projects/tianshu-ops/generated/pages.tsx` 与 calibration target/workflow 保持只读，新产物落在 `generated/golden-rbac-forbidden/`。

## 视觉与交互

- 1440×1100、1024×768、390×844 三张主截图均按精确 PNG raster 落盘，三个视口都没有页面级横向溢出。
- 403 数字和盾牌只承担视觉识别；`h1`、原因说明、`platform:rbac:read` 与两条恢复操作提供完整语义。
- “联系管理员申请权限”打开小型 Drawer。Drawer 只含权限标识和申请说明，关闭后焦点回到触发按钮。
- “返回工作台”在天枢壳内到达 `/tianshu/dashboard`。
- 390px 下两枚按钮纵向铺满，移动导航可展开和收起。
- Codex 内置 Browser 首轮复验与 Playwright CLI Chrome channel 的最终复验均已执行；最终 console 为 0 error / 0 warning。

## 已通过

- `npm run test:project-generator`
- `npm run typecheck`
- `npm run antd:lint:projects`（4 projects / 0 issues）
- `npm run validate:projects`
- `npm run test:image2-quality-pivot`
- `npm run validate:image2-quality-pivot`
- `npm run test:image2-golden-holdout-freeze`
- `npm run validate:image2-golden-holdout-freeze`
- `npm run test:image2-calibration`
- `npm run validate:image2-calibration`
- `npm run build`
- `npm run build --prefix preview`
- `node projects/tianshu-ops/golden-rbac-forbidden/scripts/capture-golden-3.mjs`
- `git diff --check`

## 失败保留

- v0 的 generator 合同测试首先发现 JSX 属性字符串断言差异；修正测试断言后，预览 TypeScript 检查发现权限标识多出一层花括号。
- v0 能运行后，Browser console 发现 Drawer `width` 和 Alert `message` 两条 AntD 6.5 废弃属性警告。v1 改用 `size` 与 `title`，最终 console 清零。
- 独立 worktree 中的 `npm run build:preview` 会进入整仓验证，并在 canonical guided-pilot evidence 的绝对路径绑定处失败。冻结 evidence 与 validator 未修改；本次接受 checkpoint 提交后在 `<local-path-omitted>` 执行完整 `npm run validate`。
- 证据脚本首轮在移动导航展开后继续按旧 accessible name 查找按钮，因此超时。脚本改用稳定开关定位，并同时验证“展开导航”和“收起导航”。

## 动效取舍

该页面承担安全拦截与恢复提示，视觉节奏保持安静。页面使用既有短入场和 AntD Drawer 过渡，并保留 `prefers-reduced-motion` 降级；没有增加装饰性循环动画。

## 下一步门

Golden 3 v1 的接受收据与 canonical 全量验证均已闭合。下一步打开两组预冻结 Holdout 做一次性终评。Holdout 结果禁止用于返修。Figma `YOUR_NODE_ID` 继续保持未写入。

## Deviations

- v0 失败占用第 3 次迭代，v1 占用第 4 次迭代。预算按实际候选保守记账。
- 三张主截图使用 Playwright CLI Chrome channel 保存，以保证 PNG raster 精确匹配请求视口；Codex 内置 Browser 负责先行视觉和交互检查。
