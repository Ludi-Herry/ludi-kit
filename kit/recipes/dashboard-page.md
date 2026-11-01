# Recipe: Dashboard Page

## 结构

```text
PageLayout
├─ PageHeader
├─ MetricCard grid
└─ Card / DataSection grid
```

## 生成步骤

1. 先写看板服务的业务问题。
2. 指标控制在 3-4 个，统一时间口径。
3. 每个图表卡写清数据含义。
4. 需要明细时用 `DataSection`，不要在 `Card` 里再塞表格壳。

生成前读 [data-visualization.md](../rules/data-visualization.md)。先定义用户看完要作的判断，再决定卡片与图表；联动、下钻、返回和导出仅按已有合同实现，统一时间与筛选范围。
