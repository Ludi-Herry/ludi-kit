import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BarChart,
  ChartFrame,
  DonutChart,
  GaugeChart,
  TrendChart
} from "../../dist/charts.js";

let failures = 0;

const check = (name, html, assertions) => {
  for (const [label, assertion] of assertions) {
    const passed =
      typeof assertion === "string"
        ? html.includes(assertion)
        : typeof assertion === "function"
          ? assertion(html)
          : assertion.test(html);
    if (!passed) {
      failures += 1;
      console.error(`FAIL ${name}: ${label}\n  output: ${html.slice(0, 700)}`);
    }
  }
  console.log(`checked ${name}`);
};

const hasNoInvalidGeometry = (html) => !/NaN|Infinity|-Infinity/.test(html);

const readyFrame = renderToStaticMarkup(
  h(
    ChartFrame,
    {
      title: "事件趋势",
      description: "最近 7 日安全事件",
      caption: "口径：已范式化事件",
      size: "lg"
    },
    h("span", { "data-ready-child": "true" }, "ready")
  )
);
check("ChartFrame ready", readyFrame, [
  ["ready state", /class="[^"]*rd-chart-frame--ready[^"]*"[^>]*data-state="ready"/],
  ["semantic heading", /<h2 id="[^"]+">事件趋势<\/h2>/],
  ["description linked", /aria-describedby="[^"]+ [^"]+"/],
  ["ready child rendered", "data-ready-child=\"true\""],
  ["caption rendered", "口径：已范式化事件"]
]);

const loadingFrame = renderToStaticMarkup(h(ChartFrame, { title: "事件趋势", state: "loading" }));
check("ChartFrame loading", loadingFrame, [
  ["loading state", "data-state=\"loading\""],
  ["busy semantics", "aria-busy=\"true\""],
  ["polite status", /aria-live="polite"[^>]*role="status"/],
  ["default copy", "数据加载中…"]
]);

const emptyFrame = renderToStaticMarkup(
  h(ChartFrame, { title: "事件趋势", state: "empty", message: "当前筛选条件下暂无事件" })
);
check("ChartFrame empty", emptyFrame, [
  ["empty state", "data-state=\"empty\""],
  ["custom empty copy", "当前筛选条件下暂无事件"],
  ["status role", "role=\"status\""]
]);

const errorFrame = renderToStaticMarkup(
  h(ChartFrame, { title: "事件趋势", state: "error", action: h("button", null, "重试") })
);
check("ChartFrame error", errorFrame, [
  ["error state", "data-state=\"error\""],
  ["assertive alert", /aria-live="assertive"[^>]*role="alert"/],
  ["default error copy", "数据加载失败"],
  ["retry action", "<button>重试</button>"]
]);

const trendCategories = [
  { key: "mon", label: "周一" },
  { key: "tue", label: "周二" },
  { key: "wed", label: "周三" },
  { key: "thu", label: "周四" }
];
const trendSeries = [
  { key: "events", label: "事件数量", values: [10, null, 30, 20] }
];
const trend = renderToStaticMarkup(
  h(TrendChart, {
    area: true,
    categories: trendCategories,
    curve: "smooth",
    series: trendSeries,
    summary: "周三事件数量达到峰值 30 条。"
  })
);
check("TrendChart", trend, [
  ["chart root", /class="[^"]*rd-trend-chart[^"]*"[^>]*data-chart-type="trend"/],
  ["responsive svg", /aria-hidden="true"[^>]*focusable="false"[^>]*viewBox="0 0 640 260"/],
  ["null creates first segment", "data-segment-index=\"0\""],
  ["null creates second segment", "data-segment-index=\"1\""],
  ["three non-null marks", (html) => (html.match(/data-point-key=/g) ?? []).length === 3],
  ["null mark absent", (html) => !html.includes("data-point-key=\"tue\"")],
  ["native mark title", "<title>事件数量，周三：30</title>"],
  ["accessible summary", "<caption>周三事件数量达到峰值 30 条。</caption>"],
  ["null exposed in data table", "<td>无数据</td>"],
  ["valid geometry", hasNoInvalidGeometry]
]);

const barCategories = [
  { key: "critical", label: "高风险" },
  { key: "medium", label: "中风险" }
];
const barSeries = [
  { key: "current", label: "本期", values: [24, 36] },
  { key: "previous", label: "上期", values: [18, 30] }
];
const verticalBars = renderToStaticMarkup(
  h(BarChart, {
    categories: barCategories,
    series: barSeries,
    showValues: true,
    summary: "本期高风险与中风险漏洞均高于上期。"
  })
);
check("BarChart vertical", verticalBars, [
  ["vertical orientation", "data-orientation=\"vertical\""],
  ["four marks", (html) => (html.match(/<rect[^>]*data-category-key=/g) ?? []).length === 4],
  ["series binding", "data-series-key=\"previous\""],
  ["category binding", "data-category-key=\"critical\""],
  ["legend rendered", "aria-label=\"图例\""],
  ["accessible table", "<caption>本期高风险与中风险漏洞均高于上期。</caption>"],
  ["valid geometry", hasNoInvalidGeometry]
]);

