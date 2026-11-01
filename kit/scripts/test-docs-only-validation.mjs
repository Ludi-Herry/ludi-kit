import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { collectStagedPaths, validateDocsOnly } from "./validate-docs-only.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "ai-readable-docs-validation-"));
let negativeCount = 0;

try {
  testValidDocs();
  testMixedScope();
  testBrokenLink();
  testBrokenAnchor();
  testDeletedInboundReference();
  testStagedContentIsolation();
  testWhitespaceFailure();
  console.log(`test-docs-only-validation passed: staged-content=exact; external-links=accepted; negative=${negativeCount}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function testValidDocs() {
  const root = createRepository("valid");
  writeFileSync(
    resolve(root, "docs/source.md"),
    "# Source\n\n[Target](./target.md#target)\n\n[External](https://example.com/path#anchor)\n",
    "utf8"
  );
  git(root, ["add", "--", "docs/source.md"]);
  const paths = collectStagedPaths(root);
  const result = validateDocsOnly({ repositoryRoot: root, paths, source: "staged", runProjectGates: false });
  assert(result.changedPaths.length === 1 && result.deletedPaths.length === 0, "valid staged docs");
}

function testMixedScope() {
  const root = createRepository("mixed");
  writeFileSync(resolve(root, "docs/source.md"), "# Changed\n", "utf8");
  writeFileSync(resolve(root, "kit/change.mjs"), "export {};\n", "utf8");
  git(root, ["add", "--", "docs/source.md", "kit/change.mjs"]);
  expectFailure(root, "docs-only scope violation");
}

function testBrokenLink() {
  const root = createRepository("broken-link");
  writeFileSync(resolve(root, "docs/source.md"), "# Source\n\n[Missing](./missing.md)\n", "utf8");
  git(root, ["add", "--", "docs/source.md"]);
  expectFailure(root, "broken relative link");
}

function testBrokenAnchor() {
  const root = createRepository("broken-anchor");
  writeFileSync(resolve(root, "docs/source.md"), "# Source\n\n[Target](./target.md#missing-heading)\n", "utf8");
  git(root, ["add", "--", "docs/source.md"]);
  expectFailure(root, "broken heading anchor");
}

function testDeletedInboundReference() {
  const root = createRepository("deleted-reference");
  rmSync(resolve(root, "docs/target.md"), { force: true });
  git(root, ["add", "-u", "--", "docs/target.md"]);
  expectFailure(root, "still links to deleted document");
}

function testStagedContentIsolation() {
  const root = createRepository("staged-isolation");
  writeFileSync(resolve(root, "docs/source.md"), "# Source\n\n[Target](./target.md#target)\n\nStaged change.\n", "utf8");
  git(root, ["add", "--", "docs/source.md"]);
  writeFileSync(resolve(root, "docs/source.md"), "# Source\n\n[Missing](./unstaged-missing.md)\n", "utf8");
  const paths = collectStagedPaths(root);
  validateDocsOnly({ repositoryRoot: root, paths, source: "staged", runProjectGates: false });
}

function testWhitespaceFailure() {
  const root = createRepository("whitespace");
  writeFileSync(resolve(root, "docs/source.md"), "# Source  \n", "utf8");
  git(root, ["add", "--", "docs/source.md"]);
  expectFailure(root, "trailing whitespace");
}

function expectFailure(repositoryRoot, expectedMessage) {
  const paths = collectStagedPaths(repositoryRoot);
  let message = "";
  try {
    validateDocsOnly({ repositoryRoot, paths, source: "staged", runProjectGates: false });
  } catch (error) {
    message = error.message;
  }
  assert(message.includes(expectedMessage), `expected failure containing ${expectedMessage}, received ${message || "success"}`);
  negativeCount += 1;
}

function createRepository(name) {
  const root = resolve(tempRoot, name);
  mkdirSync(resolve(root, "docs"), { recursive: true });
  mkdirSync(resolve(root, "kit"), { recursive: true });
  writeFileSync(resolve(root, "docs/source.md"), "# Source\n\n[Target](./target.md#target)\n", "utf8");
  writeFileSync(resolve(root, "docs/target.md"), "# Target\n", "utf8");
  writeFileSync(resolve(root, "kit/AGENTS.md"), "# Contract\n", "utf8");
  git(root, ["init"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["add", "--", "."]);
  git(root, ["commit", "-m", "fixture"]);
  return root;
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(`test-docs-only-validation failed: ${message}`);
}
