import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commit = "f1890d9f152c896d250a77557a5751a93d494776";
const base = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/geojson`;
const sources = {
  country: `${base}/ne_110m_admin_0_countries.geojson`,
  states: `${base}/ne_50m_admin_1_states_provinces.geojson`,
};
const outputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../public/data");

const round = (value) => Math.round(value * 10_000) / 10_000;
const mapCoordinates = (value) => typeof value[0] === "number"
  ? [round(value[0]), round(value[1])]
  : value.map(mapCoordinates);

function polygonCenter(rings) {
  const outer = rings[0];
  const sum = outer.reduce((total, coordinate) => [total[0] + coordinate[0], total[1] + coordinate[1]], [0, 0]);
  return [sum[0] / outer.length, sum[1] / outer.length];
}

function mainlandGeometry(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const mainland = polygons.filter((rings) => {
    const [longitude, latitude] = polygonCenter(rings);
    return longitude >= -130 && longitude <= -65 && latitude >= 23 && latitude <= 50;
  });
  return {
    type: mainland.length === 1 ? "Polygon" : "MultiPolygon",
    coordinates: mapCoordinates(mainland.length === 1 ? mainland[0] : mainland),
  };
}

function normalizeFeature(feature, level) {
  const properties = feature.properties ?? {};
  const code = properties.postal || properties.adm1_code || properties.ADM0_A3 || properties.SOV_A3 || "USA";
  const name = properties.name_en || properties.NAME_EN || properties.name || properties.NAME || "United States";
  return {
    type: "Feature",
    properties: { id: String(code), name: String(name), code: String(code), level },
    geometry: mainlandGeometry(feature.geometry),
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status} ${url}`);
  return response.json();
}

function withSource(features, sourceUrl) {
  return {
    type: "FeatureCollection",
    source: {
      name: "Natural Earth vector",
      url: sourceUrl,
      version: `v5.1.2 / ${commit}`,
      license: "Public domain (https://www.naturalearthdata.com/about/terms-of-use/)",
    },
    features,
  };
}

await mkdir(outputDirectory, { recursive: true });
const [countries, states] = await Promise.all([fetchJson(sources.country), fetchJson(sources.states)]);
const usa = countries.features.find((feature) => [feature.properties?.ADM0_A3, feature.properties?.SOV_A3].includes("USA"));
if (!usa) throw new Error("USA feature missing from Natural Earth admin-0 data");
const mainlandStates = states.features.filter((feature) => {
  const properties = feature.properties ?? {};
  const countryMatch = properties.adm0_a3 === "USA" || properties.sov_a3 === "US1" || properties.admin === "United States of America";
  const code = properties.postal || properties.iso_3166_2?.split("-").at(-1);
  return countryMatch && !["AK", "HI", "PR"].includes(code);
});
if (mainlandStates.length < 48) throw new Error(`Expected at least 48 mainland states, received ${mainlandStates.length}`);

const outputs = {
  "usa-mainland.geojson": withSource([normalizeFeature(usa, "country")], sources.country),
  "usa-states.geojson": withSource(mainlandStates.map((feature) => normalizeFeature(feature, "states")), sources.states),
};
const provenance = {
  generatedAt: new Date().toISOString(),
  repository: "https://github.com/nvkelso/natural-earth-vector",
  commit,
  tag: "v5.1.2",
  license: "Public domain",
  terms: "https://www.naturalearthdata.com/about/terms-of-use/",
  outputs: {},
};
for (const [name, data] of Object.entries(outputs)) {
  const content = `${JSON.stringify(data)}\n`;
  await writeFile(resolve(outputDirectory, name), content, "utf8");
  provenance.outputs[name] = {
    featureCount: data.features.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}
await writeFile(resolve(outputDirectory, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
console.log(JSON.stringify(provenance, null, 2));
