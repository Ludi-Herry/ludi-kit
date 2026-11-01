import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(kitRoot, "..");
const args = parseArgs(process.argv.slice(2));
const manifestPath = args.fixture
  ? resolveInsideRepo(args.fixture, kitRoot)
  : resolveInsideRepo(args.manifest ?? "workflows.manifest.json", kitRoot);
const schemaPath = resolve(kitRoot, "schema/workflows.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true, formats: { "date-time": true } });
const validate = ajv.compile(readJson(schemaPath));
const validateWorkflowEvidence = ajv.compile(readJson(resolve(kitRoot, "schema/workflow-evidence.schema.json")));
const validateFigmaEvidence = ajv.compile(readJson(resolve(kitRoot, "schema/figma-evidence.schema.json")));
const errors = [];
const primaryBlockedTypes = new Set(["evidence", "metrics", "report"]);
const supportingRoles = new Set(["supporting", "evidence", "internal"]);
const canonicalIds = [
  "requirement-to-final-page",
  "existing-figma-library-to-page",
  "image2-to-figma-page",
  "prd-antd-to-figma-calibrated-page",
  "figma-spec-to-code-foundation",
  "design-system-zero-to-one",
  "figma-3d-situation-screen"
];

const manifest = args.fixture ? fixtureCandidate(args.fixture) : readJson(manifestPath);
validateManifest(manifest, manifestPath);

if (args.testFixtures) {
  testFixture("workflows/fixtures/valid.json");
  testFixture("workflows/fixtures/invalid-missing-handoff.json");
  testFixture("workflows/fixtures/invalid-primary-evidence.json");
  testFixture("workflows/fixtures/invalid-missing-evidence.json");
  testFixture("workflows/fixtures/invalid-wrong-workflow-set.json");
  const invalidRaw = resolve(kitRoot, "workflows/fixtures/invalid.raw.json");
  if (validate(readJson(invalidRaw))) errors.push("invalid.raw.json unexpectedly passed schema validation");
}

if (errors.length) {
  for (const error of errors) console.error(`validate-workflows failed: ${error}`);
  process.exit(1);
}

const statusCounts = manifest.workflows.reduce((counts, workflow) => {
  counts[workflow.completion.status] = (counts[workflow.completion.status] ?? 0) + 1;
  return counts;
}, {});
console.log(
  `validate-workflows passed: ${manifest.workflows.length} workflows; ` +
    Object.entries(statusCounts).map(([status, count]) => `${status}=${count}`).join(", ")
);

function validateManifest(value, sourcePath) {
  if (!validate(value)) {
    errors.push(`${relative(repoRoot, sourcePath)} schema errors: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
    return;
  }

  const ids = value.workflows.map((workflow) => workflow.id);
  if (new Set(ids).size !== ids.length) errors.push("workflow ids must be unique");
  if (!hasCanonicalIds(value)) {
    errors.push(`workflow ids must exactly match the canonical set: ${canonicalIds.join(", ")}`);
  }

  for (const source of value.provenance.sources) requirePath(source, `provenance source ${source}`);
  for (const workflow of value.workflows) {
    requirePath(workflow.source, `${workflow.id}.source`);
    if (workflow.routePolicy) requirePath(workflow.routePolicy.decision, `${workflow.id}.routePolicy.decision`);
    for (const file of workflow.tools.scripts) requirePath(file, `${workflow.id}.tools.scripts`);
    const artifactById = new Map();
    for (const artifact of workflow.artifacts) {
      if (artifactById.has(artifact.id)) errors.push(`${workflow.id}.artifacts has duplicate id ${artifact.id}`);
      artifactById.set(artifact.id, artifact);
      if (artifact.required) requirePath(artifact.path, `${workflow.id}.artifacts.${artifact.id}`);
    }
    validateHandoff(workflow, artifactById);
    requirePath(workflow.evidence.schema, `${workflow.id}.evidence.schema`);
    for (const record of workflow.evidence.records) {
      requirePath(record, `${workflow.id}.evidence.records`);
      validateEvidenceRecord(workflow, record);
    }
    for (const example of workflow.examples) requirePath(example, `${workflow.id}.examples`);

    if (workflow.completion.status === "external-blocked") {
      const blocked = workflow.externalDependencies.some((dependency) => dependency.availability === "unavailable");
      if (!blocked) errors.push(`${workflow.id} is external-blocked without an unavailable dependency`);
      if (!workflow.completion.remaining.length) errors.push(`${workflow.id} is external-blocked without a resume requirement`);
    }
  }
}

function validateHandoff(workflow, artifactById) {
  const { handoff } = workflow;
  const primary = requireArtifactRef(workflow, artifactById, handoff.primaryArtifactId, "handoff.primaryArtifactId");
  if (primary) {
    requirePath(primary.path, `${workflow.id}.handoff.primaryArtifactId.${primary.id}`);
    if (primary.role !== "product") {
      errors.push(`${workflow.id}.handoff.primaryArtifactId ${primary.id} must reference a product artifact`);
    }
    if (primaryBlockedTypes.has(primary.type)) {
      errors.push(`${workflow.id}.handoff.primaryArtifactId ${primary.id} cannot use ${primary.type} as the primary deliverable`);
    }
  }

  for (const artifactId of handoff.supportingArtifactIds) {
    const artifact = requireArtifactRef(workflow, artifactById, artifactId, "handoff.supportingArtifactIds");
    if (artifact && !supportingRoles.has(artifact.role)) {
      errors.push(`${workflow.id}.handoff.supportingArtifactIds ${artifactId} must reference a supporting, evidence, or internal artifact`);
    }
  }

  if (handoff.blockedDelivery) {
    for (const artifactId of handoff.blockedDelivery.deliverNow) {
      const artifact = requireArtifactRef(workflow, artifactById, artifactId, "handoff.blockedDelivery.deliverNow");
      if (artifact) requirePath(artifact.path, `${workflow.id}.handoff.blockedDelivery.deliverNow.${artifactId}`);
    }
  }

  if (workflow.completion.status === "implemented") {
    if (!handoff.primaryArtifactId) errors.push(`${workflow.id} is implemented without handoff.primaryArtifactId`);
    if (!handoff.open) errors.push(`${workflow.id} is implemented without handoff.open`);
  }

  if (["partial", "external-blocked"].includes(workflow.completion.status) && !handoff.blockedDelivery) {
    errors.push(`${workflow.id} is ${workflow.completion.status} without handoff.blockedDelivery`);
  }

  if (!handoff.open) return;
  if (!handoff.primaryArtifactId) errors.push(`${workflow.id}.handoff.open exists without a primary artifact`);
  if (handoff.open.cwd) requirePath(handoff.open.cwd, `${workflow.id}.handoff.open.cwd`);
  if (handoff.open.mode === "browser") {
    if (!handoff.open.command) errors.push(`${workflow.id}.handoff.open browser mode requires a command`);
    if (!/^https?:\/\//i.test(handoff.open.target)) {
      errors.push(`${workflow.id}.handoff.open browser target must be an http(s) URL`);
    }
  }
  if (["file", "package"].includes(handoff.open.mode) && !isExternalTarget(handoff.open.target)) {
    try {
      const base = handoff.open.cwd ? resolveInsideRepo(handoff.open.cwd, kitRoot) : kitRoot;
      const target = resolveInsideRepo(handoff.open.target, base);
      if (!existsSync(target)) errors.push(`${workflow.id}.handoff.open.target points to missing file ${handoff.open.target}`);
    } catch (error) {
      errors.push(`${workflow.id}.handoff.open.target: ${error.message}`);
    }
  }
}

function requireArtifactRef(workflow, artifactById, artifactId, label) {
  if (artifactId === null) return null;
  const artifact = artifactById.get(artifactId);
  if (!artifact) errors.push(`${workflow.id}.${label} references unknown artifact ${artifactId}`);
  return artifact;
}

function validateEvidenceRecord(workflow, recordPath) {
  const file = resolveInsideRepo(recordPath, kitRoot);
  if (!existsSync(file)) return;
  const record = readJson(file);
  if (workflow.evidence.schema === "schema/workflow-evidence.schema.json") {
    if (!validateWorkflowEvidence(record)) errors.push(`${workflow.id} workflow evidence errors: ${ajv.errorsText(validateWorkflowEvidence.errors, { separator: "; " })}`);
    else if (!record.workflowIds.includes(workflow.id)) errors.push(`${recordPath} does not name workflow ${workflow.id}`);
  } else if (workflow.evidence.schema === "schema/figma-evidence.schema.json") {
    if (!validateFigmaEvidence(record)) errors.push(`${workflow.id} Figma evidence errors: ${ajv.errorsText(validateFigmaEvidence.errors, { separator: "; " })}`);
    else if (record.workflowId !== workflow.id) errors.push(`${recordPath} names ${record.workflowId}, expected ${workflow.id}`);
  } else {
    errors.push(`${workflow.id} uses unsupported evidence schema ${workflow.evidence.schema}`);
  }
}

function isExternalTarget(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function testFixture(file) {
  const fixture = readJson(resolve(kitRoot, file));
  const candidate = fixtureCandidate(file);
  const errorCountBefore = errors.length;
  validateManifest(candidate, resolve(kitRoot, file));
  const fixtureErrors = errors.splice(errorCountBefore);
  const result = fixtureErrors.length === 0;
  if (result !== fixture.expectValid) errors.push(`${file} expected valid=${fixture.expectValid}, received ${result}`);
}

function fixtureCandidate(file) {
  const fixture = readJson(resolveInsideRepo(file, kitRoot));
  const source = readJson(resolveInsideRepo(fixture.source, kitRoot));
  const candidate = structuredClone(source);
  if (!fixture.mutation) return candidate;
  const workflow = candidate.workflows.find((item) => item.id === fixture.mutation.workflowId);
  if (!workflow) {
    errors.push(`${file} references unknown workflow ${fixture.mutation.workflowId}`);
    return candidate;
  }
  if (fixture.mutation.remove) delete workflow[fixture.mutation.remove];
  if (fixture.mutation.replaceId) workflow.id = fixture.mutation.replaceId;
  if (fixture.mutation.primaryArtifactId) workflow.handoff.primaryArtifactId = fixture.mutation.primaryArtifactId;
  return candidate;
}

function hasCanonicalIds(value) {
  if (!Array.isArray(value?.workflows)) return false;
  const ids = value.workflows.map((workflow) => workflow.id).sort();
  const expected = [...canonicalIds].sort();
  return ids.length === expected.length && ids.every((id, index) => id === expected[index]);
}

function requirePath(file, label) {
  let target;
  try {
    target = resolveInsideRepo(file, kitRoot);
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
    return;
  }
  if (!existsSync(target)) errors.push(`${label} points to missing path ${file}`);
}

function resolveInsideRepo(file, base) {
  if (typeof file !== "string" || !file.trim()) throw new Error("path must be a non-empty string");
  if (isAbsolute(file)) throw new Error(`absolute path is forbidden: ${file}`);
  const target = resolve(base, file);
  const rel = relative(repoRoot, target);
  if (rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) {
    throw new Error(`path escapes repository: ${file}`);
  }
  return target;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`validate-workflows failed: ${relative(repoRoot, file)} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

function parseArgs(values) {
  const result = { testFixtures: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--test-fixtures") result.testFixtures = true;
    else if (value === "--manifest") result.manifest = values[++index];
    else if (value === "--fixture") result.fixture = values[++index];
    else {
      console.error(`validate-workflows failed: unknown argument ${value}`);
      process.exit(1);
    }
  }
  return result;
}
