// 左导航（240px）：画布 / 系统分区 / 组件目录；底部是「图层」（由 LayerPanel 提供）。

import { useRef, type CSSProperties, type ReactNode } from "react";
import { Component, LayoutGrid, Palette, Ruler, Shapes, Sparkles, SquareMousePointer, SquareRoundCorner, Type } from "lucide-react";
import { LayersSplitHandle, useLayersHeight } from "./LayersSplit";
import { P0_COMPONENTS, SYSTEM_SECTIONS, type SystemId, type Workspace } from "./nav-data";

// 编辑器外壳图标统一用 lucide（ISC），与小豆盒合同锁定的 @ant-design/icons 分开。
const ICON = { "aria-hidden": true, size: 16, strokeWidth: 1.75 } as const;

const SYSTEM_ICONS: Record<SystemId, ReactNode> = {
  color: <Palette {...ICON} />,
  typography: <Type {...ICON} />,
  icons: <Shapes {...ICON} />,
  spacing: <Ruler {...ICON} />,
  radius: <Sparkles {...ICON} />,
  grid: <LayoutGrid {...ICON} />
};

export type NavProps = {
  workspace: Workspace;
  onOpenCanvas: () => void;
  onOpenSystem: (id: SystemId) => void;
  onOpenComponent: (name: string) => void;
  layers: ReactNode;
};

export function Nav(props: NavProps) {
  const { workspace } = props;
  const navRef = useRef<HTMLElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const { height: layersHeight, update: setLayersHeight } = useLayersHeight();
  // 拖过才写入固定像素高度；没拖过时沿用样式表默认的 36%。
  const navStyle = layersHeight === null ? undefined : ({ gridTemplateRows: `minmax(0, 1fr) ${layersHeight}px` } as CSSProperties);
  return (
    <nav aria-label="编辑器导航" className="ludi-nav" ref={navRef} style={navStyle}>
      <div className="ludi-nav__scroll">
        <div className="ludi-nav__group">
          <h2>画布</h2>
          <button
            className="ludi-nav__item"
            data-active={workspace.kind === "canvas"}
            onClick={props.onOpenCanvas}
            type="button"
          >
            <span className="ludi-nav__icon">
              <SquareMousePointer {...ICON} />
            </span>
            <span>画布</span>
            <small>小豆盒页面</small>
          </button>
        </div>

        <div className="ludi-nav__group">
          <h2>基础</h2>
          {SYSTEM_SECTIONS.map((section) => (
            <button
              className="ludi-nav__item"
              data-active={workspace.kind === "system" && workspace.id === section.id}
              key={section.id}
              onClick={() => props.onOpenSystem(section.id)}
              type="button"
            >
              <span className="ludi-nav__icon">{SYSTEM_ICONS[section.id]}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </div>

        <div className="ludi-nav__group">
          <h2>组件</h2>
          {P0_COMPONENTS.map((item) => (
            <button
              className="ludi-nav__item"
              data-active={workspace.kind === "component" && workspace.name === item.name}
              key={item.name}
              onClick={() => props.onOpenComponent(item.name)}
              type="button"
            >
              <span className="ludi-nav__icon">
                <Component {...ICON} />
              </span>
              <span>{item.name}</span>
              <small>{item.label}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="ludi-nav__foot" ref={footRef}>
        <LayersSplitHandle footRef={footRef} navRef={navRef} onResize={setLayersHeight} value={layersHeight} />
        {props.layers}
      </div>
    </nav>
  );
}
