# Renderer routing

Allow one admitted main renderer per screen.

| Need | Route | Admission gate |
| --- | --- | --- |
| offline administrative extrusion, drilldown, custom effects | Three.js React renderer | licensed local GeoJSON, lifecycle/disposal, resize, context loss, DPR/performance controls |
| BeautiMap experiment | thin isolated adapter only | full license text, GeoJSON provenance, working UMD/ESM exports, lifecycle and failure tests |
| real basemap, POI, road/path, geocoding, or LBS | clean adapter against official AMap API | user-provided key, official terms, no inherited telemetry or fixed machine paths |
| decorative 3D object | Spline | legal scene URL, lazy load, pointer policy, fallback, reduced motion |

Registry candidates must define: renderer ID/version, source/license, data provenance, exports, init/load/resize/destroy, events, DPR cap, context loss/restore, reduced motion, failure states, and bundle-loading strategy.

## BeautiMap audit conclusion

Audited `JackQ888/beauti-map` at commit `eee4669026b9979689d6cfd119b536dc4d291986` on 2026-07-16.

- package metadata declares MIT and README repeats it; the repository contains no LICENSE/LICENCE/COPYING full text;
- 1,098 GeoJSON files have no documented source or data license;
- `npm run pack` succeeds, while the UMD config exports `default` from a named-export-only entrypoint;
- CommonJS `require(dist/beauti-map.js)` returns `undefined`; ESM inspection cannot enumerate exports;
- no public resize method, DPR cap, reduced-motion route, or WebGL context-loss handling;
- XHR loading lacks error/timeout/abort handling; camera event cleanup is incomplete;
- no forced telemetry or credential behavior was found.

Decision: `NO-GO` for the formal renderer registry and for source/data vendoring. Keep a source-free adapter contract PoC to test both named/default shapes and reject an empty module. Use the admitted Three.js route for production samples.

Code-derived attribution required when adapting the `three-scope-map` structural ideas:
`作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天`
