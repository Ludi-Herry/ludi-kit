import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../src/map/ThreeSituationRenderer.ts", import.meta.url), "utf8");

test("memoizes the derived empty-state GeoJSON prop", () => {
  assert.match(appSource, /const mapData = useMemo\(/);
  assert.match(appSource, /<ThreeSituationMap[\s\S]*?data=\{mapData\}/);
});

test("does not allocate an empty FeatureCollection inside JSX", () => {
  assert.doesNotMatch(appSource, /data=\{[^\n]*\{\s*\.\.\.data,\s*features:\s*\[\]/);
});

test("caps DPR from the full 4K viewport and keeps an automatic degradation route", () => {
  assert.match(rendererSource, /window\.innerWidth >= 3000 \|\| window\.innerHeight >= 2000/);
  assert.match(rendererSource, /viewportCap = this\.#is4kViewport\(\) \? 1\.5 : 2/);
  assert.match(rendererSource, /this\.#quality = "degraded"/);
});
