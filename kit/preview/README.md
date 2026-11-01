# Ludi Design Lab

Ludi Design Lab 是内部开发与验收入口。首页先呈现可运行项目，再按任务进入组件目录、页面 pattern、Figma 映射、feedback 和 evidence。

Lab 消费 `.local-pack/` 中的本地 tarball，用来验证真实 package 边界。公开展示站承担发现和文档检索职责，不与 Lab 的工程验收信息混排。

## 运行

从 `kit/` 执行：

```powershell
npm run dev:preview
```

按终端输出打开实际地址。默认根路由通常为 `http://127.0.0.1:5188/`，天枢工作台为 `/tianshu/dashboard`；端口变化时以当前终端输出为准。

## 构建

```powershell
npm run build:preview
```

构建命令会执行 package 边界和 bundle 检查。验收页面时还要按目标 workflow 的 `handoff` 打开主入口并完成关键交互。

## 组件库编辑器（T1）

入口：`http://127.0.0.1:5393/editor`（端口以 dev 终端输出为准）。

- `/editor`：组件库工作台。左栏 Token 六值五组与 P0 组件目录；中栏「组件矩阵」（`/editor/matrix?component=<名>&editor=1`）或「应用到项目」真实路由 iframe；右栏检查器（属性 / 规则）与写入、检查进度、撤销。
- `/editor/page?route=<路由>`：页面检查。点选组件显示来源位置与替换候选，逐项确认不可迁移 props 后写回。
- 外壳使用独立 `--ludi-*` 变量与 antd `prefixCls="ludi"`；既有 Lab 入口在 `src/main.tsx` 路由拆分时 lazy 加载，行为不变。
- 本地接口、消息格式、Patch 记录与错误码以 [`EDITOR-PROTOCOL.md`](./EDITOR-PROTOCOL.md) 为准；后端实现在 `editor-server/`，实现说明见 `src/editor/IMPLEMENTATION-NOTES.md`。
