// 小豆盒结构合同读取层（第 4 阶段）：按路由与列标识给出列宽、对齐、固定方向与偏移。
// 框架无关：返回普通样式对象，React 的 style、Vue 的 :style 都能直接用；不依赖任何组件库。
// 合同：kit/design-systems/tianshu/structure.tables.json（格式见同目录 structure.README.md）。

import contract from "../../../design-systems/tianshu/structure.tables.json";

export type ColumnAlign = "left" | "center" | "right";
export type ColumnFixed = "left" | "right";

type ContractColumn = {
  header: string;
  key: string;
  width?: number;
  fixed?: ColumnFixed;
  align?: ColumnAlign;
  responsive?: string;
  defaultHidden?: boolean;
};
type ContractTable = { source: string; selection?: boolean; selectionWidth?: number; columns: ContractColumn[]; note?: string };

export type CellLayout = {
  /** 列宽（px）；undefined 表示按内容撑开 */
  width?: number;
  textAlign: ColumnAlign;
  /** 固定列：left / right；套件据此给单元格加不透明底色与分隔阴影 */
  fixed?: ColumnFixed;
  /** 固定列的样式：position sticky 与偏移量 */
  style: { width?: number; minWidth?: number; textAlign: ColumnAlign; position?: "sticky"; left?: number; right?: number };
  /** 只在视口宽度不小于该值时显示 */
  minViewport?: number;
  defaultHidden: boolean;
};

const tables = contract.tables as Record<string, ContractTable>;
type ContractFilterGrid = {
  region: string;
  /** 每行等宽列数；与 template 二选一 */
  columns?: number;
  /** 固定轨道（CSS grid-template-columns 写法），如告警页的「180px 140px minmax(0, 320px)」、反馈页的「repeat(auto-fit, minmax(200px, 1fr))」 */
  template?: string;
  gap: number;
  /** 视口不超过某断点时改用的列数，如 { "xl": 3 } 表示视口 ≤ 1200 时每行 3 列（与 antd 的 @media (max-width: 1200px) 一致） */
  below?: Record<string, number>;
  /** 「更多筛选」展开区的列数；不写时与常驻行同一栅格 */
  moreColumns?: number;
};
const filterGrids = ((contract as { filters?: Record<string, ContractFilterGrid> }).filters ?? {}) as Record<string, ContractFilterGrid>;

const gridStyle = (template: string, gap: number) => ({ display: "grid", gridTemplateColumns: template, columnGap: gap });
const equalColumns = (n: number) => `repeat(${n}, minmax(0, 1fr))`;

/**
 * 筛选区栅格：列数、列间距、窄屏回落与「更多筛选」区列数都来自结构合同；筛选项按列对齐，项数少于列数时右侧留空。
 * 返回筛选项容器的样式（grid），React 的 style、Vue 的 :style 都能直接用。viewportWidth 不传时按参考视口。
 */
export function filterGrid(route: string, viewportWidth: number = contract.referenceViewport.width) {
  const grid = filterGrids[route];
  if (!grid) throw new Error(`结构合同里没有路由 ${route} 的筛选区栅格`);
  // 窄屏回落：取视口宽度不超过的、最小的那个断点对应的列数（antd 页面都写 max-width，含等号）。
  const fallback = Object.entries(grid.below ?? {})
    .filter(([bp]) => viewportWidth <= breakpoints[bp])
    .sort((a, b) => breakpoints[a[0]] - breakpoints[b[0]])[0];
  const columns = fallback ? fallback[1] : grid.columns;
  const template = columns != null ? equalColumns(columns) : grid.template!;
  const style = gridStyle(template, grid.gap);
  return {
    columns,
    gap: grid.gap,
    style,
    moreStyle: grid.moreColumns != null ? gridStyle(equalColumns(grid.moreColumns), grid.gap) : style
  };
}
const breakpoints = contract.breakpoints as Record<string, number>;

export function tableLayout(route: string) {
  const table = tables[route];
  if (!table) throw new Error(`结构合同里没有路由 ${route} 的表格`);
  const cols = table.columns;
  const hasLeftFixed = cols.some((c) => c.fixed === "left");
  const selectionWidth = table.selection ? table.selectionWidth ?? 0 : 0;

  // 左固定：多选框列（有左固定列时它也固定）+ 前面所有左固定列的宽度；右固定：后面所有右固定列的宽度。
  const offsetOf = (index: number, side: ColumnFixed) => {
    const others = side === "left" ? cols.slice(0, index) : cols.slice(index + 1);
    const sum = others.filter((c) => c.fixed === side).reduce((n, c) => n + (c.width ?? 0), 0);
    return side === "left" ? sum + selectionWidth : sum;
  };

  const column = (key: string): CellLayout => {
    const index = cols.findIndex((c) => c.key === key);
    if (index < 0) throw new Error(`结构合同 ${route} 里没有列 ${key}`);
    const c = cols[index];
    const textAlign = c.align ?? "left";
    const style: CellLayout["style"] = { textAlign };
    if (c.width != null) { style.width = c.width; style.minWidth = c.width; }
    if (c.fixed) {
      style.position = "sticky";
      style[c.fixed] = offsetOf(index, c.fixed);
    }
    return {
      width: c.width,
      textAlign,
      fixed: c.fixed,
      style,
      minViewport: c.responsive ? breakpoints[c.responsive] : undefined,
      defaultHidden: Boolean(c.defaultHidden)
    };
  };

  const selection = table.selection
    ? {
        width: selectionWidth,
        fixed: hasLeftFixed ? ("left" as const) : undefined,
        style: hasLeftFixed
          ? { width: selectionWidth, minWidth: selectionWidth, position: "sticky" as const, left: 0 }
          : { width: selectionWidth, minWidth: selectionWidth }
      }
    : undefined;

  return {
    route,
    keys: cols.map((c) => c.key),
    column,
    selection,
    /** 表格总宽：多选框列 + 给定可见列的合同宽度之和（没写宽度的列按 0 计，由内容撑开）。默认取全部列。 */
    totalWidth: (visibleKeys: string[] = cols.map((c) => c.key)) =>
      selectionWidth + visibleKeys.reduce((n, key) => n + (column(key).width ?? 0), 0),
    /** 该列在给定视口宽度下是否显示（响应式断点） */
    visibleAt: (key: string, viewportWidth: number) => {
      const min = column(key).minViewport;
      return min == null || viewportWidth >= min;
    }
  };
}
