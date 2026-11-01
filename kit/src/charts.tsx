import type { ReactNode } from "react";
import { useId } from "react";

export type ChartTone =
  | "series-1"
  | "series-2"
  | "series-3"
  | "series-4"
  | "series-5"
  | "series-6"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export type ChartCategory = {
  key: string;
  label: string;
};

export type ChartSeries = {
  key: string;
  label: string;
  values: readonly (number | null)[];
  tone?: ChartTone;
};

export type ChartDatum = {
  key: string;
  label: string;
  value: number;
  tone?: ChartTone;
};

export type GaugeBand = {
  max: number;
  label: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
};

type ChartBaseProps = {
  className?: string;
};

type ChartFrameSharedProps = ChartBaseProps & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  caption?: ReactNode;
  size?: "sm" | "md" | "lg";
};

type ChartFrameContent =
  | {
      state?: "ready";
      children: ReactNode;
      message?: never;
      action?: never;
    }
  | {
      state: "loading" | "empty" | "error";
      children?: never;
      message?: ReactNode;
      action?: ReactNode;
    };

export type ChartFrameProps = ChartFrameSharedProps & ChartFrameContent;

export type TrendChartProps = ChartBaseProps & {
  categories: readonly ChartCategory[];
  series: readonly ChartSeries[];
  summary: string;
  area?: boolean;
  curve?: "linear" | "smooth";
  showLegend?: boolean;
  showPoints?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
  valueFormatter?: (value: number) => string;
};

export type BarChartProps = ChartBaseProps & {
  categories: readonly ChartCategory[];
  series: readonly ChartSeries[];
  summary: string;
  orientation?: "vertical" | "horizontal";
  showLegend?: boolean;
  showValues?: boolean;
  valueFormatter?: (value: number) => string;
};

export type DonutChartProps = ChartBaseProps & {
  data: readonly ChartDatum[];
  summary: string;
  centerLabel?: string;
  centerValue?: string | number;
  showLegend?: boolean;
  legendPosition?: "bottom" | "right";
  valueFormatter?: (value: number) => string;
};

export type GaugeChartProps = ChartBaseProps & {
  label: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  bands?: readonly GaugeBand[];
  summary: string;
  valueFormatter?: (value: number) => string;
};

type Point = {
  index: number;
  x: number;
  y: number;
  value: number;
};

type LegendItem = {
  key: string;
  label: string;
  tone: ChartTone;
};

const CARTESIAN_WIDTH = 640;
const CARTESIAN_HEIGHT = 260;
const DEFAULT_TONES: readonly ChartTone[] = [
  "series-1",
  "series-2",
  "series-3",
  "series-4",
  "series-5",
  "series-6"
];

const cx = (...items: Array<string | false | null | undefined>) => items.filter(Boolean).join(" ");

const defaultValueFormatter = (value: number) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);

const toneForIndex = (tone: ChartTone | undefined, index: number) => tone ?? DEFAULT_TONES[index % DEFAULT_TONES.length];

const toneClass = (tone: ChartTone) => `rd-chart-tone--${tone}`;

const patternClass = (index: number) => `rd-chart-pattern--${(index % DEFAULT_TONES.length) + 1}`;

const hasUniqueKeys = (items: readonly { key: string }[]) => {
  const keys = items.map((item) => item.key);
  return keys.every((key) => key.trim().length > 0) && new Set(keys).size === keys.length;
};

const isFiniteChartValue = (value: number | null) => value === null || Number.isFinite(value);

const isValidCartesianData = (
  categories: readonly ChartCategory[],
  series: readonly ChartSeries[],
  options: { maxCategories: number; nonNegative: boolean }
) => {
  if (
    categories.length === 0 ||
    categories.length > options.maxCategories ||
    series.length === 0 ||
    series.length > DEFAULT_TONES.length ||
    !hasUniqueKeys(categories) ||
    !hasUniqueKeys(series) ||
    categories.some((item) => item.label.trim().length === 0)
  ) {
    return false;
  }

  return series.every(
    (item) =>
      item.label.trim().length > 0 &&
      item.values.length === categories.length &&
      item.values.every(
        (value) => isFiniteChartValue(value) && (!options.nonNegative || value === null || value >= 0)
      )
  );
};

