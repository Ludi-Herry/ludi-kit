import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { collectJavaScriptFiles, measureBundleTarget, runBundleCheck } from "../../scripts/check-bundle.mjs";

const root = process.cwd();
const emptyTarget = { dist: "harness/tests/fixtures/bundle/empty", maxGzipKb: 1 };
const nestedTarget = { dist: "harness/tests/fixtures/bundle/nested", maxGzipKb: 1 };

assert.throws(() => measureBundleTarget(root, emptyTarget), /no JavaScript assets found/);
console.log("PASS zero JavaScript assets fail closed");

const files = collectJavaScriptFiles(resolve(root, nestedTarget.dist));
assert.equal(files.length, 1);
assert.match(files[0].replaceAll("\\", "/"), /nested\/assets\/chunk\.mjs$/);
console.log("PASS nested mjs asset is measured");

const messages = [];
assert.equal(
  runBundleCheck({
    root,
    budget: { targets: { fixture: nestedTarget } },
    names: ["fixture"],
    log: (message) => messages.push(message),
    error: (message) => messages.push(message)
  }),
  0
);
assert.ok(messages.some((message) => message.includes("1 js file(s)")));
console.log("PASS recursive bundle target stays within budget");

assert.equal(
  runBundleCheck({
    root,
    budget: { targets: { empty: emptyTarget } },
    names: ["empty"],
    log: () => {},
    error: () => {}
  }),
  1
);
console.log("PASS bundle check result is non-zero for empty output");

const symbolicLinkEntry = {
  name: "escaped.js",
  isSymbolicLink: () => true,
  isDirectory: () => false,
  isFile: () => false
};
assert.throws(
  () => collectJavaScriptFiles(resolve(root, nestedTarget.dist), { readDirectory: () => [symbolicLinkEntry] }),
  /symbolic links are forbidden/
);
console.log("PASS symbolic links fail closed");

assert.throws(
  () => collectJavaScriptFiles(resolve(root, nestedTarget.dist), {
    inspectPath: () => ({ isSymbolicLink: () => true }),
    readDirectory: () => []
  }),
  /symbolic links are forbidden/
);
console.log("PASS symbolic link bundle root fails closed");

const uppercaseEntry = {
  name: "chunk.MJS",
  isSymbolicLink: () => false,
  isDirectory: () => false,
  isFile: () => true
};
assert.equal(
  collectJavaScriptFiles(resolve(root, nestedTarget.dist), {
    inspectPath: () => ({ isSymbolicLink: () => false }),
    readDirectory: () => [uppercaseEntry]
  }).length,
  1
);
console.log("PASS uppercase JavaScript extensions are measured");

assert.throws(
  () => measureBundleTarget(root, { dist: nestedTarget.dist }),
  /maxGzipKb must be a finite positive number/
);
console.log("PASS invalid bundle budget fails closed");

const packCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const packArgs = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm.cmd pack --dry-run --json"]
  : ["pack", "--dry-run", "--json"];
const pack = spawnSync(packCommand, packArgs, {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
  shell: false,
  windowsHide: true
});
assert.equal(pack.status, 0, `${pack.error?.message ?? ""}\n${pack.stdout ?? ""}\n${pack.stderr ?? ""}`);
const packFiles = JSON.parse(pack.stdout)[0].files.map((entry) => entry.path.replaceAll("\\", "/"));
assert.equal(packFiles.some((path) => /^harness\/reports\/.*\.json$/i.test(path)), false);
assert.equal(packFiles.some((path) => path.startsWith("harness/tests/")), false);
assert.ok(packFiles.includes("harness/runner/run-scenario.mjs"));
assert.ok(packFiles.includes("schema/harness-scenario.schema.json"));
console.log("PASS package excludes generated reports and harness tests");
console.log("Bundle tests passed: 9");
