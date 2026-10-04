import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

function aliasSupabaseEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), "");
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "";
  const projectId =
    env.VITE_SUPABASE_PROJECT_ID ||
    env.NEXT_PUBLIC_SUPABASE_PROJECT_ID ||
    url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
    "";

  if (url) process.env.VITE_SUPABASE_URL = url;
  if (key) process.env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
  if (projectId) process.env.VITE_SUPABASE_PROJECT_ID = projectId;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  aliasSupabaseEnv(mode);

  return {
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    allowedHosts: [".trycloudflare.com"],
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      includeAssets: [
        "favicon.ico",
        "favicon-32.png",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
      ],
      registerType: "autoUpdate",
      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/functions/, /^\/firebase-messaging-sw\.js/],
        runtimeCaching: [
          {
            // Supabase REST API
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // Supabase Storage images
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
            },
          },
          {
            // Google Fonts webfonts
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
      manifest: {
        id: "/",
        name: "Dostup",
        short_name: "Dostup",
        description: "Доступ к курсам и материалам",
        start_url: "/?standalone=true",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#f97316",
        orientation: "portrait-primary",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
});
