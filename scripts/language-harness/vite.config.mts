import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Harness for scripts/audit-languages.mjs: the real seller screens, rendered
// without logging in, so they can be looked at in every language in a real
// browser. Only two modules are swapped — the Supabase client and the auth
// context — so every component, hook, style and translation is the real one,
// and nothing here can read or write production.
//
// Deliberately outside public/ and outside src/: nothing in this folder ships
// or is typechecked with the app.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    // Order matters: the two specific modules must win over the "@" prefix.
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.resolve(here, "fakeSupabase.ts") },
      { find: "@/contexts/SimpleAuthContext", replacement: path.resolve(here, "fakeAuth.tsx") },
      { find: "@", replacement: path.resolve(repoRoot, "src") },
    ],
  },
  css: {
    postcss: repoRoot,
  },
  server: { port: 5198, strictPort: true },
});
