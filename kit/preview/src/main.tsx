import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";

// 入口路由拆分：/editor 走独立编辑器外壳；既有预览入口（Ludi Design Lab 与各项目页）
// 延后加载，避免其静态引入的小豆盒样式与 antd reset 污染编辑器外壳（--ludi-* / prefixCls=ludi）。
const isEditorRoute =
  window.location.pathname === "/editor" || window.location.pathname.startsWith("/editor/");

const Root = isEditorRoute
  ? lazy(() => import("./editor/EditorApp"))
  : lazy(() => import("./PreviewApp").then((module) => ({ default: module.PreviewApp })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>
);
