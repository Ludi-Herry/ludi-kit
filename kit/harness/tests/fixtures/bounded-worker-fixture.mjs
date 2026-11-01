import { workerData } from "node:worker_threads";

const mode = workerData?.mode;

if (mode === "hang") {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
} else if (mode === "memory") {
  const retained = [];
  while (true) retained.push(new Array(250_000).fill(retained.length));
} else if (mode === "error") {
  throw new Error("worker fixture failed token=worker-secret");
}
