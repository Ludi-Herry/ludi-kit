import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { inspectProjectPage } from "./ai-readable-inspect.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const kitRoot = resolve(dirname(scriptPath), "..");
const cliPath = resolve(kitRoot, "scripts/ai-readable.mjs");
const schema = JSON.parse(readFileSync(resolve(kitRoot, "schema/ai-readable-inspect-output.schema.json"), "utf8"));
const validateOutput = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
const tempRoot = mkdtempSync(join(tmpdir(), "ai-readable-cli-"));
let negativeCount = 0;

try {
  testRealProject();
  testCliProtocol();
  testNeedsClarification();
  testBlockedSandbox();
  testDesignPackDrift();
  console.log(`test-ai-readable-cli passed: real=tianshu-ops/production-inbound; negative=${negativeCount}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function testRealProject() {
  const first = inspectProjectPage({ kitRoot, projectId: "tianshu-ops", pageId: "production-inbound" });
  const second = inspectProjectPage({ kitRoot, projectId: "tianshu-ops", pageId: "production-inbound" });

  assert(first.exitCode === 0 && first.result.status === "ready", "real project should be ready");
  assert(JSON.stringify(first.result) === JSON.stringify(second.result), "inspect output should be deterministic");
  assert(first.result.page.pattern === "list-page", "real page pattern");
  assert(first.result.page.dataRequirements.includes("InboundBatch"), "InboundBatch data requirement");
  assert(first.result.page.dataRequirements.includes("Supplier"), "Supplier data requirement");
  assert(first.result.foundation.designSystem.id === "antd", "AntD foundation");
  assert(first.result.pattern.relatedRecipe === "kit/recipes/list-page.md", "list page recipe");
  assert(first.result.writePolicy.allowedWrites.length === 0, "M0 write policy stays empty");
  assert(first.result.readiness.implementation === "needs-task-contract", "implementation requires a task contract");
  assert(first.result.flows.some((flow) => flow.id === "production-forward-chain"), "selected flow");
  assertSchema(first.result, "real project output");
}

function testCliProtocol() {
  const success = runCli(["inspect", "--project", "tianshu-ops", "--page", "production-inbound", "--json"]);
  assert(success.status === 0, "CLI success exit code");
  assert(success.stderr === "", "CLI success stderr should be empty");
  const successJson = JSON.parse(success.stdout);
  assert(successJson.status === "ready", "CLI success JSON status");
  assertSchema(successJson, "CLI success output");

  const npmSuccess = runNpmCli(["inspect", "--project", "tianshu-ops", "--page", "production-inbound", "--json"]);
  assert(npmSuccess.status === 0, "npm CLI success exit code");
  assert(npmSuccess.stderr === "", "npm CLI success stderr should be empty");
  const npmJson = JSON.parse(npmSuccess.stdout);
  assert(npmJson.status === "ready", "silent npm CLI stdout should contain only JSON");
  assertSchema(npmJson, "silent npm CLI output");

  const missingPage = runCli(["inspect", "--project", "tianshu-ops", "--page", "missing-page", "--json"]);
  assert(missingPage.status === 5, "missing page exit code");
  const missingPageJson = JSON.parse(missingPage.stdout);
  assert(missingPageJson.errors[0].code === "page-not-found", "missing page error code");
  assertSchema(missingPageJson, "missing page output");
  negativeCount += 1;

  const traversal = runCli(["inspect", "--project", "../tianshu-ops", "--page", "production-inbound", "--json"]);
  assert(traversal.status === 5, "path traversal exit code");
  const traversalJson = JSON.parse(traversal.stdout);
  assert(traversalJson.errors[0].code === "invalid-argument", "path traversal error code");
  assertSchema(traversalJson, "path traversal output");
  negativeCount += 1;

  const unknown = runCli(["inspect", "--project", "tianshu-ops", "--page", "production-inbound", "--extra", "x", "--json"]);
  assert(unknown.status === 5, "unknown argument exit code");
  const unknownJson = JSON.parse(unknown.stdout);
  assert(unknownJson.errors[0].code === "unknown-argument", "unknown argument error code");
  assertSchema(unknownJson, "unknown argument output");
  negativeCount += 1;

  const missingJsonFlag = runCli(["inspect", "--project", "tianshu-ops", "--page", "production-inbound"]);
  assert(missingJsonFlag.status === 5, "missing JSON flag exit code");
  assert(missingJsonFlag.stdout === "", "missing JSON flag stdout should be empty");
  assert(missingJsonFlag.stderr.includes("--json is required in M0"), "missing JSON flag stderr message");
  negativeCount += 1;
}

function testNeedsClarification() {
  const fixture = createFixture("needs-clarification", {
    contextType: "real-product",
    requiredBeforeRealWork: ["Confirm the target user's approval boundary."]
  });
  const output = inspectProjectPage({ kitRoot: fixture, projectId: "fixture-project", pageId: "orders" });
  assert(output.exitCode === 2 && output.result.status === "needs-clarification", "clarification status");
  assert(output.result.clarifications.some((item) => item.blockingFor === "context"), "context clarification");
  assertSchema(output.result, "needs clarification output");
}

function testBlockedSandbox() {
  const fixture = createFixture("blocked", { contextType: "validation-sandbox" });
  const output = inspectProjectPage({ kitRoot: fixture, projectId: "fixture-project", pageId: "orders" });
  assert(output.exitCode === 3 && output.result.status === "blocked", "sandbox status");
  assert(output.result.readiness.implementation === "blocked", "sandbox implementation blocked");
  assertSchema(output.result, "blocked output");
}

function testDesignPackDrift() {
  const fixture = createFixture("hash-drift", { contextType: "real-product", invalidDesignPackHash: true });
  const output = inspectProjectPage({ kitRoot: fixture, projectId: "fixture-project", pageId: "orders" });
  assert(output.exitCode === 5 && output.result.status === "failed", "design pack drift status");
  assert(output.result.errors[0].code === "design-pack-hash-mismatch", "design pack drift error");
  assertSchema(output.result, "design pack drift output");
  negativeCount += 1;
}

function createFixture(name, { contextType, requiredBeforeRealWork = [], invalidDesignPackHash = false }) {
  const root = resolve(tempRoot, name, "kit");
  const projectRoot = resolve(root, "projects/fixture-project");
  for (const directory of [
    projectRoot,
    resolve(root, "foundations/design-packs"),
    resolve(root, "recipes"),
    resolve(root, "rules")
  ]) mkdirSync(directory, { recursive: true });

  writeFileSync(resolve(root, "AGENTS.md"), "# Fixture Agent Contract\n", "utf8");
  writeFileSync(resolve(projectRoot, "prd.mdx"), "# Fixture PRD\n", "utf8");
  writeFileSync(resolve(root, "recipes/list-page.md"), "# List Page\n", "utf8");
  for (const rule of ["anti-patterns", "information-architecture", "layout", "data-table"]) {
    writeFileSync(resolve(root, `rules/${rule}.md`), `# ${rule}\n`, "utf8");
  }

  const designPackPath = resolve(root, "foundations/design-packs/fixture.json");
  writeJson(designPackPath, { id: "fixture", foundationId: "local" });
  const designPackHash = sha256(readFileSync(designPackPath));

  writeJson(resolve(root, "components.manifest.json"), {
    version: "0.1.0",
    components: [
      { name: "PageLayout" },
      { name: "PageHeader" },
      { name: "FilterPanel" },
      { name: "DataSection" },
      { name: "DataGrid" },
      { name: "Button" }
    ]
  });
  writeJson(resolve(root, "patterns.manifest.json"), {
    version: "0.1.0",
    patterns: {
      "list-page": {
        layout: ["PageLayout", "PageHeader", "FilterPanel", "DataSection > DataGrid"],
        regions: [{ id: "shell", owner: "pattern", locked: true }],
        requiredComponents: ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid"],
        optionalComponents: ["Button"],
        relatedRecipe: "recipes/list-page.md",
        doNot: ["Skip the filter region"]
      }
    }
  });
  writeJson(resolve(projectRoot, "pages.json"), {
    version: "0.1.0",
    projectId: "fixture-project",
    pages: [{
      id: "orders",
      route: "/orders",
      title: "Orders",
      pattern: "list-page",
      flowIds: ["orders-flow"],
      flowCard: { userGoal: "Review orders." },
      intentCard: { pageGoal: "Find risky orders.", successCriteria: ["Filters precede the data table."] },
      componentPlan: ["PageLayout", "PageHeader", "FilterPanel", "DataSection", "DataGrid", "Button"],
      dataRequirements: ["Order"],
      layoutTree: ["PageLayout", "PageHeader", "FilterPanel", "DataSection > DataGrid"]
    }]
  });
  writeJson(resolve(projectRoot, "flows.json"), {
    version: "0.1.0",
    projectId: "fixture-project",
    flows: [{
      id: "orders-flow",
      title: "Order review",
      entry: "/orders",
      steps: [{ pageId: "orders", route: "/orders", role: "review" }]
    }]
  });
  writeJson(resolve(projectRoot, "business-context.json"), {
    version: "0.1.0",
    projectId: "fixture-project",
    contextType,
    decision: contextType === "real-product" ? "fixture-real-product" : "pipeline-only",
    product: {
      name: "Fixture Product",
      realCustomer: contextType === "real-product",
      audience: ["Operator"],
      scenario: "Review a deterministic fixture page."
    },
    sourceOfTruth: ["projects/fixture-project/prd.mdx"],
    criticalStates: ["loading", "empty", "error"],
    requiredBeforeRealWork,
    frontendFoundation: {
      outputMode: "custom-native",
      framework: { name: "react", version: "19.2.7" },
      foundation: { id: "local", displayName: "Fixture UI", version: "1.0.0", packageName: "fixture-ui" },
      distribution: "project-source",
      designPack: {
        path: "foundations/design-packs/fixture.json",
        sha256: invalidDesignPackHash ? "0".repeat(64) : designPackHash
      },
      imports: { root: "fixture-ui", allowedPackages: ["fixture-ui"], forbiddenPackages: [], namedImportsOnly: true },
      adapters: { lint: "lint.fixture", build: "build.fixture", browser: "browser.fixture", visual: "visual.fixture" }
    }
  });
  return root;
}

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: kitRoot,
    encoding: "utf8",
    windowsHide: true
  });
}

function runNpmCli(args) {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) throw new Error("test-ai-readable-cli failed: npm_execpath is unavailable");
  return spawnSync(process.execPath, [npmExecPath, "run", "--silent", "ai-readable", "--", ...args], {
    cwd: kitRoot,
    encoding: "utf8",
    windowsHide: true
  });
}

function assertSchema(value, label) {
  const valid = validateOutput(value);
  if (!valid) throw new Error(`test-ai-readable-cli failed: ${label} schema errors: ${JSON.stringify(validateOutput.errors)}`);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(`test-ai-readable-cli failed: ${message}`);
}
