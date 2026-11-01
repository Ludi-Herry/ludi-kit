import { BarChart, ChartFrame, DonutChart, MetricCard, PageHeader, PageLayout, TrendChart } from "@ai-readable/kit";

const categories = [
  { key: "mon", label: "周一" },
  { key: "tue", label: "周二" },
  { key: "wed", label: "周三" }
];

export function AnalyticsDashboardExample() {
  return (
    <PageLayout>
      <PageHeader title="日志分析" description="最近 7 日范式化日志口径" />
      <div className="example-metric-grid">
        <MetricCard label="日志总量" value="128,430" />
        <MetricCard label="高风险事件" value="36" trend="up" />
      </div>
      <div className="example-chart-grid">
        <ChartFrame title="事件趋势" caption="更新时间：2026-07-15 10:30">
          <TrendChart categories={categories} series={[{ key: "events", label: "事件", values: [18, 24, 36] }]} summary="周三事件数量达到 36 条，为三日最高。" />
        </ChartFrame>
        <ChartFrame title="风险分布">
          <BarChart categories={[{ key: "high", label: "高风险" }, { key: "medium", label: "中风险" }]} series={[{ key: "count", label: "数量", values: [36, 58] }]} summary="中风险事件数量高于高风险事件。" />
        </ChartFrame>
        <ChartFrame title="日志类别">
          <DonutChart data={[{ key: "network", label: "网络", value: 62 }, { key: "host", label: "主机", value: 38 }]} summary="网络日志占 62%。" />
        </ChartFrame>
      </div>
    </PageLayout>
  );
}
