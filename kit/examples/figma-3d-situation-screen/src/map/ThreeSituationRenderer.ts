import { gsap } from "gsap";
import * as THREE from "three";
import type {
  GeoFeature,
  GeoFeatureCollection,
  GeoFeatureProperties,
  GeoPosition,
  MapDiagnostics,
  MapScope,
  QualityLevel,
  RendererCallbacks,
  RendererStatus,
  SituationMapRenderer,
} from "./renderer-contract";

// Structural adaptation credit required by three-scope-map.
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天

const RENDERER_VERSION = "three@0.185.1";
const MAP_CENTER: GeoPosition = [-97.5, 38.2];
const MAP_SCALE = 1.24;
const MAP_DEPTH = 2.1;

const geoSignals: Array<{ name: string; position: GeoPosition; value: number }> = [
  { name: "西雅图", position: [-122.33, 47.61], value: 79 },
  { name: "旧金山", position: [-122.42, 37.77], value: 63 },
  { name: "洛杉矶", position: [-118.24, 34.05], value: 71 },
  { name: "丹佛", position: [-104.99, 39.74], value: 48 },
  { name: "达拉斯", position: [-96.8, 32.78], value: 58 },
  { name: "芝加哥", position: [-87.63, 41.88], value: 69 },
  { name: "亚特兰大", position: [-84.39, 33.75], value: 52 },
  { name: "华盛顿", position: [-77.04, 38.91], value: 88 },
  { name: "纽约", position: [-74, 40.71], value: 94 },
  { name: "迈阿密", position: [-80.19, 25.76], value: 44 },
];

const flyPairs: Array<readonly [number, number]> = [[0, 7], [2, 8], [4, 5], [6, 8]];

function project([longitude, latitude]: GeoPosition): THREE.Vector2 {
  return new THREE.Vector2(
    (longitude - MAP_CENTER[0]) * MAP_SCALE,
    (latitude - MAP_CENTER[1]) * MAP_SCALE,
  );
}

function ringToPoints(ring: number[][]): THREE.Vector2[] {
  const points = ring.slice(0, -1).map((coordinate) => project(coordinate as unknown as GeoPosition));
  return points.filter((point, index) => index === 0 || !point.equals(points[index - 1]));
}

function polygonToShape(rings: number[][][]): THREE.Shape {
  const outer = ringToPoints(rings[0]);
  if (!THREE.ShapeUtils.isClockWise(outer)) outer.reverse();
  const shape = new THREE.Shape(outer);
  for (const ring of rings.slice(1)) {
    const hole = ringToPoints(ring);
    if (THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
    shape.holes.push(new THREE.Path(hole));
  }
  return shape;
}

function featurePolygons(feature: GeoFeature): number[][][][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material?.dispose();
    }
  });
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function median(values: number[]) {
  return percentile(values, 0.5);
}

function setMaterialOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.transparent = opacity < 1 || material.transparent;
      material.opacity = opacity;
      material.needsUpdate = true;
    }
  });
}

