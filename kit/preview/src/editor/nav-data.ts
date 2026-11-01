// 左导航与中栏顶条共用的目录数据。

// 「基础」六个分组：颜色、文字、图标、间距、圆角与效果、布局栅格。
// icons / grid 为纯只读分组（合同锁定图标库、页面结构级栅格），不开放写回。
export type SystemId = "color" | "typography" | "icons" | "spacing" | "radius" | "grid";

export const SYSTEM_SECTIONS: Array<{ id: SystemId; label: string }> = [
  { id: "color", label: "颜色" },
  { id: "typography", label: "文字" },
  { id: "icons", label: "图标" },
  { id: "spacing", label: "间距" },
  { id: "radius", label: "圆角与效果" },
  { id: "grid", label: "布局栅格" }
];

// groups 与 matrix/MatrixView.tsx 里各组件矩阵的分组标题保持一致，仅用于顶条说明。
export const P0_COMPONENTS: Array<{ name: string; label: string; groups: string[] }> = [
  { name: "Button", label: "按钮", groups: ["变体 × 尺寸", "状态"] },
  { name: "Input", label: "输入框", groups: ["变体 × 尺寸", "状态"] },
  { name: "Select", label: "选择器", groups: ["变体 × 尺寸", "状态"] },
  { name: "Tag", label: "标签", groups: ["变体", "颜色", "状态"] },
  { name: "Table", label: "表格", groups: ["尺寸", "状态"] },
  { name: "Alert", label: "警告提示", groups: ["类型", "变体与状态"] },
  { name: "Modal", label: "对话框", groups: ["内嵌"] },
  { name: "Drawer", label: "抽屉", groups: ["内嵌"] },
  { name: "Popconfirm", label: "气泡确认", groups: ["触发"] }
];

// canvas：小豆盒真实页面（原「概览」与「页面检查」合并），默认选择模式，可切到交互模式。
export type Workspace =
  | { kind: "canvas" }
  | { kind: "system"; id: SystemId }
  | { kind: "component"; name: string };

export type StageView = "docs" | "project";

// 画布模式：选择 = 拦截点击只选中；交互 = 放行业务点击（可点开抽屉、弹窗）。
export type CanvasMode = "select" | "interact";

// 路由标题形如「设备生命周期 · 全部设备」，页签只取最后一段，完整标题放在 title。
export function shortRouteTitle(title: string): string {
  const parts = title.split(" · ");
  return parts[parts.length - 1] || title;
}
