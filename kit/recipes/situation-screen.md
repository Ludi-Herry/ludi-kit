# Situation Screen

## 使用边界

全屏值守、实时态势和汇报墙使用 `situation-screen`。后台导航、表单和普通列表留在管理端页面。

## 结构

`AIReadableProvider theme="screen" → main.rd-situation-screen → 全局指标/时间 → 12 列动态面板 → 实时行动列表`

- 复用图表数据类型与 SVG 几何。
- 文字对比度至少 4.5:1，图形和控件至少 3:1。
- 支持 1920×1080、1366×768、1024×768 摘要模式。
- `prefers-reduced-motion` 下关闭持续动画。

## 外部数据

Geo/3D、攻击飞线和拓扑必须有授权素材、坐标、时间、级别及聚合规则。缺少这些输入时保留明确占位说明，避免用普通 SVG 装饰冒充真实态势。

## 禁止

- 整屏使用 `transform: scale()`。
- 把 `AppShell`、`PageLayout`、`Card` 套进大屏。
- 目标屏未确认时承诺像素级对齐。
