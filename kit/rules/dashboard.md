# Dashboard Rules

## 结构

1. `PageHeader` 说明看板目标。
2. `MetricCard` 行展示关键指标。
3. `Card` 承载图表、趋势、提醒。
4. 明细数据进入 `DataSection`。

## 指标

- 指标卡数量保持一行可扫描，常用 3-4 个。
- 趋势用 `trend`，不要用纯颜色表达含义。
- 图表占位也要说明数据口径。

## 图表与分析任务

生成前读取 [data-visualization.md](./data-visualization.md)，明确指标、图表与明细的时间范围、聚合、来源和更新时间。看板按观察、定位、处理的任务组织；合同要求的联动、下钻、返回和导出保持同一范围。

系统关系、依赖与拓扑读取 [flow-diagram.md](./flow-diagram.md)。折叠或分组不能把监控异常藏掉，也不能丢失真实连接。
