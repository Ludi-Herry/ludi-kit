export type RendererStatus = "idle" | "loading" | "ready" | "empty" | "error" | "context-lost";
export type MapScope = "country" | "states";
export type QualityLevel = "high" | "degraded";

export type GeoPosition = readonly [longitude: number, latitude: number];

export interface GeoFeatureProperties {
  id: string;
  name: string;
  code: string;
  level: MapScope;
}

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: number[][][];
}

export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

export interface GeoFeature {
  type: "Feature";
  properties: GeoFeatureProperties;
  geometry: PolygonGeometry | MultiPolygonGeometry;
}

export interface GeoFeatureCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
  source?: {
    name: string;
    url: string;
    version: string;
    license: string;
  };
}

export interface MapDiagnostics {
  renderer: "three";
  rendererVersion: string;
  canvasCount: number;
  contextType: "webgl2" | "webgl" | "unavailable";
  scope: MapScope;
  status: RendererStatus;
  dpr: number;
  viewport: { width: number; height: number };
  quality: QualityLevel;
  degradationReason: string | null;
  reducedMotion: boolean;
  contextLost: boolean;
  webgl: {
    vendor: string;
    renderer: string;
    maxTextureSize: number;
    maxRenderbufferSize: number;
    antialias: boolean;
  };
  sampleDurationMs: number;
  frameSamples: number;
  medianFps: number;
  p95FrameMs: number;
  lastInteraction: string;
}

export interface RendererCallbacks {
  onHover(feature: GeoFeatureProperties | null): void;
  onSelect(feature: GeoFeatureProperties): void;
  onStatus(status: RendererStatus, message?: string): void;
  onDiagnostics(diagnostics: MapDiagnostics): void;
}

export interface SituationMapRenderer {
  readonly canvas: HTMLCanvasElement;
  setData(data: GeoFeatureCollection, scope: MapScope, direction: "forward" | "back" | "replace"): void;
  resize(width: number, height: number): void;
  setReducedMotion(reduced: boolean): void;
  simulateContextLoss(): boolean;
  destroy(): void;
}

declare global {
  interface Window {
    __SITUATION_SCREEN_DIAGNOSTICS__?: MapDiagnostics;
    __SITUATION_SCREEN_API__?: {
      setDemoState(state: "ready" | "loading" | "empty" | "error"): void;
      drillDown(): void;
      back(): void;
      simulateContextLoss(): boolean;
    };
  }
}