const getDomain = (values: readonly number[]) => {
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  if (minValue === maxValue) return minValue === 0 ? [0, 1] as const : [minValue - 1, maxValue + 1] as const;
  return [minValue, maxValue] as const;
};

const pathForPoints = (points: readonly Point[], curve: "linear" | "smooth") => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (curve === "linear") {
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midpoint = (previous.x + current.x) / 2;
    path += ` C ${midpoint} ${previous.y}, ${midpoint} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
};

const splitIntoSegments = (points: readonly (Point | null)[]) => {
  const segments: Point[][] = [];
  let current: Point[] = [];
  for (const point of points) {
    if (point) {
      current.push(point);
    } else if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
};

const polarPoint = (centerX: number, centerY: number, radius: number, angle: number) => {
  const radians = (angle * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians)
  };
};

const donutPath = (
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) => {
  const sweep = Math.max(0, endAngle - startAngle);
  if (sweep >= 359.999) {
    const outerStart = polarPoint(centerX, centerY, outerRadius, startAngle);
    const outerOpposite = polarPoint(centerX, centerY, outerRadius, startAngle + 180);
    const innerStart = polarPoint(centerX, centerY, innerRadius, startAngle);
    const innerOpposite = polarPoint(centerX, centerY, innerRadius, startAngle + 180);
    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${outerOpposite.x} ${outerOpposite.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${outerStart.x} ${outerStart.y}`,
      `L ${innerStart.x} ${innerStart.y}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${innerOpposite.x} ${innerOpposite.y}`,
      `A ${innerRadius} ${innerRadius} 0 1 0 ${innerStart.x} ${innerStart.y}`,
      "Z"
    ].join(" ");
  }

  const outerStart = polarPoint(centerX, centerY, outerRadius, startAngle);
  const outerEnd = polarPoint(centerX, centerY, outerRadius, endAngle);
  const innerEnd = polarPoint(centerX, centerY, innerRadius, endAngle);
  const innerStart = polarPoint(centerX, centerY, innerRadius, startAngle);
  const largeArc = sweep > 180 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z"
  ].join(" ");
};

function InvalidChart({ className }: ChartBaseProps) {
  return (
    <div className={cx("rd-chart", "rd-chart__invalid", className)} data-chart-invalid="true" role="alert">
      图表数据格式有误
    </div>
  );
}

