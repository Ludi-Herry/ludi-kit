import type { RendererCallbacks } from "./renderer-contract";

export interface BeautiMapConstructor {
  new (container: HTMLElement, options?: Record<string, unknown>): BeautiMapInstance;
}

export interface BeautiMapInstance {
  destroy?: () => void;
  resize?: (width?: number, height?: number) => void;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export type BeautiModuleShape =
  | { default?: BeautiMapConstructor; Map3D?: BeautiMapConstructor }
  | BeautiMapConstructor
  | null
  | undefined;

export function resolveBeautiMapConstructor(moduleShape: BeautiModuleShape): BeautiMapConstructor {
  if (typeof moduleShape === "function") return moduleShape;
  const candidate = moduleShape?.default ?? moduleShape?.Map3D;
  if (typeof candidate !== "function") {
    throw new TypeError("BeautiMap module exposes neither a usable default export nor a named Map3D export.");
  }
  return candidate;
}

export interface BeautiAdapterOptions {
  maxDpr: number;
  reducedMotion: boolean;
  callbacks: Pick<RendererCallbacks, "onStatus">;
  onEvent?: (event: "click" | "hover", payload: unknown) => void;
}

export class BeautiMapAdapter {
  #instance: BeautiMapInstance | null = null;
  #observer: ResizeObserver | null = null;
  #contextListeners: Array<readonly [string, EventListener]> = [];
  #mapListeners: Array<readonly [string, (...args: unknown[]) => void]> = [];

  constructor(
    private readonly host: HTMLElement,
    moduleShape: BeautiModuleShape,
    private readonly options: BeautiAdapterOptions,
  ) {
    const Constructor = resolveBeautiMapConstructor(moduleShape);
    const effectiveDpr = Math.min(window.devicePixelRatio || 1, options.maxDpr);
    try {
      this.#instance = new Constructor(host, {
        pixelRatio: effectiveDpr,
        reducedMotion: options.reducedMotion,
      });
      this.#wireEvents();
      for (const event of ["click", "hover"] as const) {
        const listener = (payload: unknown) => options.onEvent?.(event, payload);
        this.#instance.on?.(event, listener);
        this.#mapListeners.push([event, listener]);
      }
      this.#observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        this.#instance?.resize?.(width, height);
      });
      this.#observer.observe(host);
      options.callbacks.onStatus("ready");
    } catch (error) {
      options.callbacks.onStatus("error", error instanceof Error ? error.message : "BeautiMap initialization failed");
      this.destroy();
      throw error;
    }
  }

  #wireEvents() {
    const canvas = this.host.querySelector("canvas");
    if (!canvas) return;
    const lost: EventListener = (event) => {
      event.preventDefault();
      this.options.callbacks.onStatus("context-lost", "BeautiMap WebGL context lost");
    };
    const restored: EventListener = () => this.options.callbacks.onStatus("ready", "BeautiMap WebGL context restored");
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    this.#contextListeners = [
      ["webglcontextlost", lost],
      ["webglcontextrestored", restored],
    ];
  }

  destroy() {
    this.#observer?.disconnect();
    const canvas = this.host.querySelector("canvas");
    if (canvas) this.#contextListeners.forEach(([type, listener]) => canvas.removeEventListener(type, listener));
    this.#contextListeners = [];
    this.#mapListeners.forEach(([type, listener]) => this.#instance?.off?.(type, listener));
    this.#mapListeners = [];
    this.#instance?.destroy?.();
    this.#instance = null;
  }
}
