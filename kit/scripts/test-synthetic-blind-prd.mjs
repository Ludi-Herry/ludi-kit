import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateSyntheticBlindPrd,
  loadSyntheticProfiles,
  syntheticBlindPrdPaths
} from "./generate-synthetic-blind-prd.mjs";
import { compileSyntheticSemanticContract } from "./compile-synthetic-semantic-contract.mjs";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(resolve(kitRoot, ".tmp-synthetic-prd-test-"));
const profileDocument = loadSyntheticProfiles();
let positiveCount = 0;
let negativeCount = 0;

try {
  for (const [profileIndex, profile] of profileDocument.profiles.entries()) {
    const seed = String(1000 + profileIndex);
    const firstDir = resolve(tempRoot, `${profile.profileId}-first`);
    const secondDir = resolve(tempRoot, `${profile.profileId}-second`);
    const differentSeedDir = resolve(tempRoot, `${profile.profileId}-different-seed`);

    generateSyntheticBlindPrd({ profileId: profile.profileId, seed, outDir: firstDir });
    generateSyntheticBlindPrd({ profileId: profile.profileId, seed, outDir: secondDir });
    generateSyntheticBlindPrd({
      profileId: profile.profileId,
      seed: String(2000 + profileIndex),
      outDir: differentSeedDir
    });

    assertGeneratedShape(firstDir, profile);
    assertNoSourceLeakage(firstDir);
    assertDirectoriesByteEqual(firstDir, secondDir, syntheticBlindPrdPaths.targetFiles);

    const firstManifest = readJson(resolve(firstDir, "manifest.json"));
    const differentManifest = readJson(resolve(differentSeedDir, "manifest.json"));
    assertDeepEqual(firstManifest.structure, differentManifest.structure, `${profile.profileId} seed-stable structure`);
    assertNotEqual(
      firstManifest.files["synthetic-prd.md"].sha256,
      differentManifest.files["synthetic-prd.md"].sha256,
      `${profile.profileId} different seed PRD digest`
    );

    const firstCompile = compileSyntheticSemanticContract({ inputDir: firstDir, write: false });
    const secondCompile = compileSyntheticSemanticContract({ inputDir: firstDir, write: false });
    assertEqual(firstCompile.sha256, secondCompile.sha256, `${profile.profileId} compiler determinism`);
    assertEqual(firstCompile.contract.source.profileId, profile.profileId, `${profile.profileId} contract source`);
    assertEqual(firstCompile.contract.flows.length, profile.derived.flowCount, `${profile.profileId} contract flow count`);
    positiveCount += 1;
  }

  const baseDir = resolve(tempRoot, "mutation-base");
  generateSyntheticBlindPrd({ profileId: "compact-flow-02", seed: "9001", outDir: baseDir });
  for (const mutation of [
    { kind: "action", message: "flow-01-step-01 action requirement count" },
    { kind: "state", message: "flow-01-step-01 state requirement count" },
    { kind: "side-effect", message: "flow-01 side-effect requirement count" },
    { kind: "recovery", message: "flow-01 recovery requirement count" }
  ]) {
    const mutationDir = resolve(tempRoot, `mutation-${mutation.kind}`);
    cpSync(baseDir, mutationDir, { recursive: true });
    removeRequirementMarker(mutationDir, mutation.kind);
    expectFailure(
      `${mutation.kind} marker deletion`,
      mutation.message,
      () => compileSyntheticSemanticContract({ inputDir: mutationDir, write: false })
    );
    negativeCount += 1;
  }

  for (const forbiddenField of [
    "prdText",
    "sourcePath",
    "sourceHash",
    "sourceSha256",
    "sourceTitle",
    "anchors"
  ]) {
    const mutation = structuredClone(profileDocument);
    mutation.profiles[0][forbiddenField] = "forbidden-source-derived-value";
    const path = resolve(tempRoot, `forbidden-${forbiddenField}.json`);
    writeJson(path, mutation);
    expectFailure(
      `shape profile ${forbiddenField}`,
      "shape profiles schema failed",
      () => loadSyntheticProfiles(path)
    );
    negativeCount += 1;
  }

  const semanticMutations = [
    {
      name: "derived field total",
      message: "derived fieldUnitsTotal",
      apply(document) {
        document.profiles[0].derived.fieldUnitsTotal += 1;
      }
    },
    {
      name: "field page count",
      message: "field page count",
      apply(document) {
        document.profiles[0].fieldUnitsByPage.pop();
      }
    },
    {
      name: "flow count",
      message: "flow count",
      apply(document) {
        document.profiles[0].flowStepCounts.pop();
      }
    }
  ];
  for (const mutation of semanticMutations) {
    const document = structuredClone(profileDocument);
    mutation.apply(document);
    const path = resolve(tempRoot, `semantic-${mutation.name.replaceAll(" ", "-")}.json`);
    writeJson(path, document);
    expectFailure(mutation.name, mutation.message, () => loadSyntheticProfiles(path));
    negativeCount += 1;
  }

  const nonEmptyDir = resolve(tempRoot, "non-empty-output");
  mkdirSync(nonEmptyDir);
  writeFileSync(resolve(nonEmptyDir, "keep.txt"), "occupied\n", "utf8");
  expectFailure(
    "non-empty output directory",
    "output directory must be empty",
    () => generateSyntheticBlindPrd({ profileId: "compact-ai-03", seed: "42", outDir: nonEmptyDir })
  );
  negativeCount += 1;

  expectFailure(
    "invalid seed",
    "unsigned 64-bit",
    () => generateSyntheticBlindPrd({ profileId: "compact-ai-03", seed: "-1", outDir: resolve(tempRoot, "bad-seed") })
  );
  negativeCount += 1;

  console.log(
    `test-synthetic-blind-prd passed: ${positiveCount} structural profiles; ${negativeCount} negative cases rejected`
  );
} catch (error) {
  console.error(`test-synthetic-blind-prd failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const resolvedRoot = resolve(tempRoot);
  const expectedPrefix = `${resolve(kitRoot)}\\.tmp-synthetic-prd-test-`;
  if (!resolvedRoot.startsWith(expectedPrefix)) {
    throw new Error(`refusing to clean unexpected test root: ${resolvedRoot}`);
  }
  rmSync(resolvedRoot, { recursive: true, force: true });
}

function assertGeneratedShape(directory, profile) {
  const manifest = readJson(resolve(directory, "manifest.json"));
  const project = readJson(resolve(directory, "project-description.json"));
  const samplePack = readJson(resolve(directory, "sample-pack.json"));
  const request = readJson(resolve(directory, "generation-request.json"));
  const consumerIdentity = readJson(resolve(directory, "consumer-artifact-identity.json"));
  const controlIdentity = readJson(resolve(directory, "control-artifact-identity.json"));
  const prd = readFileSync(resolve(directory, "synthetic-prd.md"), "utf8");

  assertEqual(manifest.qualifying, false, `${profile.profileId} qualifying flag`);
  assertEqual(manifest.scoring, false, `${profile.profileId} scoring flag`);
  assertEqual(
    manifest.semanticContract.status,
    "pending-independent-compile",
    `${profile.profileId} semantic status`
  );
  assertDeepEqual(manifest.structure, profile.derived, `${profile.profileId} manifest structure`);
  assertEqual(project.pages.length, profile.derived.pageCount, `${profile.profileId} project page count`);
  assertEqual(
    project.pages.reduce((sum, page) => sum + countProjectPageFields(page), 0),
    profile.derived.fieldUnitsTotal,
    `${profile.profileId} project field unit count`
  );

  const entities = Object.entries(samplePack.entities);
  assertEqual(entities.length, profile.derived.entityCount, `${profile.profileId} sample entity count`);
  entities.forEach(([entityName, records], index) => {
    const recordValues = Object.values(records);
    assertEqual(recordValues.length, profile.entityRecordCounts[index], `${entityName} sample record count`);
    assertEqual(Object.keys(recordValues[0]).length, profile.entityFieldCounts[index], `${entityName} sample field count`);
  });

  const markers = extractRequirementMarkers(prd);
  const stepTotal = profile.flowStepCounts.reduce((sum, value) => sum + value, 0);
  assertEqual(markers.filter((item) => item.kind === "action").length, stepTotal, `${profile.profileId} action coverage`);
  assertEqual(markers.filter((item) => item.kind === "state").length, stepTotal, `${profile.profileId} state coverage`);
  assertEqual(markers.filter((item) => item.kind === "side-effect").length, profile.derived.flowCount, `${profile.profileId} side-effect coverage`);
  assertEqual(markers.filter((item) => item.kind === "recovery").length, profile.derived.flowCount, `${profile.profileId} recovery coverage`);
  assertEqual(request.requiredRequirementIds.length, markers.length, `${profile.profileId} request requirement count`);
  assertEqual(request.qualifying, false, `${profile.profileId} request qualifying flag`);
  assertEqual(request.scoring, false, `${profile.profileId} request scoring flag`);
  assertEqual(consumerIdentity.arm, "consumer", `${profile.profileId} consumer identity arm`);
  assertEqual(controlIdentity.arm, "control", `${profile.profileId} control identity arm`);
  assertEqual(consumerIdentity.runId, controlIdentity.runId, `${profile.profileId} paired runId`);
  assertEqual(consumerIdentity.projectId, controlIdentity.projectId, `${profile.profileId} paired projectId`);
  assertNotEqual(consumerIdentity.artifactId, controlIdentity.artifactId, `${profile.profileId} arm artifactId`);
}

function assertNoSourceLeakage(directory) {
  const combined = syntheticBlindPrdPaths.targetFiles
    .map((name) => readFileSync(resolve(directory, name), "utf8"))
    .join("\n");
  for (const token of [
    "安全态势感知",
    "多模型平台",
    "零信任",
    "IP助理",
    "示例竞品词",
    "Agent工作台"
  ]) {
    if (combined.includes(token)) throw new Error(`synthetic output leaked known source token: ${token}`);
  }
  if (/[A-Za-z]:[\\/]/.test(combined)) throw new Error("synthetic output contains an absolute Windows path");
  if (/https?:\/\//i.test(combined)) throw new Error("synthetic output contains an external URL");
  if (/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/.test(combined)) {
    throw new Error("synthetic output contains an IPv4-shaped value");
  }
}

function assertDirectoriesByteEqual(leftDir, rightDir, names) {
  for (const name of names) {
    const left = readFileSync(resolve(leftDir, name));
    const right = readFileSync(resolve(rightDir, name));
    if (!left.equals(right)) throw new Error(`${name} differs for identical profile and seed`);
  }
}

function removeRequirementMarker(directory, kind) {
  const path = resolve(directory, "synthetic-prd.md");
  const lines = readFileSync(path, "utf8").split("\n");
  const index = lines.findIndex(
    (line) => line.startsWith("<!-- harness-requirement ") && line.includes(`\"kind\":\"${kind}\"`)
  );
  if (index < 0) throw new Error(`cannot find ${kind} marker for mutation`);
  lines.splice(index, 1);
  const bytes = Buffer.from(lines.join("\n"), "utf8");
  writeFileSync(path, bytes);

  const manifestPath = resolve(directory, "manifest.json");
  const manifest = readJson(manifestPath);
  manifest.files["synthetic-prd.md"] = { bytes: bytes.length, sha256: sha256(bytes) };
  writeJson(manifestPath, manifest);
}

function extractRequirementMarkers(prd) {
  return prd
    .split(/\r?\n/)
    .filter((line) => line.startsWith("<!-- harness-requirement "))
    .map((line) => JSON.parse(line.slice("<!-- harness-requirement ".length, -" -->".length)));
}

function countProjectPageFields(page) {
  const content = page.content ?? {};
  return (
    (content.metrics?.length ?? 0) +
    (content.filters?.length ?? 0) +
    (content.details?.length ?? 0) +
    (content.fields?.length ?? 0) +
    (content.table?.columns?.length ?? 0)
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

function assertNotEqual(actual, expected, label) {
  if (actual === expected) throw new Error(`${label}: values unexpectedly match`);
}

function assertDeepEqual(actual, expected, label) {
  const left = JSON.stringify(sortValue(actual));
  const right = JSON.stringify(sortValue(expected));
  if (left !== right) throw new Error(`${label}: expected ${right}, received ${left}`);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}

function expectFailure(label, message, action) {
  try {
    action();
  } catch (error) {
    const actual = error instanceof Error ? error.message : String(error);
    if (actual.includes(message)) return;
    throw new Error(`${label} failed with an unexpected error: ${actual}`);
  }
  throw new Error(`${label} did not fail closed`);
}
