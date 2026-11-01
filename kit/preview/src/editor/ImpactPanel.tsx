import { useEffect, useMemo, useState } from "react";

export type ImpactLocation = { file: string; line: number; column: number; component: string };

export type ImpactPage = {
  id: string;
  title: string;
  path: string;
  locations: ImpactLocation[];
};

export type ImpactCatalog = {
  pages: ImpactPage[];
  locations: ImpactLocation[];
  scope: "theme" | "component" | "instance";
  files: Array<{ file: string; sha256: string }>;
};

export type ImpactPanelProps = {
  catalog: ImpactCatalog | null;
  pending: boolean;
  error: string | null;
  onPickRoute: (page: ImpactPage) => void;
  viewportWidth: number;
  instanceKey?: string | null;
};

type RouteProbe =
  | { status: "waiting" | "reading" }
  | { status: "ready"; counts: Record<string, number> }
  | { status: "unknown" };

type ProbeMap = Record<string, RouteProbe>;

const locationKey = ({ file, line, column, component }: ImpactLocation) => `${file}\u0000${line}\u0000${column}\u0000${component}`;
const locationText = ({ file, line, column }: ImpactLocation) => `${file}:${line}:${column}`;

function waitForStableDocument(frame: HTMLIFrameElement, url: string, timeoutMs: number, signal: AbortSignal): Promise<Document> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let observer: MutationObserver | undefined;
    let timeout: number | undefined;
    let quietTimer: number | undefined;
    let lastMutation = performance.now();

    const clean = () => {
      frame.removeEventListener("load", loaded);
      frame.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
      observer?.disconnect();
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (quietTimer !== undefined) window.clearTimeout(quietTimer);
    };
    const finish = (result: Document | Error) => {
      if (finished) return;
      finished = true;
      clean();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const failed = () => finish(new Error("页面未能加载"));
    const aborted = () => finish(new Error("检测已取消"));
    const checkQuiet = (doc: Document) => {
      if (finished) return;
      if (quietTimer !== undefined) window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(() => {
        if (!doc.querySelector("#root")?.firstElementChild) {
          lastMutation = performance.now();
          checkQuiet(doc);
          return;
        }
        doc.defaultView?.requestAnimationFrame(() => doc.defaultView?.requestAnimationFrame(() => {
          if (finished) return;
          if (performance.now() - lastMutation < 350) checkQuiet(doc);
          else finish(doc);
        }));
      }, 350);
    };
    const loaded = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc || doc.location.origin !== window.location.origin) {
          finish(new Error("页面来源无法确认"));
          return;
        }
        const root = doc.documentElement;
        if (!root) {
          finish(new Error("页面内容不可读取"));
          return;
        }
        observer = new MutationObserver(() => {
          lastMutation = performance.now();
          checkQuiet(doc);
        });
        observer.observe(root, { attributes: true, childList: true, characterData: true, subtree: true });
        checkQuiet(doc);
      } catch {
        finish(new Error("页面内容不可读取"));
      }
    };

    if (new URL(url, window.location.href).origin !== window.location.origin) {
      finish(new Error("页面来源无法确认"));
      return;
    }
    timeout = window.setTimeout(() => finish(new Error("页面未能在时限内稳定")), timeoutMs);
    frame.addEventListener("load", loaded, { once: true });
    frame.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    frame.src = url;
  });
}