const horizontalBars = renderToStaticMarkup(
  h(BarChart, {
    categories: barCategories,
    orientation: "horizontal",
    series: barSeries,
    summary: "横向比较风险漏洞数量。"
  })
);
check("BarChart horizontal", horizontalBars, [
  ["horizontal class", "rd-bar-chart--horizontal"],
  ["horizontal orientation", "data-orientation=\"horizontal\""],
  ["valid geometry", hasNoInvalidGeometry]
]);

const donut = renderToStaticMarkup(
  h(DonutChart, {
    centerLabel: "资产总数",
    data: [
      { key: "online", label: "在线", value: 70, tone: "success" },
      { key: "offline", label: "离线", value: 20, tone: "neutral" },
      { key: "abnormal", label: "异常", value: 10, tone: "danger" }
    ],
    legendPosition: "right",
    summary: "资产在线率为 70%。"
  })
);
check("DonutChart", donut, [
  ["chart root", "data-chart-type=\"donut\""],
  ["three segments", (html) => (html.match(/data-segment-key=/g) ?? []).length === 3],
  ["semantic tone", "data-tone=\"danger\""],
  ["native percentage title", "异常：10（10.0%）"],
  ["right legend", "rd-chart__legend--right"],
  ["percentage table", "<td>70.0%</td>"],
  ["valid geometry", hasNoInvalidGeometry]
]);

const gauge = renderToStaticMarkup(
  h(GaugeChart, {
    bands: [
      { max: 60, label: "正常", tone: "success" },
      { max: 80, label: "注意", tone: "warning" },
      { max: 100, label: "高负载", tone: "danger" }
    ],
    label: "CPU 使用率",
    summary: "CPU 使用率为 74%，处于注意区间。",
    unit: "%",
    value: 74
  })
);
check("GaugeChart", gauge, [
  ["chart root", "data-chart-type=\"gauge\""],
  ["three bands", (html) => (html.match(/data-band-label=/g) ?? []).length === 3],
  ["warning band", "data-band-label=\"注意\""],
  ["value exposed", "<td>74%</td>"],
  ["summary table", "<caption>CPU 使用率为 74%，处于注意区间。</caption>"],
  ["valid geometry", hasNoInvalidGeometry]
]);

const invalidTrend = renderToStaticMarkup(
  h(TrendChart, {
    categories: trendCategories,
    series: [{ key: "events", label: "事件", values: [1, 2] }],
    summary: "长度错误"
  })
);
check("Invalid cartesian data", invalidTrend, [
  ["invalid fallback", "data-chart-invalid=\"true\""],
  ["alert semantics", "role=\"alert\""],
  ["no svg leak", (html) => !html.includes("<svg")],
  ["no invalid geometry", hasNoInvalidGeometry]
]);

const emptyCategoryLabel = renderToStaticMarkup(
  h(TrendChart, {
    categories: [{ key: "empty", label: "   " }],
    series: [{ key: "events", label: "事件", values: [1] }],
    summary: "空分类标签"
  })
);
check("Empty cartesian category label", emptyCategoryLabel, [
  ["invalid fallback", "data-chart-invalid=\"true\""],
  ["no empty table header", (html) => !html.includes("<th scope=\"row\"></th>")]
]);

const invalidGauge = renderToStaticMarkup(
  h(GaugeChart, { label: "CPU", max: 100, summary: "越界", value: 120 })
);
check("Invalid gauge data", invalidGauge, [
  ["invalid fallback", "data-chart-invalid=\"true\""],
  ["no invalid geometry", hasNoInvalidGeometry]
]);

const chartSource = readFileSync(new URL("../../src/charts.tsx", import.meta.url), "utf8");
const chartStyles = readFileSync(new URL("../../src/charts.css", import.meta.url), "utf8");
check("Source boundaries", `${chartSource}\n${chartStyles}`, [
  ["no third-party chart dependency", (source) => !/recharts|echarts|chart\.js|d3-|@ant-design\/charts/i.test(source)],
  ["no inline svg colors", (source) => !/(?:fill|stroke)\s*=\s*["']#/.test(source)],
  ["no JSX inline styles", (source) => !source.includes("style={{")],
  ["chart palette token", "--color-chart-series-1"],
  ["hidden table cannot widen the page", /\.rd-chart__table\s*\{[\s\S]*?display:\s*block;[\s\S]*?max-width:\s*1px;/],
  ["screen theme", "data-theme=\"screen\""]
]);

if (failures > 0) {
  console.error(`\n${failures} chart component failure(s)`);
  process.exit(1);
}

console.log("\nALL CHART COMPONENT TESTS PASSED");
