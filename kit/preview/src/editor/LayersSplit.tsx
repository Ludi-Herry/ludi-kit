// 左栏导航与「图层」之间的上下分隔：拖动、方向键调整，双击恢复默认（约占左栏 36%）。
// 高度存 localStorage（读写都可能抛错，失败就用默认值），只作用于本机这个浏览器。

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

const STORAGE_KEY = "ludi-editor:layers-height";
// 图层区至少能看到几行树；上方导航至少留出分组标题加几项入口。
const LAYERS_MIN = 120;
const NAV_MIN = 160;
const KEY_STEP = 24;

function readStored(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= LAYERS_MIN ? value : null;
  } catch {
    return null;
  }
}

function writeStored(value: number | null) {
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(Math.round(value)));
  } catch {
    // 浏览器禁止站点存储时只在本次会话生效。
  }
}

export function useLayersHeight() {
  const [height, setHeight] = useState<number | null>(readStored);
  const update = useCallback((value: number | null) => {
    setHeight(value);
    writeStored(value);
  }, []);
  return { height, update };
}

export function LayersSplitHandle(props: {
  // 左栏整体与图层区，用来读取当前高度和可用范围。
  navRef: RefObject<HTMLElement | null>;
  footRef: RefObject<HTMLElement | null>;
  value: number | null;
  onResize: (value: number | null) => void;
}) {
  const { navRef, footRef, value, onResize } = props;
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  const [now, setNow] = useState(0);
  const [limits, setLimits] = useState({ min: LAYERS_MIN, max: LAYERS_MIN });

  const measure = useCallback(() => {
    const total = navRef.current?.clientHeight ?? 0;
    return { self: footRef.current?.offsetHeight ?? 0, max: Math.max(LAYERS_MIN, total - NAV_MIN) };
  }, [navRef, footRef]);

  useLayoutEffect(() => {
    const { self, max } = measure();
    setNow(self);
    setLimits({ min: LAYERS_MIN, max });
  }, [value, measure]);

  const apply = (target: number) => {
    const { max } = measure();
    onResize(Math.round(Math.min(Math.max(target, LAYERS_MIN), max)));
  };

  const setDragging = (on: boolean) => document.documentElement.classList.toggle("ludi-dragging-rows", on);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { startY: event.clientY, startHeight: measure().self };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    // 往上拖分隔线，图层区变高。
    apply(state.startHeight - (event.clientY - state.startY));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    apply(measure().self + (event.key === "ArrowUp" ? KEY_STEP : -KEY_STEP));
  };

  return (
    <div
      aria-label="调整图层区高度"
      aria-orientation="horizontal"
      aria-valuemax={limits.max}
      aria-valuemin={limits.min}
      aria-valuenow={now}
      className="ludi-rows-resize"
      onDoubleClick={() => onResize(null)}
      onKeyDown={onKeyDown}
      onLostPointerCapture={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      role="separator"
      tabIndex={0}
      title="调整图层区高度：上下拖动或用方向键，双击恢复默认"
    />
  );
}
