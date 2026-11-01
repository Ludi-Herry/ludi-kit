import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadScope, prefetchScope } from "./map/data-adapter";
import type {
  GeoFeatureCollection,
  GeoFeatureProperties,
  MapDiagnostics,
  MapScope,
  SituationMapRenderer,
} from "./map/renderer-contract";

const ThreeSituationMap = lazy(() => import("./map/ThreeSituationMap"));

type DemoState = "ready" | "loading" | "empty" | "error";

const eventRows = [
  { level: "高", title: "身份凭据异常访问", region: "Virginia", time: "刚刚" },
  { level: "中", title: "边缘节点流量突增", region: "California", time: "18 秒前" },
  { level: "中", title: "异常横向连接已阻断", region: "Texas", time: "42 秒前" },
  { level: "低", title: "策略基线自动复核", region: "Illinois", time: "1 分钟前" },
  { level: "低", title: "探针状态恢复正常", region: "New York", time: "2 分钟前" },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function AnimatedNumber({ value, unit = "" }: { value: number | string; unit?: string }) {
  const characters = `${value}`.split("");
  return (
    <span className="t-digit-group is-animating" key={`${value}`}>
      {characters.map((character, index) => (
        <span
          className="t-digit"
          data-stagger={index >= characters.length - 2 ? String(index - characters.length + 3) : undefined}
          key={`${character}-${index}`}
        >
          {character}
        </span>
      ))}
      {unit && <span className="metric-unit">{unit}</span>}
    </span>
  );
}

function Sparkline({ values, tone = "cyan" }: { values: number[]; tone?: "cyan" | "amber" }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 30 - ((value - min) / Math.max(1, max - min)) * 24;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tone === "amber" ? "#ffc66b" : "#54e6ff"} stopOpacity="0.34" />
          <stop offset="1" stopColor={tone === "amber" ? "#ffc66b" : "#54e6ff"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,34 ${points} 100,34`} fill={`url(#spark-${tone})`} />
      <polyline points={points} fill="none" stroke={tone === "amber" ? "#ffc66b" : "#54e6ff"} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Panel({ title, kicker, children, className = "" }: React.PropsWithChildren<{ title: string; kicker: string; className?: string }>) {
  return (
    <section className={`screen-panel t-panel-slide ${className}`} data-open="true">
      <header className="panel-heading">
        <div><span>{kicker}</span><h2>{title}</h2></div>
        <i aria-hidden="true" />
      </header>
      {children}
    </section>
  );
}

export function App() {
  const reducedMotion = useReducedMotion();
  const [mapEnabled, setMapEnabled] = useState(false);
  const [scope, setScope] = useState<MapScope>("country");
  const [direction, setDirection] = useState<"forward" | "back" | "replace">("replace");
  const [data, setData] = useState<GeoFeatureCollection | null>(null);
  const [demoState, setDemoState] = useState<DemoState>("loading");
  const [hovered, setHovered] = useState<GeoFeatureProperties | null>(null);
  const [selected, setSelected] = useState("United States mainland");
  const [diagnostics, setDiagnostics] = useState<MapDiagnostics | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [pulse, setPulse] = useState(0);
  const rendererRef = useRef<SituationMapRenderer | null>(null);
  const scopeRef = useRef<MapScope>("country");
  const navigationId = useRef(0);
  const navigationController = useRef<AbortController | null>(null);
  scopeRef.current = scope;

  useEffect(() => {
    const enable = () => setMapEnabled(true);
    const idleId = window.setTimeout(enable, 60);
    return () => window.clearTimeout(idleId);
  }, []);

  useEffect(() => {
    const clockId = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(clockId);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const pulseId = window.setInterval(() => setPulse((value) => value + 1), 1_600);
    return () => window.clearInterval(pulseId);
  }, [reducedMotion]);

  const navigate = useCallback(async (target: MapScope, nextDirection: "forward" | "back" | "replace") => {
    const id = ++navigationId.current;
    navigationController.current?.abort();
    const controller = new AbortController();
    navigationController.current = controller;
    setDemoState("loading");
    try {
      const nextData = await loadScope(target, controller.signal);
      if (id !== navigationId.current) return;
      setScope(target);
      setDirection(nextDirection);
      setData(nextData);
      setSelected(target === "country" ? "United States mainland" : "State operations layer");
      setDemoState("ready");
      if (target === "country") prefetchScope("states");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (id === navigationId.current) setDemoState("error");
    }
  }, []);

  useEffect(() => {
    void navigate("country", "replace");
    return () => navigationController.current?.abort();
  }, [navigate]);

  const drillDown = useCallback(() => {
    if (scopeRef.current === "country") void navigate("states", "forward");
  }, [navigate]);

  const back = useCallback(() => {
    if (scopeRef.current === "states") void navigate("country", "back");
  }, [navigate]);

  const handleFeatureSelect = useCallback((feature: GeoFeatureProperties) => {
    setSelected(feature.name);
    if (feature.level === "country") drillDown();
  }, [drillDown]);

  const handleRendererReady = useCallback((renderer: SituationMapRenderer | null) => {
    rendererRef.current = renderer;
  }, []);

  const simulateState = useCallback((state: DemoState) => {
    setDemoState(state);
    if (state === "ready" && !data) void navigate(scope, "replace");
  }, [data, navigate, scope]);

  useEffect(() => {
    window.__SITUATION_SCREEN_API__ = {
      setDemoState: simulateState,
      drillDown,
      back,
      simulateContextLoss: () => rendererRef.current?.simulateContextLoss() ?? false,
    };
    return () => { delete window.__SITUATION_SCREEN_API__; };
  }, [back, drillDown, simulateState]);

  const stats = useMemo(() => ({
    assets: 12846 + (pulse % 7) * 9,
    signals: 792 + (pulse % 5) * 7,
    blocked: 96.7 + (pulse % 3) * 0.1,
    risk: 42 + (pulse % 4),
  }), [pulse]);
  const mapData = useMemo(
    () => demoState === "empty" && data ? { ...data, features: [] } : data,
    [data, demoState],
  );

  const stateLabel = scope === "country" ? "国家级总览" : "州级下钻";
  const statusTone = diagnostics?.quality === "degraded" ? "degraded" : "healthy";

  return (
    <main
      className="situation-screen"
      data-motion={reducedMotion ? "reduced" : "full"}
      data-scope={scope}
      data-demo-state={demoState}
    >
      <output
        id="renderer-diagnostics"
        data-json={diagnostics ? JSON.stringify(diagnostics) : ""}
        hidden
        aria-hidden="true"
      />
      <header className="screen-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><p>CYBER DEFENSE / LIVE</p><h1>国家网络安全态势中心</h1></div>
        </div>
        <div className="header-center" aria-hidden="true"><span />实时联防监控<span /></div>
        <div className="header-meta">
          <span className="live-pill"><i />系统在线</span>
          <time dateTime={clock.toISOString()}>{clock.toLocaleString("zh-CN", { hour12: false })}</time>
        </div>
      </header>

      <div className="screen-grid">
        <aside className="side-column side-left" aria-label="关键安全指标">
          <Panel title="核心资产态势" kicker="ASSET POSTURE">
            <div className="hero-metric">
              <div><AnimatedNumber value={stats.assets.toLocaleString("en-US")} /><span>受监测核心资产</span></div>
              <div className="radial-gauge" style={{ "--gauge": `${stats.blocked}%` } as React.CSSProperties}><b>{stats.blocked.toFixed(1)}%</b><small>防护覆盖</small></div>
            </div>
            <div className="mini-metrics">
              <div><span>在线探针</span><b>1,268</b><em>+2.4%</em></div>
              <div><span>隔离资产</span><b>36</b><em className="amber">需关注</em></div>
            </div>
          </Panel>

          <Panel title="攻击趋势" kicker="THREAT TREND" className="panel-detail">
            <div className="trend-summary"><b><AnimatedNumber value={stats.signals} /></b><span>今日高置信信号</span><em>+12.8%</em></div>
            <Sparkline values={[22, 28, 25, 39, 34, 48, 42, 59, 53, 67, 62, 78 + pulse % 8]} />
            <div className="axis-labels"><span>00:00</span><span>12:00</span><span>NOW</span></div>
          </Panel>

          <Panel title="风险构成" kicker="RISK PROFILE" className="panel-secondary">
            <div className="risk-bars">
              {[['身份风险', 78, 'cyan'], ['暴露面', 62, 'cyan'], ['供应链', 44, 'amber'], ['配置漂移', 31, 'cyan']].map(([label, value, tone]) => (
                <div key={String(label)}><span>{label}</span><i><b style={{ width: `${value}%` }} data-tone={tone} /></i><em>{value}</em></div>
              ))}
            </div>
          </Panel>
        </aside>

        <section className="center-stage" aria-label="实时地理态势">
          <div className="map-toolbar">
            <div className="scope-path">
              <button type="button" onClick={back} disabled={scope === "country"} aria-label="返回国家级总览">←</button>
              <span>美国本土</span><i>/</i><b>{stateLabel}</b>
            </div>
            <div className="renderer-health" data-tone={statusTone}>
              <i /> THREE.JS · {diagnostics?.contextType.toUpperCase() ?? "LOADING"} · DPR {diagnostics?.dpr.toFixed(2) ?? "—"}
            </div>
          </div>

          <div className="map-frame">
            {mapEnabled ? (
              <Suspense fallback={<div className="map-lazy-fallback"><span className="t-shimmer" data-text="正在调度 WebGL 地图">正在调度 WebGL 地图</span></div>}>
                <ThreeSituationMap
                  data={mapData}
                  scope={scope}
                  direction={direction}
                  forcedState={demoState}
                  reducedMotion={reducedMotion}
                  onFeatureHover={setHovered}
                  onFeatureSelect={handleFeatureSelect}
                  onDiagnostics={setDiagnostics}
                  onRendererReady={handleRendererReady}
                />
              </Suspense>
            ) : <div className="map-lazy-fallback"><span className="t-shimmer" data-text="正在准备态势地图">正在准备态势地图</span></div>}

            <div className="map-caption">
              <span>当前焦点</span><b>{hovered?.name ?? selected}</b><em>{hovered ? `${hovered.code} · 点击${scope === "country" ? "进入州级" : "选择区域"}` : "移动指针查看行政区"}</em>
            </div>
            <div className="map-legend" aria-label="地图图例">
              <span><i className="legend-cyan" />实时节点</span><span><i className="legend-amber" />重点风险</span><span><i className="legend-line" />关联路径</span>
            </div>
          </div>

          <div className="state-lab" aria-label="状态验收控制">
            <span>状态演练</span>
            {(["loading", "empty", "error", "ready"] as DemoState[]).map((state) => (
              <button key={state} type="button" data-active={demoState === state} onClick={() => simulateState(state)}>{state}</button>
            ))}
            <button type="button" onClick={() => rendererRef.current?.simulateContextLoss()}>context</button>
          </div>
        </section>

        <aside className="side-column side-right" aria-label="实时事件与处置">
          <Panel title="实时安全事件" kicker="LIVE INCIDENTS">
            <ol className="event-list">
              {eventRows.map((event, index) => (
                <li key={event.title}>
                  <span className={`severity severity-${event.level}`}>{event.level}</span>
                  <div><b>{event.title}</b><span>{event.region} · {event.time}</span></div>
                  <em>{String(index + 1).padStart(2, "0")}</em>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="自动处置效率" kicker="RESPONSE AUTOMATION" className="panel-detail">
            <div className="response-score"><AnimatedNumber value={stats.blocked.toFixed(1)} unit="%" /><span>高危事件自动闭环</span></div>
            <Sparkline values={[42, 49, 46, 54, 58, 56, 67, 65, 73, 72, 81, 86 + pulse % 6]} tone="amber" />
            <div className="response-grid"><div><b>38s</b><span>平均响应</span></div><div><b>12m</b><span>平均恢复</span></div><div><b>0</b><span>超时任务</span></div></div>
          </Panel>

          <Panel title="运行质量" kicker="RENDER QUALITY" className="panel-secondary diagnostics-panel">
            <dl>
              <div><dt>MEDIAN FPS</dt><dd>{diagnostics?.medianFps.toFixed(1) ?? "—"}</dd></div>
              <div><dt>P95 FRAME</dt><dd>{diagnostics?.p95FrameMs.toFixed(1) ?? "—"}<small>ms</small></dd></div>
              <div><dt>QUALITY</dt><dd>{diagnostics?.quality ?? "loading"}</dd></div>
              <div><dt>MOTION</dt><dd>{reducedMotion ? "reduced" : "full"}</dd></div>
            </dl>
          </Panel>
        </aside>
      </div>

      <footer className="screen-footer">
        <div><span>综合风险指数</span><b className="amber"><AnimatedNumber value={stats.risk} /></b><em>中低风险</em></div>
        <div><span>恶意连接阻断</span><b><AnimatedNumber value="18,492" /></b><em>过去 24 小时</em></div>
        <div><span>检测规则覆盖</span><b><AnimatedNumber value="8,306" /></b><em>12 个数据域</em></div>
        <div><span>威胁情报命中</span><b><AnimatedNumber value={stats.signals} /></b><em>今日累计</em></div>
        <div><span>全域数据延迟</span><b><AnimatedNumber value="1.8" unit="s" /></b><em>实时同步</em></div>
      </footer>
    </main>
  );
}
