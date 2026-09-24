import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Temporary harness for scripts/audit-orange.mjs. It renders the real UI
// primitives so the scanner reads their actual computed colours instead of
// their class strings. Deliberately outside public/ — anything there ships in
// the production build.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(repoRoot, "src") },
  },
  css: {
    postcss: repoRoot,
  },
  server: { port: 5199, strictPort: true },
});
