import type { GeoFeatureCollection, MapScope } from "./renderer-contract";

const paths: Record<MapScope, string> = {
  country: "/data/usa-mainland.geojson",
  states: "/data/usa-states.geojson",
};

const cache = new Map<MapScope, GeoFeatureCollection>();
const inflight = new Map<MapScope, Promise<GeoFeatureCollection>>();

function assertFeatureCollection(value: unknown): asserts value is GeoFeatureCollection {
  if (!value || typeof value !== "object") throw new TypeError("GeoJSON payload is not an object");
  const collection = value as Partial<GeoFeatureCollection>;
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new TypeError("GeoJSON payload is not a FeatureCollection");
  }
  for (const feature of collection.features) {
    if (feature.type !== "Feature" || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) {
      throw new TypeError("GeoJSON contains an unsupported feature geometry");
    }
    if (!feature.properties?.id || !feature.properties?.name) {
      throw new TypeError("GeoJSON feature is missing normalized identity properties");
    }
  }
}

export async function loadScope(scope: MapScope, signal?: AbortSignal): Promise<GeoFeatureCollection> {
  if (signal?.aborted) throw new DOMException("Navigation aborted", "AbortError");
  const cached = cache.get(scope);
  if (cached) return cached;

  let request = inflight.get(scope);
  if (!request) {
    request = fetch(paths[scope])
      .then(async (response) => {
        if (!response.ok) throw new Error(`GeoJSON load failed with HTTP ${response.status}`);
        const value: unknown = await response.json();
        assertFeatureCollection(value);
        cache.set(scope, value);
        return value;
      })
      .finally(() => inflight.delete(scope));
    inflight.set(scope, request);
  }
  const result = await request;
  if (signal?.aborted) throw new DOMException("Navigation aborted", "AbortError");
  return result;
}

export function prefetchScope(scope: MapScope) {
  void loadScope(scope).catch(() => undefined);
}
