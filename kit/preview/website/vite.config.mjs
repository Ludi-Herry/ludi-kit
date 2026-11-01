import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 5403, strictPort: true, fs: { allow: [root] } },
  build: { outDir: 'dist', emptyOutDir: false, sourcemap: false },
  resolve: { dedupe: ['react', 'react-dom'] }
});
