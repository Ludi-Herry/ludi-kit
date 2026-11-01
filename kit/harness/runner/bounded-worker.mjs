import { Worker } from "node:worker_threads";

export const DEFAULT_WORKER_TIMEOUT_MS = 45_000;
export const DEFAULT_WORKER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 512
});

function sanitizeWorkerMessage(value) {
  const normalized = String(value ?? "worker failed")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer <redacted>")
    .replace(/\b(token|secret|password|authorization|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=<redacted>")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  return normalized.length > 500 ? `${normalized.slice(0, 500)}… <truncated>` : normalized;
}

export function runBoundedWorker({
  workerUrl,
  workerData,
  timeoutMs = DEFAULT_WORKER_TIMEOUT_MS,
  resourceLimits = DEFAULT_WORKER_RESOURCE_LIMITS,
  stdout = process.stdout,
  stderr = process.stderr
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.resolve({ kind: "error", exitCode: 1, message: "worker timeout must be a positive integer" });
  }

  return new Promise((resolveResult) => {
    const startedAt = performance.now();
    let worker;
    let settled = false;
    let timer;

    const resultWithDuration = (result) => ({
      ...result,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    });
    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveResult(resultWithDuration(result));
    };

    try {
      worker = new Worker(workerUrl, {
        resourceLimits,
        stderr: true,
        stdout: true,
        workerData
      });
    } catch (error) {
      settle({
        kind: "error",
        exitCode: 1,
        message: sanitizeWorkerMessage(error instanceof Error ? error.message : error)
      });
      return;
    }

    worker.stdout.on("data", (chunk) => stdout?.write(chunk));
    worker.stderr.on("data", (chunk) => stderr?.write(chunk));

    worker.once("error", (error) => {
      if (error?.code === "ERR_WORKER_OUT_OF_MEMORY") {
        settle({ kind: "memory", exitCode: 1 });
        return;
      }
      settle({
        kind: "error",
        exitCode: 1,
        message: sanitizeWorkerMessage(error instanceof Error ? error.message : error)
      });
    });
    worker.once("exit", (exitCode) => settle({ kind: "completed", exitCode }));

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate().then(
        () => resolveResult(resultWithDuration({ kind: "timeout", exitCode: 1 })),
        () => resolveResult(resultWithDuration({ kind: "timeout", exitCode: 1 }))
      );
    }, timeoutMs);
  });
}
