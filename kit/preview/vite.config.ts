import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { EDITOR_PORT, editorPlugin } from "./editor-server/plugin.mjs";

export default defineConfig(({ command }) => ({
  plugins: [...(command === "serve" ? [editorPlugin(new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))] : []), react()],
  server: { host: "127.0.0.1", port: EDITOR_PORT, strictPort: true },
  resolve: {
    dedupe: ["react", "react-dom", "antd", "@ant-design/icons"]
  }
}));