export class ThreeSituationRenderer implements SituationMapRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  readonly #raycaster = new THREE.Raycaster();
  readonly #pointer = new THREE.Vector2();
  readonly #rootGroup = new THREE.Group();
  readonly #featureGroup = new THREE.Group();
  readonly #effectsGroup = new THREE.Group();
  readonly #callbacks: RendererCallbacks;
  readonly #frameTimes: number[] = [];
  #sampleStartedAt = performance.now();
  #lastFrame = performance.now();
  #animationFrame = 0;
  #destroyed = false;
  #contextLost = false;
  #reducedMotion: boolean;
  #scope: MapScope = "country";
  #status: RendererStatus = "idle";
  #quality: QualityLevel = "high";
  #degradationReason: string | null = null;
  #viewport = { width: 1, height: 1 };
  #hovered: THREE.Group | null = null;
  #scopeTimeline: gsap.core.Timeline | null = null;
  #lastInteraction = "initialized";
  #degradeEvaluated = false;
  #contextType: "webgl2" | "webgl" | "unavailable" = "unavailable";
  #webglMetrics = {
    vendor: "unavailable",
    renderer: "unavailable",
    maxTextureSize: 0,
    maxRenderbufferSize: 0,
    antialias: false,
  };

  constructor(host: HTMLElement, callbacks: RendererCallbacks, reducedMotion: boolean) {
    this.#callbacks = callbacks;
    this.#reducedMotion = reducedMotion;
    this.#renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.canvas = this.#renderer.domElement;
    this.canvas.className = "situation-map-canvas";
    this.canvas.setAttribute("aria-label", "United States security situation WebGL map");
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);

    const context = this.#renderer.getContext();
    this.#contextType = typeof WebGL2RenderingContext !== "undefined" && context instanceof WebGL2RenderingContext ? "webgl2" : "webgl";
    const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
    this.#webglMetrics = {
      vendor: String(debugInfo ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : context.getParameter(context.VENDOR)),
      renderer: String(debugInfo ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER)),
      maxTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE)),
      maxRenderbufferSize: Number(context.getParameter(context.MAX_RENDERBUFFER_SIZE)),
      antialias: Boolean(context.getContextAttributes()?.antialias),
    };
    this.#renderer.setClearColor(0x020713, 0);
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#scene.fog = new THREE.FogExp2(0x030914, 0.006);
    this.#camera.position.set(0, -50, 74);
    this.#camera.lookAt(0, 0, 0);

    this.#rootGroup.add(this.#featureGroup, this.#effectsGroup);
    this.#scene.add(this.#rootGroup);
    this.#scene.add(new THREE.HemisphereLight(0x70d9ff, 0x061121, 1.8));
    const keyLight = new THREE.DirectionalLight(0x8ce8ff, 3.2);
    keyLight.position.set(-20, -30, 65);
    this.#scene.add(keyLight);

    this.canvas.addEventListener("pointermove", this.#onPointerMove);
    this.canvas.addEventListener("pointerleave", this.#onPointerLeave);
    this.canvas.addEventListener("click", this.#onClick);
    this.canvas.addEventListener("webglcontextlost", this.#onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.#onContextRestored);
    this.#setStatus("loading", "WebGL renderer initialized");
    this.#animationFrame = requestAnimationFrame(this.#render);
  }

  #setStatus(status: RendererStatus, message?: string) {
    this.#status = status;
    this.#callbacks.onStatus(status, message);
    this.#publishDiagnostics();
  }

  #createFeature(feature: GeoFeature, scope: MapScope) {
    const group = new THREE.Group();
    group.userData.feature = feature.properties;
    const topColor = scope === "country" ? 0x0d3550 : 0x0a2a43;
    const sideColor = scope === "country" ? 0x06223d : 0x05192d;
    for (const polygon of featurePolygons(feature)) {
      const shape = polygonToShape(polygon);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: MAP_DEPTH,
        bevelEnabled: true,
        bevelSegments: this.#quality === "high" ? 2 : 1,
        bevelSize: 0.12,
        bevelThickness: 0.12,
        curveSegments: 1,
      });
      geometry.computeVertexNormals();
      const top = new THREE.MeshStandardMaterial({
        color: topColor,
        emissive: 0x031728,
        emissiveIntensity: 0.6,
        roughness: 0.58,
        metalness: 0.18,
      });
      const side = new THREE.MeshStandardMaterial({
        color: sideColor,
        emissive: 0x00101c,
        emissiveIntensity: 0.4,
        roughness: 0.72,
        metalness: 0.12,
      });
      const mesh = new THREE.Mesh(geometry, [top, side]);
      mesh.userData.featureRoot = group;
      group.add(mesh);

      for (const [ringIndex, ring] of polygon.entries()) {
        const points = ringToPoints(ring).map((point) => new THREE.Vector3(point.x, point.y, MAP_DEPTH + 0.16));
        if (points.length < 2) continue;
        points.push(points[0].clone());
        const outlineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const outlineMaterial = new THREE.LineBasicMaterial({
          color: ringIndex === 0 ? 0x62d9ff : 0x226584,
          transparent: true,
          opacity: scope === "country" ? 0.9 : 0.58,
        });
        const outline = new THREE.Line(outlineGeometry, outlineMaterial);
        outline.userData.featureRoot = group;
        group.add(outline);
      }
    }
    return group;
  }

  #createEffects() {
    const pillarGeometry = new THREE.CylinderGeometry(0.24, 0.38, 1, 8);
    for (const [index, signal] of geoSignals.entries()) {
      const point = project(signal.position);
      const height = 2.4 + signal.value / 13;
      const material = new THREE.MeshBasicMaterial({
        color: index % 3 === 0 ? 0xffc66b : 0x48e6ff,
        transparent: true,
        opacity: 0.88,
      });
      const pillar = new THREE.Mesh(pillarGeometry, material);
      pillar.scale.y = height;
      pillar.rotation.x = Math.PI / 2;
      pillar.position.set(point.x, point.y, MAP_DEPTH + height / 2 + 0.2);
      pillar.userData.effectKind = "pillar";
      this.#effectsGroup.add(pillar);

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.46, 0.62, 20),
        new THREE.MeshBasicMaterial({ color: 0x51e4ff, transparent: true, opacity: 0.62, side: THREE.DoubleSide }),
      );
      halo.position.set(point.x, point.y, MAP_DEPTH + 0.22);
      halo.userData.effectKind = "halo";
      this.#effectsGroup.add(halo);
    }

    for (const [startIndex, endIndex] of flyPairs) {
      const start2 = project(geoSignals[startIndex].position);
      const end2 = project(geoSignals[endIndex].position);
      const start = new THREE.Vector3(start2.x, start2.y, MAP_DEPTH + 1.2);
      const end = new THREE.Vector3(end2.x, end2.y, MAP_DEPTH + 1.2);
      const distance = start.distanceTo(end);
      const midpoint = start.clone().lerp(end, 0.5);
      midpoint.z += Math.max(4, distance * 0.32);
      const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(this.#quality === "high" ? 48 : 24));
      const material = new THREE.LineDashedMaterial({ color: 0x55e6ff, dashSize: 1.8, gapSize: 1.1, transparent: true, opacity: 0.8 });
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      line.userData.effectKind = "flyline";
      this.#effectsGroup.add(line);
    }
  }

  setData(data: GeoFeatureCollection, scope: MapScope, direction: "forward" | "back" | "replace") {
    if (this.#destroyed) return;
    this.#setStatus("loading", `Switching to ${scope}`);
    this.#scopeTimeline?.kill();
    this.#scopeTimeline = null;
    disposeObject(this.#featureGroup);
    disposeObject(this.#effectsGroup);
    this.#featureGroup.clear();
    this.#effectsGroup.clear();
    this.#scope = scope;
    this.#frameTimes.length = 0;
    this.#sampleStartedAt = performance.now();
    this.#degradeEvaluated = false;
    this.#clearHover();

    if (!data.features.length) {
      this.#setStatus("empty", "No GeoJSON features are available for this scope");
      return;
    }

    for (const feature of data.features) this.#featureGroup.add(this.#createFeature(feature, scope));
    this.#createEffects();
    const targetZ = scope === "country" ? 74 : 68;
    const targetY = scope === "country" ? -50 : -44;
    const rotationDelta = direction === "back" ? -0.035 : direction === "forward" ? 0.035 : 0;
    this.#rootGroup.rotation.z = -rotationDelta;
    setMaterialOpacity(this.#featureGroup, this.#reducedMotion ? 1 : 0.08);
    setMaterialOpacity(this.#effectsGroup, this.#reducedMotion ? 1 : 0);
    this.#lastInteraction = `${direction}:${scope}`;

    if (this.#reducedMotion) {
      this.#camera.position.set(0, targetY, targetZ);
      this.#camera.lookAt(0, 0, 0);
      this.#rootGroup.rotation.z = 0;
      this.#setStatus("ready", `${data.features.length} features rendered`);
      return;
    }

    this.#scopeTimeline = gsap.timeline({
      defaults: { duration: 0.72, ease: "power3.out" },
      onComplete: () => {
        this.#scopeTimeline = null;
        this.#setStatus("ready", `${data.features.length} features rendered`);
      },
    });
    this.#scopeTimeline
      .to(this.#camera.position, { y: targetY, z: targetZ, onUpdate: () => this.#camera.lookAt(0, 0, 0) }, 0)
      .to(this.#rootGroup.rotation, { z: 0 }, 0)
      .to(this.#featureGroup.children.flatMap((child) => this.#materialsFor(child)), { opacity: 1, stagger: 0.004 }, 0.06)
      .to(this.#effectsGroup.children.flatMap((child) => this.#materialsFor(child)), { opacity: 0.82, stagger: 0.006 }, 0.18);
  }

  #materialsFor(object: THREE.Object3D): THREE.Material[] {
    const materials: THREE.Material[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points)) return;
      materials.push(...(Array.isArray(child.material) ? child.material : [child.material]));
    });
    return materials;
  }

  resize(width: number, height: number) {
    if (this.#destroyed || width <= 0 || height <= 0) return;
    const sizeChanged = Math.abs(width - this.#viewport.width) > 1 || Math.abs(height - this.#viewport.height) > 1;
    if (sizeChanged) {
      this.#frameTimes.length = 0;
      this.#sampleStartedAt = performance.now();
      this.#degradeEvaluated = false;
    }
    this.#viewport = { width: Math.round(width), height: Math.round(height) };
    const viewportCap = this.#is4kViewport() ? 1.5 : 2;
    const maxDpr = this.#quality === "degraded" ? Math.min(viewportCap, this.#is4kViewport() ? 1 : 1.25) : viewportCap;
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
    this.#publishDiagnostics();
  }

  setReducedMotion(reduced: boolean) {
    this.#reducedMotion = reduced;
    if (reduced) {
      this.#scopeTimeline?.progress(1).kill();
      this.#scopeTimeline = null;
    }
    this.#lastInteraction = reduced ? "reduced-motion:on" : "reduced-motion:off";
    this.#publishDiagnostics();
  }

  simulateContextLoss() {
    if (this.#destroyed || this.#contextLost) return false;
    this.#renderer.forceContextLoss();
    window.setTimeout(() => {
      if (!this.#destroyed) this.#renderer.forceContextRestore();
    }, 700);
    return true;
  }

  #onContextLost = (event: Event) => {
    event.preventDefault();
    this.#contextLost = true;
    this.#lastInteraction = "webgl-context-lost";
    this.#setStatus("context-lost", "WebGL context lost; waiting for restoration");
  };

  #onContextRestored = () => {
    this.#contextLost = false;
    this.#lastInteraction = "webgl-context-restored";
    this.#setStatus("ready", "WebGL context restored");
  };

  #eventFeature(event: PointerEvent | MouseEvent) {
    const bounds = this.canvas.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);
    const hit = this.#raycaster.intersectObjects(this.#featureGroup.children, true)[0];
    let current: THREE.Object3D | null = hit?.object ?? null;
    while (current && !current.userData.feature) current = current.parent;
    return current instanceof THREE.Group ? current : null;
  }

  #onPointerMove = (event: PointerEvent) => {
    const next = this.#eventFeature(event);
    if (next === this.#hovered) return;
    this.#clearHover();
    this.#hovered = next;
    if (next) {
      next.position.z = 1.15;
      next.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const top = Array.isArray(child.material) ? child.material[0] : child.material;
        if (top instanceof THREE.MeshStandardMaterial) top.emissive.setHex(0x0b526f);
      });
      this.canvas.style.cursor = "pointer";
      const feature = next.userData.feature as GeoFeatureProperties;
      this.#callbacks.onHover(feature);
      this.#lastInteraction = `hover:${feature.code}`;
    }
  };

  #onPointerLeave = () => this.#clearHover();

  #onClick = (event: MouseEvent) => {
    const group = this.#eventFeature(event);
    if (!group) return;
    const feature = group.userData.feature as GeoFeatureProperties;
    this.#lastInteraction = `click:${feature.code}`;
    this.#callbacks.onSelect(feature);
    this.#publishDiagnostics();
  };

  #clearHover() {
    if (this.#hovered) {
      this.#hovered.position.z = 0;
      this.#hovered.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const top = Array.isArray(child.material) ? child.material[0] : child.material;
        if (top instanceof THREE.MeshStandardMaterial) top.emissive.setHex(0x031728);
      });
    }
    this.#hovered = null;
    this.canvas.style.cursor = "default";
    this.#callbacks.onHover(null);
  }

  #render = (now: number) => {
    if (this.#destroyed) return;
    const frameTime = now - this.#lastFrame;
    this.#lastFrame = now;
    if (frameTime > 0 && frameTime < 250) {
      this.#frameTimes.push(frameTime);
      if (this.#frameTimes.length > 6_000) this.#frameTimes.shift();
    }

    if (!this.#reducedMotion && !this.#contextLost) {
      const phase = now * 0.0015;
      this.#effectsGroup.children.forEach((effect, index) => {
        if (effect.userData.effectKind === "halo") {
          const pulse = 1 + Math.sin(phase + index * 0.7) * 0.18;
          effect.scale.setScalar(pulse);
        }
        if (effect.userData.effectKind === "flyline" && effect instanceof THREE.Line && effect.material instanceof THREE.LineDashedMaterial) {
          effect.material.opacity = 0.62 + Math.sin(phase * 1.35 + index) * 0.2;
        }
      });
    }
    if (!this.#contextLost) this.#renderer.render(this.#scene, this.#camera);
    if (this.#frameTimes.length % 30 === 0) this.#publishDiagnostics();
    if (!this.#degradeEvaluated && this.#frameTimes.length >= 240) this.#evaluateQuality();
    this.#animationFrame = requestAnimationFrame(this.#render);
  };

  #evaluateQuality() {
    this.#degradeEvaluated = true;
    const diagnostic = this.#diagnostics();
    const is4k = this.#is4kViewport();
    const minFps = is4k ? 30 : 45;
    const maxP95 = is4k ? 50 : 33;
    if (diagnostic.medianFps >= minFps && diagnostic.p95FrameMs <= maxP95) return;
    this.#quality = "degraded";
    this.#degradationReason = `automatic: median ${diagnostic.medianFps.toFixed(1)} FPS, p95 ${diagnostic.p95FrameMs.toFixed(1)} ms`;
    this.#effectsGroup.children.forEach((effect, index) => {
      if (effect.userData.effectKind === "halo" && index % 2 === 0) effect.visible = false;
      if (effect.userData.effectKind === "flyline" && index % 2 === 0) effect.visible = false;
    });
    this.resize(this.#viewport.width, this.#viewport.height);
  }

  #is4kViewport() {
    return window.innerWidth >= 3000 || window.innerHeight >= 2000;
  }

  #diagnostics(): MapDiagnostics {
    const medianFrame = median(this.#frameTimes);
    return {
      renderer: "three",
      rendererVersion: RENDERER_VERSION,
      canvasCount: this.canvas.parentElement?.querySelectorAll("canvas").length ?? 0,
      contextType: this.#contextType,
      scope: this.#scope,
      status: this.#status,
      dpr: this.#renderer.getPixelRatio(),
      viewport: this.#viewport,
      quality: this.#quality,
      degradationReason: this.#degradationReason,
      reducedMotion: this.#reducedMotion,
      contextLost: this.#contextLost,
      webgl: this.#webglMetrics,
      sampleDurationMs: Math.max(0, performance.now() - this.#sampleStartedAt),
      frameSamples: this.#frameTimes.length,
      medianFps: medianFrame ? 1000 / medianFrame : 0,
      p95FrameMs: percentile(this.#frameTimes, 0.95),
      lastInteraction: this.#lastInteraction,
    };
  }

  #publishDiagnostics() {
    const diagnostics = this.#diagnostics();
    window.__SITUATION_SCREEN_DIAGNOSTICS__ = diagnostics;
    this.#callbacks.onDiagnostics(diagnostics);
  }

  destroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    cancelAnimationFrame(this.#animationFrame);
    this.#scopeTimeline?.kill();
    gsap.killTweensOf(this.#camera.position);
    gsap.killTweensOf(this.#rootGroup.rotation);
    this.canvas.removeEventListener("pointermove", this.#onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.#onPointerLeave);
    this.canvas.removeEventListener("click", this.#onClick);
    this.canvas.removeEventListener("webglcontextlost", this.#onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.#onContextRestored);
    disposeObject(this.#rootGroup);
    this.#rootGroup.clear();
    this.#renderer.dispose();
    this.canvas.remove();
    if (window.__SITUATION_SCREEN_DIAGNOSTICS__?.renderer === "three") delete window.__SITUATION_SCREEN_DIAGNOSTICS__;
  }
}

export function createSituationRenderer(
  host: HTMLElement,
  callbacks: RendererCallbacks,
  reducedMotion: boolean,
): SituationMapRenderer {
  return new ThreeSituationRenderer(host, callbacks, reducedMotion);
}
