import assert from "node:assert/strict";
import test from "node:test";
import { BeautiMapAdapter } from "../src/map/beauti-map-adapter";
import type { RendererStatus } from "../src/map/renderer-contract";

type Listener = (event: { preventDefault(): void }) => void;

class FakeCanvas {
  listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener as Listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener as Listener);
  }

  dispatch(type: string) {
    let prevented = false;
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ preventDefault: () => { prevented = true; } });
    }
    return prevented;
  }
}

class FakeHost {
  readonly canvas = new FakeCanvas();
  querySelector(selector: string) {
    return selector === "canvas" ? this.canvas : null;
  }
}

class FakeResizeObserver {
  static instance: FakeResizeObserver | null = null;
  disconnected = false;
  observed: unknown = null;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instance = this;
  }

  observe(target: Element) { this.observed = target; }
  disconnect() { this.disconnected = true; }
  unobserve() {}

  emit(width: number, height: number) {
    this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

class FakeMap {
  static instance: FakeMap | null = null;
  static options: Record<string, unknown> | undefined;
  destroyed = false;
  resizeCalls: Array<readonly [number | undefined, number | undefined]> = [];
  listeners = new Map<string, (...args: unknown[]) => void>();

  constructor(_host: HTMLElement, options?: Record<string, unknown>) {
    FakeMap.instance = this;
    FakeMap.options = options;
  }

  resize(width?: number, height?: number) { this.resizeCalls.push([width, height]); }
  on(event: string, listener: (...args: unknown[]) => void) { this.listeners.set(event, listener); }
  off(event: string, listener: (...args: unknown[]) => void) {
    if (this.listeners.get(event) === listener) this.listeners.delete(event);
  }
  emit(event: string, payload: unknown) { this.listeners.get(event)?.(payload); }
  destroy() { this.destroyed = true; }
}

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { devicePixelRatio: 3 },
});
Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: FakeResizeObserver,
});

test("caps DPR, forwards reduced motion and map events, resizes, and destroys cleanly", () => {
  const host = new FakeHost();
  const statuses: RendererStatus[] = [];
  const events: Array<readonly [string, unknown]> = [];
  const adapter = new BeautiMapAdapter(
    host as unknown as HTMLElement,
    { default: FakeMap },
    {
      maxDpr: 1.5,
      reducedMotion: true,
      callbacks: { onStatus: (status) => { statuses.push(status); } },
      onEvent: (event, payload) => events.push([event, payload]),
    },
  );

  assert.deepEqual(FakeMap.options, { pixelRatio: 1.5, reducedMotion: true });
  FakeResizeObserver.instance?.emit(640, 480);
  assert.deepEqual(FakeMap.instance?.resizeCalls, [[640, 480]]);
  FakeMap.instance?.emit("click", { id: "USA" });
  FakeMap.instance?.emit("hover", { id: "CA" });
  assert.deepEqual(events, [["click", { id: "USA" }], ["hover", { id: "CA" }]]);
  assert.equal(host.canvas.dispatch("webglcontextlost"), true);
  host.canvas.dispatch("webglcontextrestored");
  assert.deepEqual(statuses, ["ready", "context-lost", "ready"]);

  adapter.destroy();
  assert.equal(FakeResizeObserver.instance?.disconnected, true);
  assert.equal(FakeMap.instance?.destroyed, true);
  assert.equal(FakeMap.instance?.listeners.size, 0);
  assert.equal(host.canvas.listeners.get("webglcontextlost")?.size, 0);
});

test("reports constructor failures as an error state", () => {
  class BrokenMap {
    constructor() { throw new Error("load failed"); }
  }
  const statuses: Array<readonly [RendererStatus, string | undefined]> = [];
  assert.throws(() => new BeautiMapAdapter(
    new FakeHost() as unknown as HTMLElement,
    { default: BrokenMap },
    {
      maxDpr: 1,
      reducedMotion: false,
      callbacks: { onStatus: (status, message) => statuses.push([status, message]) },
    },
  ), /load failed/);
  assert.deepEqual(statuses, [["error", "load failed"]]);
});
