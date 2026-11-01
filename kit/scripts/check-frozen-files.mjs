import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One generic tamper check for frozen history. Every frozen set lives in
// quality/frozen-files.json; a new freeze adds one set there (see --freeze)
// instead of a new validator script.

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(kitRoot, "..");
const registryPath = resolve(kitRoot, "quality/frozen-files.json");
const REGISTRY_VERSION = "1.0.0";
const GIT_BASELINE_ALGORITHM = "sha256-sorted-git-path-null-blob-oid-v1";

const argv = process.argv.slice(2);

if (argv[0] === "--freeze") {
  freeze(argv[1], argv.slice(2));
} else {
  const unknown = argv.filter((value) => value !== "--test-fixtures" && value !== "--report-only");
  if (unknown.length) fail(`unknown argument ${unknown[0]}`);
  run({ testFixtures: argv.includes("--test-fixtures"), reportOnly: argv.includes("--report-only") });
}

function run({ testFixtures, reportOnly }) {
  const registry = readRegistry();
  const io = realIo();
  const errors = [];
  const summary = [];
  for (const set of registry.sets) {
    const result = checkSet(set, io);
    errors.push(...result.errors.map((error) => `${set.id}: ${error}`));
    summary.push(`${set.id}=${result.checked}`);
  }
  if (testFixtures) errors.push(...runNegativeFixtures(registry, io));

  const label = reportOnly ? "check-frozen-files (report-only)" : "check-frozen-files";
  if (errors.length) {
    for (const error of errors) console.error(`${label} failed: ${error}`);
    if (!reportOnly) process.exit(1);
    return;
  }
  const fixtureNote = testFixtures ? "; negative fixtures rejected" : "";
  console.log(`${label} passed: ${summary.join(", ")}${fixtureNote}`);
}

function checkSet(set, io) {
  switch (set.mode) {
    case "git-baseline": return checkGitBaseline(set, io);
    case "sha256-list": return checkSha256List(set, io);
    case "json-entries": return checkJsonEntries(set, io);
    default: return { checked: 0, errors: [`unknown mode ${set.mode}`] };
  }
}

// Same algorithm as the historical Image2 guard: files present at the baseline
// commit under the prefixes must keep their exact blob bytes. New files under
// the prefixes are allowed (append-only records).
function checkGitBaseline(set, io) {
  const errors = [];
  if (set.algorithm !== GIT_BASELINE_ALGORITHM) return { checked: 0, errors: [`unsupported algorithm ${set.algorithm}`] };
  let entries;
  try {
    entries = io.gitLsTree(set.baselineCommit, set.protectedPrefixes);
  } catch (error) {
    return { checked: 0, errors: [`cannot read baseline commit: ${error.message}`] };
  }
  const digest = sha256(entries.map((entry) => `${entry.path}\0${entry.oid}\n`).join(""));
  if (entries.length !== set.fileCount) errors.push(`baseline file count drifted: ${entries.length}`);
  if (digest !== set.digest) errors.push(`baseline digest drifted: ${digest}`);
  for (const entry of entries) {
    const bytes = io.readFile(entry.path);
    if (bytes === null) errors.push(`protected file is missing: ${entry.path}`);
    else if (gitBlobOid(bytes) !== entry.oid) errors.push(`protected file changed: ${entry.path}`);
  }
  return { checked: entries.length, errors };
}

// Explicit file receipts. exactRoots additionally forbid any file under those
// directories that is not listed.
function checkSha256List(set, io) {
  const errors = [];
  for (const file of set.files) {
    const bytes = io.readFile(file.path);
    if (bytes === null) errors.push(`protected file is missing: ${file.path}`);
    else if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) errors.push(`protected file changed: ${file.path}`);
  }
  const listed = new Set(set.files.map((file) => file.path));
  for (const root of set.exactRoots ?? []) {
    let actual;
    try {
      actual = io.listFiles(root);
    } catch (error) {
      errors.push(error.message);
      continue;
    }
    for (const path of actual) {
      if (!listed.has(path)) errors.push(`unexpected file in frozen root: ${path}`);
    }
  }
  return { checked: set.files.length, errors };
}

// Frozen entries inside a file that legitimately keeps growing, compared as
// canonical JSON (sorted keys, 2-space indent, trailing newline).
function checkJsonEntries(set, io) {
  const errors = [];
  const bytes = io.readFile(set.file);
  if (bytes === null) return { checked: 0, errors: [`protected file is missing: ${set.file}`] };
  let items;
  try {
    items = JSON.parse(bytes.toString("utf8"))[set.arrayKey];
  } catch (error) {
    return { checked: 0, errors: [`${set.file} is not valid JSON: ${error.message}`] };
  }
  if (!Array.isArray(items)) return { checked: 0, errors: [`${set.file} has no array ${set.arrayKey}`] };
  for (const expected of set.entries) {
    const item = items.find((candidate) => candidate?.[set.idKey] === expected.id);
    if (!item) {
      errors.push(`protected entry is missing: ${expected.id}`);
      continue;
    }
    const canonical = canonicalJsonBytes(item);
    if (canonical.length !== expected.canonicalBytes || sha256(canonical) !== expected.sha256) {
      errors.push(`protected entry changed: ${expected.id}`);
    }
  }
  return { checked: set.entries.length, errors };
}

