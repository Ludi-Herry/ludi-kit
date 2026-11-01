// 表头排序三态（第 4 阶段 4.5 规则统一）：各页控制器共用，对齐 antd Table 原生 sorter 的点击循环。
// 点非当前列 → 升序；当前列升序再点 → 降序；降序再点 → 清除（null，无排序）。
// 带 defaultSortOrder 的列只是初始状态不同：初始降序时第一次点击就清除，再点从升序开始。
// 「无排序」统一用 null 表示；无排序时的行顺序由各控制器说明（多数是传入顺序，见各自注释）。

export type SortDirection = "asc" | "desc";

/** 下一个排序状态：新列 → 升序，升序 → 降序，降序 → null。 */
export function nextSortState<S extends { key: string; dir: SortDirection }>(current: S | null, key: S["key"]): S | null {
  if (!current || current.key !== key) return { key, dir: "asc" } as S;
  if (current.dir === "asc") return { key, dir: "desc" } as S;
  return null;
}

/** 单列表（只有一个可排序列）的方向循环：null → 升序 → 降序 → null。 */
export function nextSortDirection(current: SortDirection | null): SortDirection | null {
  if (current === null) return "asc";
  return current === "asc" ? "desc" : null;
}
