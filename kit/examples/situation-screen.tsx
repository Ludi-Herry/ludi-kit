import { ChartFrame, GaugeChart, AIReadableProvider, TrendChart } from "@ai-readable/kit";

export function SituationScreenExample() {
  return (
    <AIReadableProvider theme="screen">
      <main className="rd-situation-screen">
        <header><h1>安全监控态势</h1><time>2026-07-15 10:30</time></header>
        <ChartFrame title="运行异常资产趋势">
          <TrendChart categories={[{ key: "09", label: "09:00" }, { key: "10", label: "10:00" }]} series={[{ key: "assets", label: "异常资产", values: [8, 12] }]} summary="10:00 异常资产增至 12 台。" />
        </ChartFrame>
        <ChartFrame title="CPU 使用率">
          <GaugeChart label="CPU 使用率" value={74} unit="%" summary="CPU 使用率 74%，处于注意区间。" />
        </ChartFrame>
      </main>
    </AIReadableProvider>
  );
}
