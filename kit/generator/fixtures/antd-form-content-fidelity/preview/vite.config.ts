import { fileURLToPath, URL } from "node:url";

export default {
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    strictPort: true
  }
};
