import { useEffect, useRef, useState } from "react";
import { loadThreeRenderer } from "./renderer-registry";
import type {
  GeoFeatureCollection,
  GeoFeatureProperties,
  MapDiagnostics,
  MapScope,
  RendererStatus,
  SituationMapRenderer,
} from "./renderer-contract";

interface ThreeSituationMapProps {
  data: GeoFeatureCollection | null;
  scope: MapScope;
  direction: "forward" | "back" | "replace";
  forcedState: "ready" | "loading" | "empty" | "error";
  reducedMotion: boolean;
  onFeatureHover(feature: GeoFeatureProperties | null): void;
  onFeatureSelect(feature: GeoFeatureProperties): void;
  onDiagnostics(diagnostics: MapDiagnostics): void;
  onRendererReady(renderer: SituationMapRenderer | null): void;
}

export default function ThreeSituationMap({
  data,
  scope,
  direction,
  forcedState,
  reducedMotion,
  onFeatureHover,
  onFeatureSelect,
  onDiagnostics,
  onRendererReady,
}: ThreeSituationMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SituationMapRenderer | null>(null);
  const latestRef = useRef({ data, scope, direction });
  latestRef.current = { data, scope, direction };
  const [status, setStatus] = useState<RendererStatus>("loading");
  const [message, setMessage] = useState("正在加载 WebGL 渲染器");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    void loadThreeRenderer()
      .then(({ createSituationRenderer }) => {
        if (cancelled) return;
        const renderer = createSituationRenderer(host, {
          onHover: onFeatureHover,
          onSelect: onFeatureSelect,
          onStatus(next, detail) {
            setStatus(next);
            setMessage(detail ?? next);
          },
          onDiagnostics,
        }, reducedMotion);
        rendererRef.current = renderer;
        onRendererReady(renderer);
        observer = new ResizeObserver(([entry]) => renderer.resize(entry.contentRect.width, entry.contentRect.height));
        observer.observe(host);
        const latest = latestRef.current;
        if (latest.data) renderer.setData(latest.data, latest.scope, latest.direction);
      })
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "WebGL renderer failed to load");
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      rendererRef.current?.destroy();
      rendererRef.current = null;
      onRendererReady(null);
    };
  }, [onDiagnostics, onFeatureHover, onFeatureSelect, onRendererReady]);

  useEffect(() => {
    if (data) rendererRef.current?.setData(data, scope, direction);
  }, [data, scope, direction]);

  useEffect(() => rendererRef.current?.setReducedMotion(reducedMotion), [reducedMotion]);

  const visibleState = forcedState === "ready" ? status : forcedState;
  const stateCopy = forcedState === "error"
    ? "数据通道连接失败，可重试恢复"
    : forcedState === "empty"
      ? "当前筛选范围暂无有效事件"
      : forcedState === "loading"
        ? "正在同步区域态势数据"
        : message;

  return (
    <section className="map-stage" aria-label="三维行政区态势地图">
      <div ref={hostRef} className="map-host" data-renderer="three" />
      <div className="map-grid" aria-hidden="true" />
      <div className="map-status" data-state={visibleState} role="status" aria-live="polite">
        {visibleState !== "ready" && (
          <div className="map-status-card t-panel-slide" data-open="true">
            <span className={visibleState === "loading" ? "t-shimmer" : ""} data-text={stateCopy}>{stateCopy}</span>
          </div>
        )}
      </div>
    </section>
  );
}
