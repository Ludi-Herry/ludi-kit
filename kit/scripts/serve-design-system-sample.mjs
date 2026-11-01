import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(kitRoot, "design-systems/ops-canvas/spec");
const port = parsePort(process.argv.slice(2));
const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") return send(response, 405, "Method not allowed");
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = resolve(root, relativePath);
    const rel = relative(root, file);
    if (rel === ".." || rel.startsWith(`..\\`) || rel.startsWith("../")) return send(response, 404, "Not found");
    const type = contentTypes[extname(file)];
    if (!type) return send(response, 404, "Not found");
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "Content-Length": body.length });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    send(response, 404, "Not found");
  }
});

server.listen(port, "127.0.0.1", () => console.log(`ops-canvas server: http://127.0.0.1:${port}/`));

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

function parsePort(args) {
  if (args.length !== 2 || args[0] !== "--port") throw new Error("Usage: node scripts/serve-design-system-sample.mjs --port <1024-65535>");
  const value = Number(args[1]);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error("Port must be an integer from 1024 to 65535");
  return value;
}
