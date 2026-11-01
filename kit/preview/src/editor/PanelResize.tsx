// 左右栏宽度拖动：分隔线在栏边缘，拖动、方向键调整，双击恢复默认。
// 宽度存 localStorage（读写都可能抛错，失败就用默认值），只作用于本机这个浏览器。

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type PanelSide = "left" | "right";

type Limits = { min: number; max: number; fallback: number };

export const PANEL_LIMITS: Record<PanelSide, Limits> = {
  left: { min: 200, max: 360, fallback: 240 },
  right: { min: 260, max: 480, fallback: 280 }
};

// 中栏至少留出的宽度，两侧再宽也不能把画布挤没。
const CENTER_MIN = 480;
const KEY_STEP = 16;
const storageKey = (side: PanelSide) => `ludi-editor:panel-width:${side}`;

function readStored(side: PanelSide): number | null {
  try {
    const raw = window.localStorage.getItem(storageKey(side));
    if (raw === null) return null;
    const value = Number(raw);
    const { min, max } = PANEL_LIMITS[side];
    return Number.isFinite(value) && value >= min && value <= max ? value : null;
  } catch {
    return null;
  }
}

function writeStored(side: PanelSide, value: number | null) {
  try {
    if (value === null) window.localStorage.removeItem(storageKey(side));
    else window.localStorage.setItem(storageKey(side), String(Math.round(value)));
  } catch {
    // 浏览器禁止站点存储时只在本次会话生效。
  }
}

// 返回 null 表示用样式表的默认宽度（含窄屏断点的默认值）。
export function usePanelWidths() {
  const [widths, setWidths] = useState<Record<PanelSide, number | null>>(() => ({ left: readStored("left"), right: readStored("right") }));
  const update = useCallback((side: PanelSide, value: number | null) => {
    setWidths((current) => ({ ...current, [side]: value }));
    writeStored(side, value);
  }, []);
  return { widths, update };
}

function clamp(side: PanelSide, value: number, other: number): number {
  const { min, max } = PANEL_LIMITS[side];
  const room = window.innerWidth - other - CENTER_MIN;
  return Math.round(Math.min(Math.max(value, min), Math.max(min, Math.min(max, room))));
}

export function ResizeHandle(props: {
  side: PanelSide;
  // 已保存的宽度；null 表示用样式表默认值。变化后按实际渲染宽度刷新 aria-valuenow。
  value: number | null;
  // 当前实际渲染宽度（拖动起点）与另一侧宽度（用于给中栏留位）。
  measure: () => { self: number; other: number };
  onResize: (value: number | null) => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const { side, value, measure, onResize, onDragChange } = props;
  const drag = useRef<{ startX: number; startWidth: number; other: number } | null>(null);
  const [now, setNow] = useState<number>(() => PANEL_LIMITS[side].fallback);

  const handle = useRef<HTMLDivElement>(null);
  // 读手柄所在栏的宽度：首次挂载时外层传入的面板 ref 还没就位，measure() 会得到 0。
  useLayoutEffect(() => {
    setNow(handle.current?.parentElement?.offsetWidth ?? PANEL_LIMITS[side].fallback);
  }, [value, side]);

  const apply = (target: number, other: number) => onResize(clamp(side, target, other));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const { self, other } = measure();
    drag.current = { startX: event.clientX, startWidth: self, other };
    event.currentTarget.setPointerCapture(event.pointerId);
    onDragChange(true);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const delta = event.clientX - state.startX;
    apply(side === "left" ? state.startWidth + delta : state.startWidth - delta, state.other);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onDragChange(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const { self, other } = measure();
    const grow = side === "left" ? event.key === "ArrowRight" : event.key === "ArrowLeft";
    apply(self + (grow ? KEY_STEP : -KEY_STEP), other);
  };

  const label = side === "left" ? "调整左栏宽度" : "调整右栏宽度";
  const { min, max } = PANEL_LIMITS[side];
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={now}
      className={`ludi-resize ludi-resize--${side}`}
      onDoubleClick={() => onResize(null)}
      onKeyDown={onKeyDown}
      onLostPointerCapture={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      ref={handle}
      role="separator"
      tabIndex={0}
      title={`${label}：拖动或用方向键，双击恢复默认`}
    />
  );
}
