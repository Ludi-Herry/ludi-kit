# Analytics Dashboard

## 使用边界

当页面包含两张以上共享时间口径的图表，用 `analytics-dashboard`。单张趋势图继续放在 `dashboard-page`，减少重复壳层。

## 结构

`PageLayout → PageHeader → MetricCard 行 → ChartFrame 网格 → 可选 DataSection`

- `ChartFrame` 统一标题、状态、口径和更新时间。
- 图表的 `summary` 写出业务结论，隐藏数据表提供完整读屏数据。
- 390px 单列；笛卡尔图在自身区域横向滚动，页面保持无横向溢出。

## 图表选择

先读 [data-visualization.md](../rules/data-visualization.md)，核对口径、单位、比较基准、缺失数据和交互。以下名称指 `kit-consumer`；native 项目映射到合同已登记的图表入口。关系 / 拓扑图另读 [flow-diagram.md](../rules/flow-diagram.md)。

- 时间变化：`TrendChart`
- 分类比较：`BarChart`
- 构成占比：`DonutChart`
- 单值阈值：`GaugeChart`

## 禁止

- 图表外再套 `Card` 或 `DataSection`。
- 只用颜色传达严重程度。
- 省略数据口径、来源与更新时间。