function runNegativeFixtures(registry, io) {
  const errors = [];
  const pick = (mode) => registry.sets.find((set) => set.mode === mode);
  const flipFirstByte = (bytes) => {
    const copy = Buffer.from(bytes);
    copy[0] ^= 0xff;
    return copy;
  };
  const cases = [];
  const gitSet = pick("git-baseline");
  if (gitSet) {
    const target = io.gitLsTree(gitSet.baselineCommit, gitSet.protectedPrefixes)[0].path;
    cases.push(["git-baseline byte flip", gitSet, withFile(io, target, (bytes) => flipFirstByte(bytes))]);
    cases.push(["git-baseline missing file", gitSet, withFile(io, target, () => null)]);
  }
  const listSet = registry.sets.find((set) => set.mode === "sha256-list" && set.exactRoots?.length);
  if (listSet) {
    cases.push(["sha256-list byte flip", listSet, withFile(io, listSet.files[0].path, (bytes) => flipFirstByte(bytes))]);
    const root = listSet.exactRoots[0];
    cases.push(["sha256-list extra file", listSet, { ...io, listFiles: (dir) => [...io.listFiles(dir), ...(dir === root ? [`${root}/unexpected.json`] : [])] }]);
  }
  const entrySet = pick("json-entries");
  if (entrySet) {
    cases.push(["json-entries field change", entrySet, withFile(io, entrySet.file, (bytes) => {
      const document = JSON.parse(bytes.toString("utf8"));
      const item = document[entrySet.arrayKey].find((candidate) => candidate[entrySet.idKey] === entrySet.entries[0].id);
      item.tamperedByFixture = true;
      return Buffer.from(JSON.stringify(document));
    })]);
  }
  if (cases.length < 3) errors.push("negative fixtures need git-baseline, sha256-list with exactRoots, and json-entries sets");
  for (const [name, set, mutatedIo] of cases) {
    if (checkSet(set, mutatedIo).errors.length === 0) errors.push(`negative fixture unexpectedly passed: ${name}`);
  }
  return errors;
}

function withFile(io, target, mutate) {
  return { ...io, readFile: (path) => (path === target ? mutate(io.readFile(path)) : io.readFile(path)) };
}

function realIo() {
  return {
    readFile(path) {
      const file = resolve(repositoryRoot, path);
      return existsSync(file) ? readFileSync(file) : null;
    },
    listFiles(root) {
      const directory = resolve(repositoryRoot, root);
      if (!existsSync(directory) || !lstatSync(directory).isDirectory()) throw new Error(`frozen root is missing: ${root}`);
      const files = [];
      walk(directory);
      return files.sort();

      function walk(current) {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
          const path = resolve(current, entry.name);
          const stat = lstatSync(path);
          if (stat.isSymbolicLink()) throw new Error(`frozen root contains a symbolic link: ${repoRelative(path)}`);
          if (stat.isDirectory()) walk(path);
          else if (stat.isFile()) files.push(repoRelative(path));
          else throw new Error(`frozen root contains a non-file entry: ${repoRelative(path)}`);
        }
      }
    },
    gitLsTree(commit, prefixes) {
      const output = execFileSync("git", ["ls-tree", "-r", commit, "--", ...prefixes], { cwd: repositoryRoot, encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26 });
      return output.trim().split(/\r?\n/).filter(Boolean).map((line) => {
        const match = line.match(/^\d+ blob ([0-9a-f]{40})\t(.+)$/);
        if (!match) throw new Error(`unexpected git ls-tree record: ${line}`);
        return { oid: match[1], path: match[2] };
      }).sort((left, right) => left.path.localeCompare(right.path));
    }
  };
}

function freeze(id, paths) {
  if (!id || !/^[a-z0-9][a-z0-9.-]*$/.test(id) || paths.length === 0) {
    fail("usage: node scripts/check-frozen-files.mjs --freeze <set-id> <file> [file...]");
  }
  const registry = readRegistry();
  if (registry.sets.some((set) => set.id === id)) fail(`set ${id} already exists; frozen sets are append-only`);
  const files = [...new Set(paths.map((path) => repoRelative(resolve(process.cwd(), path))))].sort().map((path) => {
    const file = resolve(repositoryRoot, path);
    if (!existsSync(file) || !lstatSync(file).isFile()) fail(`not a regular file: ${path}`);
    const bytes = readFileSync(file);
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  registry.sets.push({ id, mode: "sha256-list", frozenAt: new Date().toISOString().slice(0, 10), files });
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`check-frozen-files: froze ${files.length} file(s) as ${id}`);
}

function readRegistry() {
  let registry;
  try {
    registry = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch (error) {
    fail(`cannot read quality/frozen-files.json: ${error.message}`);
  }
  if (registry.version !== REGISTRY_VERSION) fail(`unsupported registry version ${registry.version}`);
  if (!Array.isArray(registry.sets) || registry.sets.length === 0) fail("registry has no sets");
  const ids = registry.sets.map((set) => set.id);
  if (new Set(ids).size !== ids.length) fail("registry set ids must be unique");
  return registry;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(sortValue(value), null, 2)}\n`, "utf8");
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function repoRelative(path) {
  return relative(repositoryRoot, path).replaceAll("\\", "/");
}

function fail(message) {
  console.error(`check-frozen-files failed: ${message}`);
  process.exit(1);
}