function ChartLegend({ items, position = "bottom" }: { items: readonly LegendItem[]; position?: "bottom" | "right" }) {
  return (
    <ul className={cx("rd-chart__legend", `rd-chart__legend--${position}`)} aria-label="图例">
      {items.map((item) => (
        <li key={item.key}>
          <span aria-hidden="true" className={cx("rd-chart__legend-swatch", toneClass(item.tone))} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function CartesianDataTable({
  categories,
  series,
  summary,
  valueFormatter
}: {
  categories: readonly ChartCategory[];
  series: readonly ChartSeries[];
  summary: string;
  valueFormatter: (value: number) => string;
}) {
  return (
    <table className="rd-sr-only rd-chart__table">
      <caption>{summary}</caption>
      <thead>
        <tr>
          <th scope="col">分类</th>
          {series.map((item) => <th key={item.key} scope="col">{item.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {categories.map((category, categoryIndex) => (
          <tr key={category.key}>
            <th scope="row">{category.label}</th>
            {series.map((item) => {
              const value = item.values[categoryIndex];
              return <td key={item.key}>{value === null ? "无数据" : valueFormatter(value)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChartFrame(props: ChartFrameProps) {
  const titleId = useId();
  const descriptionId = useId();
  const captionId = useId();
  const state = props.state ?? "ready";
  const size = props.size ?? "md";
  const describedBy = [props.description ? descriptionId : null, props.caption ? captionId : null].filter(Boolean).join(" ") || undefined;
  const message = "message" in props ? props.message : undefined;
  const action = "action" in props ? props.action : undefined;
  const defaultMessage = state === "loading" ? "数据加载中…" : state === "empty" ? "暂无数据" : "数据加载失败";

  return (
    <section
      aria-busy={state === "loading" || undefined}
      aria-describedby={describedBy}
      aria-labelledby={titleId}
      className={cx("rd-chart-frame", `rd-chart-frame--${size}`, `rd-chart-frame--${state}`, props.className)}
      data-state={state}
    >
      <header className="rd-chart-frame__header">
        <div className="rd-chart-frame__heading">
          <h2 id={titleId}>{props.title}</h2>
          {props.description ? <p id={descriptionId}>{props.description}</p> : null}
        </div>
        {props.actions ? <div className="rd-chart-frame__actions">{props.actions}</div> : null}
      </header>
      <div className="rd-chart-frame__body">
        {state === "ready" ? props.children : (
          <div
            aria-live={state === "error" ? "assertive" : "polite"}
            className={cx("rd-chart-frame__state", `rd-chart-frame__state--${state}`)}
            role={state === "error" ? "alert" : "status"}
          >
            <span>{message ?? defaultMessage}</span>
            {action ? <div className="rd-chart-frame__state-action">{action}</div> : null}
          </div>
        )}
      </div>
      {props.caption ? <footer className="rd-chart-frame__caption" id={captionId}>{props.caption}</footer> : null}
    </section>
  );
}

export function TrendChart({
  categories,
  series,
  summary,
  area = false,
  curve = "linear",
  showLegend,
  showPoints,
  xAxisLabel,
  yAxisLabel,
  valueFormatter = defaultValueFormatter,
  className
}: TrendChartProps) {
  if (!isValidCartesianData(categories, series, { maxCategories: 60, nonNegative: false }) || summary.trim().length === 0) {
    return <InvalidChart className={className} />;
  }

  const plot = { left: 56, right: 18, top: 18, bottom: 48 };
  const plotWidth = CARTESIAN_WIDTH - plot.left - plot.right;
  const plotHeight = CARTESIAN_HEIGHT - plot.top - plot.bottom;
  const numericValues = series.flatMap((item) => item.values.filter((value): value is number => value !== null));
  const [domainMin, domainMax] = getDomain(numericValues);
  const xForIndex = (index: number) => categories.length === 1
    ? plot.left + plotWidth / 2
    : plot.left + (index / (categories.length - 1)) * plotWidth;
  const yForValue = (value: number) => plot.top + ((domainMax - value) / (domainMax - domainMin)) * plotHeight;
  const baselineY = yForValue(0);
  const yTicks = Array.from({ length: 5 }, (_, index) => domainMin + ((domainMax - domainMin) * index) / 4);
  const labelStep = Math.max(1, Math.ceil(categories.length / 8));
  const shouldShowPoints = showPoints ?? categories.length <= 24;
  const shouldShowLegend = showLegend ?? series.length > 1;
  const shouldShowArea = area && series.length === 1;
  const legendItems = series.map((item, index) => ({ key: item.key, label: item.label, tone: toneForIndex(item.tone, index) }));

  return (
    <figure className={cx("rd-chart", "rd-chart--cartesian", "rd-trend-chart", className)} data-chart-type="trend">
      <div className="rd-chart__plot">
        <svg aria-hidden="true" className="rd-chart__svg" focusable="false" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${CARTESIAN_WIDTH} ${CARTESIAN_HEIGHT}`}>
          <g className="rd-chart__grid">
            {yTicks.map((tick) => {
              const y = yForValue(tick);
              return (
                <g key={tick}>
                  <line x1={plot.left} x2={CARTESIAN_WIDTH - plot.right} y1={y} y2={y} />
                  <text textAnchor="end" x={plot.left - 8} y={y + 4}>{valueFormatter(tick)}</text>
                </g>
              );
            })}
          </g>
          <g className="rd-chart__axis-labels">
            {categories.map((category, index) => {
              const showLabel = index === 0 || index === categories.length - 1 || index % labelStep === 0;
              return showLabel ? <text key={category.key} textAnchor="middle" x={xForIndex(index)} y={CARTESIAN_HEIGHT - 20}>{category.label}</text> : null;
            })}
            {xAxisLabel ? <text className="rd-chart__axis-title" textAnchor="end" x={CARTESIAN_WIDTH - plot.right} y={CARTESIAN_HEIGHT - 3}>{xAxisLabel}</text> : null}
            {yAxisLabel ? <text className="rd-chart__axis-title" textAnchor="middle" transform={`rotate(-90 12 ${plot.top + plotHeight / 2})`} x={12} y={plot.top + plotHeight / 2}>{yAxisLabel}</text> : null}
          </g>
          {series.map((item, seriesIndex) => {
            const tone = toneForIndex(item.tone, seriesIndex);
            const points = item.values.map((value, index) => value === null ? null : ({ index, value, x: xForIndex(index), y: yForValue(value) }));
            const segments = splitIntoSegments(points);
            return (
              <g className="rd-trend-chart__series" data-series-key={item.key} key={item.key}>
                {shouldShowArea ? segments.map((segment, segmentIndex) => {
                  const linePath = pathForPoints(segment, curve);
                  const first = segment[0];
                  const last = segment[segment.length - 1];
                  const path = `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
                  return <path className={cx("rd-trend-chart__area", toneClass(tone))} d={path} data-segment-index={segmentIndex} data-series-key={item.key} key={`area-${segmentIndex}`} />;
                }) : null}
                {segments.map((segment, segmentIndex) => (
                  <path
                    className={cx("rd-trend-chart__line", toneClass(tone), patternClass(seriesIndex))}
                    d={pathForPoints(segment, curve)}
                    data-segment-index={segmentIndex}
                    data-series-key={item.key}
                    key={`line-${segmentIndex}`}
                  />
                ))}
                {shouldShowPoints ? points.map((point) => point ? (
                  <circle
                    className={cx("rd-trend-chart__point", toneClass(tone))}
                    cx={point.x}
                    cy={point.y}
                    data-point-key={categories[point.index].key}
                    data-series-key={item.key}
                    key={categories[point.index].key}
                    r="4"
                  >
                    <title>{`${item.label}，${categories[point.index].label}：${valueFormatter(point.value)}`}</title>
                  </circle>
                ) : null) : null}
              </g>
            );
          })}
        </svg>
      </div>
      {shouldShowLegend ? <ChartLegend items={legendItems} /> : null}
      <figcaption className="rd-sr-only">{summary}</figcaption>
      <CartesianDataTable categories={categories} series={series} summary={summary} valueFormatter={valueFormatter} />
    </figure>
  );
}

export function BarChart({
  categories,
  series,
  summary,
  orientation = "vertical",
  showLegend,
  showValues = false,
  valueFormatter = defaultValueFormatter,
  className
}: BarChartProps) {
  if (!isValidCartesianData(categories, series, { maxCategories: 12, nonNegative: true }) || summary.trim().length === 0) {
    return <InvalidChart className={className} />;
  }

  const horizontal = orientation === "horizontal";
  const plot = horizontal
    ? { left: 132, right: 50, top: 18, bottom: 36 }
    : { left: 56, right: 18, top: 18, bottom: 48 };
  const plotWidth = CARTESIAN_WIDTH - plot.left - plot.right;
  const plotHeight = CARTESIAN_HEIGHT - plot.top - plot.bottom;
  const numericValues = series.flatMap((item) => item.values.filter((value): value is number => value !== null));
  const maxValue = Math.max(1, ...numericValues);
  const valueTicks = Array.from({ length: 5 }, (_, index) => (maxValue * index) / 4);
  const shouldShowLegend = showLegend ?? series.length > 1;
  const legendItems = series.map((item, index) => ({ key: item.key, label: item.label, tone: toneForIndex(item.tone, index) }));

  return (
    <figure className={cx("rd-chart", "rd-chart--cartesian", "rd-bar-chart", `rd-bar-chart--${orientation}`, className)} data-chart-type="bar" data-orientation={orientation}>
      <div className="rd-chart__plot">
        <svg aria-hidden="true" className="rd-chart__svg" focusable="false" preserveAspectRatio="xMidYMid meet" viewBox={`0 0 ${CARTESIAN_WIDTH} ${CARTESIAN_HEIGHT}`}>
          <g className="rd-chart__grid">
            {valueTicks.map((tick) => horizontal ? (
              <g key={tick}>
                <line x1={plot.left + (tick / maxValue) * plotWidth} x2={plot.left + (tick / maxValue) * plotWidth} y1={plot.top} y2={plot.top + plotHeight} />
                <text textAnchor="middle" x={plot.left + (tick / maxValue) * plotWidth} y={CARTESIAN_HEIGHT - 12}>{valueFormatter(tick)}</text>
              </g>
            ) : (
              <g key={tick}>
                <line x1={plot.left} x2={plot.left + plotWidth} y1={plot.top + plotHeight - (tick / maxValue) * plotHeight} y2={plot.top + plotHeight - (tick / maxValue) * plotHeight} />
                <text textAnchor="end" x={plot.left - 8} y={plot.top + plotHeight - (tick / maxValue) * plotHeight + 4}>{valueFormatter(tick)}</text>
              </g>
            ))}
          </g>
          {horizontal ? categories.map((category, categoryIndex) => {
            const categoryHeight = plotHeight / categories.length;
            const clusterHeight = categoryHeight * 0.72;
            const barHeight = clusterHeight / series.length;
            return (
              <g data-category-key={category.key} key={category.key}>
                <text className="rd-chart__category-label" textAnchor="end" x={plot.left - 10} y={plot.top + categoryIndex * categoryHeight + categoryHeight / 2 + 4}>{category.label}</text>
                {series.map((item, seriesIndex) => {
                  const value = item.values[categoryIndex];
                  if (value === null) return null;
                  const tone = toneForIndex(item.tone, seriesIndex);
                  const width = (value / maxValue) * plotWidth;
                  const y = plot.top + categoryIndex * categoryHeight + (categoryHeight - clusterHeight) / 2 + seriesIndex * barHeight;
                  return (
                    <g key={item.key}>
                      <rect
                        className={cx("rd-bar-chart__bar", toneClass(tone), patternClass(seriesIndex))}
                        data-category-key={category.key}
                        data-series-key={item.key}
                        height={Math.max(1, barHeight - 2)}
                        rx="2"
                        width={width}
                        x={plot.left}
                        y={y}
                      >
                        <title>{`${item.label}，${category.label}：${valueFormatter(value)}`}</title>
                      </rect>
                      {showValues ? <text className="rd-bar-chart__value" x={Math.min(plot.left + width + 6, CARTESIAN_WIDTH - plot.right + 4)} y={y + barHeight / 2 + 4}>{valueFormatter(value)}</text> : null}
                    </g>
                  );
                })}
              </g>
            );
          }) : categories.map((category, categoryIndex) => {
            const categoryWidth = plotWidth / categories.length;
            const clusterWidth = categoryWidth * 0.72;
            const barWidth = clusterWidth / series.length;
            return (
              <g data-category-key={category.key} key={category.key}>
                <text className="rd-chart__category-label" textAnchor="middle" x={plot.left + categoryIndex * categoryWidth + categoryWidth / 2} y={CARTESIAN_HEIGHT - 20}>{category.label}</text>
                {series.map((item, seriesIndex) => {
                  const value = item.values[categoryIndex];
                  if (value === null) return null;
                  const tone = toneForIndex(item.tone, seriesIndex);
                  const height = (value / maxValue) * plotHeight;
                  const x = plot.left + categoryIndex * categoryWidth + (categoryWidth - clusterWidth) / 2 + seriesIndex * barWidth;
                  const y = plot.top + plotHeight - height;
                  return (
                    <g key={item.key}>
                      <rect
                        className={cx("rd-bar-chart__bar", toneClass(tone), patternClass(seriesIndex))}
                        data-category-key={category.key}
                        data-series-key={item.key}
                        height={height}
                        rx="2"
                        width={Math.max(1, barWidth - 2)}
                        x={x}
                        y={y}
                      >
                        <title>{`${item.label}，${category.label}：${valueFormatter(value)}`}</title>
                      </rect>
                      {showValues ? <text className="rd-bar-chart__value" textAnchor="middle" x={x + barWidth / 2} y={Math.max(plot.top + 10, y - 6)}>{valueFormatter(value)}</text> : null}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      {shouldShowLegend ? <ChartLegend items={legendItems} /> : null}
      <figcaption className="rd-sr-only">{summary}</figcaption>
      <CartesianDataTable categories={categories} series={series} summary={summary} valueFormatter={valueFormatter} />
    </figure>
  );
}

export function DonutChart({
  data,
  summary,
  centerLabel,
  centerValue,
  showLegend = true,
  legendPosition = "bottom",
  valueFormatter = defaultValueFormatter,
  className
}: DonutChartProps) {
  const valid =
    data.length > 0 &&
    data.length <= 8 &&
    hasUniqueKeys(data) &&
    data.every((item) => item.label.trim().length > 0 && Number.isFinite(item.value) && item.value >= 0) &&
    data.some((item) => item.value > 0) &&
    summary.trim().length > 0;
  if (!valid) return <InvalidChart className={className} />;

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const centerX = 120;
  const centerY = 112;
  const innerRadius = 44;
  const outerRadius = 78;
  let cursor = -90;
  const legendItems = data.map((item, index) => ({ key: item.key, label: item.label, tone: toneForIndex(item.tone, index) }));

  return (
    <figure className={cx("rd-chart", "rd-donut-chart", `rd-donut-chart--legend-${legendPosition}`, className)} data-chart-type="donut">
      <div className="rd-chart__plot">
        <svg aria-hidden="true" className="rd-chart__svg" focusable="false" preserveAspectRatio="xMidYMid meet" viewBox="0 0 240 240">
          {data.map((item, index) => {
            const sweep = (item.value / total) * 360;
            const start = cursor;
            const end = cursor + sweep;
            cursor = end;
            if (item.value === 0) return null;
            const tone = toneForIndex(item.tone, index);
            return (
              <path
                className={cx("rd-donut-chart__segment", toneClass(tone), patternClass(index))}
                d={donutPath(centerX, centerY, innerRadius, outerRadius, start, end)}
                data-segment-key={item.key}
                data-tone={tone}
                key={item.key}
              >
                <title>{`${item.label}：${valueFormatter(item.value)}（${((item.value / total) * 100).toFixed(1)}%）`}</title>
              </path>
            );
          })}
          <text className="rd-donut-chart__center-value" textAnchor="middle" x={centerX} y={centerY + 2}>{centerValue ?? valueFormatter(total)}</text>
          {centerLabel ? <text className="rd-donut-chart__center-label" textAnchor="middle" x={centerX} y={centerY + 24}>{centerLabel}</text> : null}
        </svg>
      </div>
      {showLegend ? <ChartLegend items={legendItems} position={legendPosition} /> : null}
      <figcaption className="rd-sr-only">{summary}</figcaption>
      <table className="rd-sr-only rd-chart__table">
        <caption>{summary}</caption>
        <thead><tr><th scope="col">分类</th><th scope="col">数值</th><th scope="col">占比</th></tr></thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.key}>
              <th scope="row">{item.label}</th>
              <td>{valueFormatter(item.value)}</td>
              <td>{((item.value / total) * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function GaugeChart({
  label,
  value,
  min = 0,
  max = 100,
  unit,
  bands,
  summary,
  valueFormatter = defaultValueFormatter,
  className
}: GaugeChartProps) {
  const resolvedBands: readonly GaugeBand[] = bands ?? [{ max, label: "当前范围", tone: "info" }];
  const bandsValid = resolvedBands.length > 0 && resolvedBands.every((band, index) => {
    const previousMax = index === 0 ? min : resolvedBands[index - 1].max;
    return Number.isFinite(band.max) && band.max > previousMax && band.label.trim().length > 0;
  });
  const valid =
    label.trim().length > 0 &&
    summary.trim().length > 0 &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    Number.isFinite(value) &&
    max > min &&
    value >= min &&
    value <= max &&
    bandsValid &&
    Math.abs(resolvedBands[resolvedBands.length - 1].max - max) < Number.EPSILON * Math.max(1, Math.abs(max));
  if (!valid) return <InvalidChart className={className} />;

  const centerX = 120;
  const centerY = 142;
  const innerRadius = 58;
  const outerRadius = 80;
  const valueAngle = -180 + ((value - min) / (max - min)) * 180;
  const needleEnd = polarPoint(centerX, centerY, 54, valueAngle);
  let bandStart = min;
  const legendItems = resolvedBands.map((band) => ({ key: `${band.max}`, label: band.label, tone: band.tone }));

  return (
    <figure className={cx("rd-chart", "rd-gauge-chart", className)} data-chart-type="gauge">
      <div className="rd-chart__plot">
        <svg aria-hidden="true" className="rd-chart__svg" focusable="false" preserveAspectRatio="xMidYMid meet" viewBox="0 0 240 220">
          <path className="rd-gauge-chart__track" d={donutPath(centerX, centerY, innerRadius, outerRadius, -180, 0)} />
          {resolvedBands.map((band) => {
            const startAngle = -180 + ((bandStart - min) / (max - min)) * 180;
            const endAngle = -180 + ((band.max - min) / (max - min)) * 180;
            const startValue = bandStart;
            bandStart = band.max;
            return (
              <path
                className={cx("rd-gauge-chart__band", toneClass(band.tone))}
                d={donutPath(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle)}
                data-band-label={band.label}
                data-tone={band.tone}
                key={`${band.label}-${band.max}`}
              >
                <title>{`${band.label}：${valueFormatter(startValue)}–${valueFormatter(band.max)}${unit ?? ""}`}</title>
              </path>
            );
          })}
          <line className="rd-gauge-chart__needle" x1={centerX} x2={needleEnd.x} y1={centerY} y2={needleEnd.y}>
            <title>{`${label}：${valueFormatter(value)}${unit ?? ""}`}</title>
          </line>
          <circle className="rd-gauge-chart__needle-center" cx={centerX} cy={centerY} r="5" />
          <text className="rd-gauge-chart__min" textAnchor="start" x="30" y="168">{valueFormatter(min)}</text>
          <text className="rd-gauge-chart__max" textAnchor="end" x="210" y="168">{valueFormatter(max)}</text>
          <text className="rd-gauge-chart__value" textAnchor="middle" x={centerX} y="190">{valueFormatter(value)}{unit ?? ""}</text>
          <text className="rd-gauge-chart__label" textAnchor="middle" x={centerX} y="210">{label}</text>
        </svg>
      </div>
      {resolvedBands.length > 1 ? <ChartLegend items={legendItems} /> : null}
      <figcaption className="rd-sr-only">{summary}</figcaption>
      <table className="rd-sr-only rd-chart__table">
        <caption>{summary}</caption>
        <thead><tr><th scope="col">指标</th><th scope="col">当前值</th><th scope="col">最小值</th><th scope="col">最大值</th></tr></thead>
        <tbody><tr><th scope="row">{label}</th><td>{valueFormatter(value)}{unit ?? ""}</td><td>{valueFormatter(min)}{unit ?? ""}</td><td>{valueFormatter(max)}{unit ?? ""}</td></tr></tbody>
      </table>
    </figure>
  );
}
