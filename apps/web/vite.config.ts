import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the build under /<repo>/ when the repo is not a
// user/org root pages repo. This base path keeps asset URLs correct in
// production. For root-level deploys, override via `VITE_BASE=/`.
const base = process.env.VITE_BASE ?? "/globe-watch/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