function visible(element: Element, doc: Document): boolean {
  const view = doc.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  return [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
}

function countLocation(doc: Document, location: ImpactLocation, instanceKey: string | null = null): number {
  const expected = locationText(location);
  let count = 0;
  for (const element of doc.querySelectorAll("[data-ludi-loc], [data-ludi-owner-loc]")) {
    const direct = element.getAttribute("data-ludi-loc") === expected && element.getAttribute("data-ludi-comp") === location.component;
    const owner = element.getAttribute("data-ludi-owner-loc") === expected && element.getAttribute("data-ludi-owner-comp") === location.component;
    if ((direct || owner) && (instanceKey===null || element.getAttribute('data-ludi-key')===instanceKey) && visible(element, doc)) count += 1;
  }
  return count;
}

function probeUrl(page: ImpactPage): string {
  const url = new URL(page.path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error("登记页面不是同源地址");
  url.searchParams.set("editor", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function ImpactPanel({ catalog, pending, error, onPickRoute, viewportWidth, instanceKey = null }: ImpactPanelProps) {
  const [probes, setProbes] = useState<ProbeMap>({});
  const catalogKey = useMemo(() => JSON.stringify(catalog), [catalog]);
  const stableCatalog = useMemo(() => catalog, [catalogKey]);
  const probeKey = `${catalogKey}|${viewportWidth}|${instanceKey}`;

  useEffect(() => {
    if (pending || error || !stableCatalog || stableCatalog.pages.length === 0) {
      setProbes({});
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    let activeFrame: HTMLIFrameElement | null = null;
    const startedAt = Date.now();
    const deadline = startedAt + 150_000;
    const initial: ProbeMap = {};
    for (const page of stableCatalog.pages) initial[page.id] = { status: "waiting" };
    setProbes(initial);

    void (async () => {
      for (const page of stableCatalog.pages) {
        if (cancelled || controller.signal.aborted) return;
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        setProbes(previous => ({ ...previous, [page.id]: { status: "reading" } }));
        const frame = document.createElement("iframe");
        activeFrame = frame;
        frame.className = "ludi-impact-probe";
        frame.title = `影响面只读预览：${page.title}`;
        frame.setAttribute("aria-hidden", "true");
        frame.tabIndex = -1;
        frame.style.width = `${viewportWidth}px`;
        document.body.append(frame);
        try {
          const url = probeUrl(page);
          const doc = await waitForStableDocument(frame, url, Math.min(10_000, remaining), controller.signal);
          if (cancelled || controller.signal.aborted) return;
          const counts: Record<string, number> = {};
          for (const location of page.locations) counts[locationKey(location)] = countLocation(doc, location,stableCatalog.scope==='instance'?instanceKey:null);
          setProbes(previous => ({ ...previous, [page.id]: { status: "ready", counts } }));
        } catch {
          if (cancelled || controller.signal.aborted) return;
          setProbes(previous => ({ ...previous, [page.id]: { status: "unknown" } }));
        } finally {
          frame.remove();
          if (activeFrame === frame) activeFrame = null;
        }
      }
      if (!cancelled && Date.now() >= deadline) {
        setProbes(previous => {
          const next = { ...previous };
          for (const page of stableCatalog.pages) if (next[page.id]?.status === "waiting") next[page.id] = { status: "unknown" };
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      activeFrame?.remove();
      activeFrame = null;
    };
  }, [error, pending, probeKey, stableCatalog, viewportWidth]);

  const scopeLabel = !catalog ? "待计算" : catalog.scope === "theme" ? "全部登记页面" : catalog.scope === "component" ? "该组件的使用页面" : "所选源码位置";

  return (
    <section className="ludi-impact" aria-label="影响面">
      <header className="ludi-impact__header">
        <h2>影响面</h2>
        <p>范围：{scopeLabel}</p>
        <p>计数按默认页面状态读取；未打开的浮层和未挂载内容不会计入。</p>
        {catalog?.scope==='instance'&&instanceKey?<p>本次只计稳定标识 {instanceKey} 对应的实例。</p>:null}
      </header>

      {pending ? <p className="ludi-impact__message" role="status">正在读取影响面…</p> : null}
      {!pending && error ? <p className="ludi-impact__message ludi-impact__message--error" role="alert">影响面暂不可用：{error}</p> : null}
      {!pending && !error && !catalog ? <p className="ludi-impact__message" role="status">选择修改范围后查看受影响页面。</p> : null}
      {!pending && !error && stableCatalog?.pages.map(page => {
        const probe = probes[page.id] ?? { status: "waiting" as const };
        const routeLabel = probe.status === "ready" ? "当前页面状态已读取" : probe.status === "unknown" ? "当前页面状态未知" : probe.status === "reading" ? "正在读取当前页面" : "等待读取当前页面";
        return (
          <details className="ludi-impact__page" key={page.id}>
            <summary>
              <span className="ludi-impact__page-title">{page.title}</span>
              <span className="ludi-impact__page-count">{page.locations.length} 个源码位置<br/>{probe.status==="ready"?`${Object.values(probe.counts).reduce((sum,n)=>sum+n,0)} 个已渲染实例`:routeLabel}</span>
            </summary>
            <div className="ludi-impact__page-content">
              <button
                aria-label={`打开页面：${page.title}`}
                className="ludi-impact__route"
                onClick={() => onPickRoute(page)}
                type="button"
              >
                {page.path}
              </button>
              <p className="ludi-impact__probe-status" role="status">{routeLabel}</p>
              {page.locations.length === 0 ? <p className="ludi-impact__message">本页没有可定位的源码位置。</p> : null}
              <ul className="ludi-impact__locations">
                {page.locations.map(location => {
                  const count = probe.status === "ready" ? probe.counts[locationKey(location)] : undefined;
                  let countLabel: string;
                  if (probe.status === "unknown") countLabel = "计数未知";
                  else if (probe.status !== "ready") countLabel = "等待读取";
                  else if (count === 0) countLabel = "当前状态未渲染";
                  else countLabel = `当前状态已渲染 ${count ?? 0} 个实例`;
                  return (
                    <li className="ludi-impact__location" key={locationKey(location)}>
                      <span className="ludi-impact__component">{location.component}</span>
                      <code>{locationText(location)}</code>
                      <span className="ludi-impact__count">{countLabel}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        );
      })}
    </section>
  );
}
