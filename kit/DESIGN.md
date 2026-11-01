# Ludi Design Kit 设计基线

这份文档只定义稳定的视觉方向和跨页面结构。组件选择看 `components.manifest.json`，精确 Token 看 `tokens.manifest.json`，页面约束看 `rules/` 与 `recipes/`。

## 视觉方向

安静、清晰、适合持续工作。B 端和设计系统场景优先保证扫描效率、信息层级和状态辨认。

## 主题

| 主题 | 适用场景 | 视觉倾向 |
| --- | --- | --- |
| `vivid` | 默认后台与演示 | 识别度较高 |
| `calm` | 长时间使用的工作台 | 干扰较低 |
| `screen` | 态势大屏 | 深色、高密度、固定场景 |

`AIReadableProvider` 负责应用主题。`ThemeToggle` 只切换 `vivid` 与 `calm`；大屏容器显式声明 `screen`。

## 页面骨架

- 应用导航和顶栏由 `AppShell` 承载。
- 单页宽度和密度由 `PageLayout` 控制。
- 页面级标题使用 `PageHeader` 或 `DetailHeader`。
- 列表页按 `FilterPanel → DataSection → DataGrid` 组织。
- 详情页的键值属性使用 `DescriptionGrid`。
- 表单按业务语义拆成 `FormSection`。
- pattern 锁定区域由 `patterns.manifest.json > regions` 决定；业务内容只进入 `owner: "page"` 的槽位。

## Token 使用

页面使用语义 Token，避免直接写颜色、阴影、圆角和固定间距。需要新语义时，先确认现有 Token 和组件能力，再更新 `tokens.manifest.json` 与对应实现。

常用语义包括：

- 页面与内容面：`color.bg.page`、`color.bg.surface`
- 品牌与正文：`color.brand.primary`、`color.text.primary`、`color.text.secondary`
- 边界：`color.border`
- 状态：`color.status.success`、`warning`、`danger`、`info`

## 验收重点

设计方法按页面任务选用：业务图表读 [数据可视化](./rules/data-visualization.md)，流程和拓扑读 [流程图与关系图](./rules/flow-diagram.md)，外部 Skill 读 [调用边界](./docs/design-skill-routing.md)。B 端操作页面以任务、状态和扫描效率为先；营销展示的视觉策略只在对应任务启用。

- 页面级标题、导航和主操作位置一致。
- 图标与文字按中线、基线或视觉重心核对；阴影裁切检查与记录见 [视觉对齐与裁切](./rules/visual-alignment.md)。
- 业务状态同时提供文案或图形线索。
- 窄屏保持页面无外层横向溢出；复杂表格在自己的容器内滚动。
- 动效支持 `prefers-reduced-motion`。
- 技术与视觉结果分别记录。
