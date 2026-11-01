# Frontend foundation system implementation notes

开始：2026-07-19

## Success contract

- [x] 三种 `outputMode` 进入 schema、运行时 policy、生成器和 validator。
- [x] 生成器在输出前验证项目合同与 design pack 哈希。
- [x] 候选档案不引入未选中的运行时依赖。
- [x] 天枢固定 `library-native / react / antd@6.5.0`，产品目录内无 `@ai-readable/kit` 导入。
- [x] kit-consumer canary 独立验证公共入口，39 组件矩阵保持单独 owner。
- [x] 天枢每页至少一个真实交互，technical 与 visual 证据分别记录。
- [x] 固定 bundle 与 Image2 视觉门零改动。

## Guard against false completion

- 只改 enum、文档或 schema 不计完成。
- 只在 adapter 内转发旧 kit 组件不计天枢 native 迁移。
- 只检查路由可打开、不执行页面交互不计逐页通过。
- 截图、diff、console 和 overflow 缺任一项时，视觉或技术状态保持未通过。
- Vue 路线只有 schema 没有可生成的 `.vue` 产物时不计实现。

## Deviations

- Lab 长页面在内置 Browser 使用 document full-page 截图时会改变响应式 media-query 状态。本轮统一采用 1440×900 稳定 viewport 截图，并在 `browser-run.json.capturePolicy` 留下原因与口径。
- mode-aware import policy 首轮接入后，legacy harness 的深层静态值检查发生一次回归。修复后恢复 88 个合同测试与 fail-closed 负例全过。
- preview gzip 达到 689.88 KiB，距离 700 KiB 固定门余 10.12 KiB。后续增加第三方运行时代码前必须先做 bundle 试验。

## Closeout

- 完成：2026-07-19
- package：487 files / 90 manifest paths / isolated install and cross-cwd runner passed
- page acceptance：Lab 8/8；天枢 16/16；console 0 errors / 0 warnings；横向溢出 0
- bundle：preview 689.88 / 700 KiB gzip；starter 278.83 / 320 KiB gzip
- 外部边界：Figma 阶段保持 `external-blocked`，外部 ID 保持 `null`
