import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "map-three";
          if (id.includes("node_modules/gsap")) return "map-motion";
          if (id.includes("node_modules/react")) return "react-runtime";
        },
      },
    },
  },
});
