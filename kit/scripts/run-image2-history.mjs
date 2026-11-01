import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Replays the closed-round Image2 gates exactly as they ran at the snapshot
// commit recorded in the anchor registry. The snapshot is checked out as a
// temporary detached worktree under kit/ so its scripts resolve kit/node_modules
// by walking up. This proves the historical verdicts still reproduce; tamper
// protection of the current tree belongs to validate:integrity.

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(resolve(kitRoot, "quality/image2-history-anchor-registry.json"), "utf8"));
if (registry.version !== "1.1.0" || !registry.historyReplay?.snapshotCommit || !registry.historyReplay.commands?.length) {
  console.error(`run-image2-history: unsupported anchor registry ${registry.version}`);
  process.exit(1);
}

const { snapshotCommit, commands } = registry.historyReplay;
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: kitRoot, encoding: "utf8" }).trim();
const replayRoot = resolve(kitRoot, `.tmp-image2-history-${Date.now()}`);
if (existsSync(replayRoot)) {
  console.error(`run-image2-history: refusing to reuse ${replayRoot}`);
  process.exit(1);
}

execFileSync("git", ["worktree", "add", "--detach", replayRoot, snapshotCommit], { cwd: repoRoot, stdio: "inherit" });
let status = 0;
try {
  for (const command of commands) {
    const result = spawnSync("npm", ["run", command], { cwd: resolve(replayRoot, "kit"), stdio: "inherit", shell: process.platform === "win32" });
    if (result.status !== 0) {
      console.error(`run-image2-history failed: ${command} exited ${result.status} at ${snapshotCommit}`);
      status = result.status ?? 1;
      break;
    }
  }
  if (status === 0) console.log(`run-image2-history passed: ${commands.length} historical gate commands at ${snapshotCommit.slice(0, 7)}`);
} finally {
  const removal = spawnSync("git", ["worktree", "remove", "--force", replayRoot], { cwd: repoRoot, stdio: "inherit" });
  if (removal.status !== 0 || existsSync(replayRoot)) {
    console.error(`run-image2-history: temporary worktree was not fully removed: ${replayRoot}`);
    status = status || 1;
  }
}
process.exit(status);
