// vite.config.ts
import { defineConfig, loadEnv } from "file:///D:/Dostup/dostup/node_modules/vite/dist/node/index.js";
import react from "file:///D:/Dostup/dostup/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///D:/Dostup/dostup/node_modules/lovable-tagger/dist/index.js";
import { VitePWA } from "file:///D:/Dostup/dostup/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "D:\\Dostup\\dostup";
function aliasSupabaseEnv(mode) {
  const env = loadEnv(mode, process.cwd(), "");
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  const projectId = env.VITE_SUPABASE_PROJECT_ID || env.NEXT_PUBLIC_SUPABASE_PROJECT_ID || url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1] || "";
  if (url) process.env.VITE_SUPABASE_URL = url;
  if (key) process.env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
  if (projectId) process.env.VITE_SUPABASE_PROJECT_ID = projectId;
}
var vite_config_default = defineConfig(({ mode }) => {
  aliasSupabaseEnv(mode);
  return {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    server: {
      host: "::",
      port: 8080,
      strictPort: true
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
          "icon-maskable-512.png"
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
                  maxAgeSeconds: 60 * 60 * 24
                  // 24 hours
                },
                networkTimeoutSeconds: 10
              }
            },
            {
              // Supabase Storage images
              urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/.*/,
              handler: "CacheFirst",
              options: {
                cacheName: "supabase-storage-cache",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                  // 30 days
                }
              }
            },
            {
              // Google Fonts stylesheets
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "google-fonts-stylesheets"
              }
            },
            {
              // Google Fonts webfonts
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-webfonts",
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                  // 1 year
                }
              }
            }
          ]
        },
        manifest: {
          id: "/",
          name: "Dostup",
          short_name: "Dostup",
          description: "\u0414\u043E\u0441\u0442\u0443\u043F \u043A \u043A\u0443\u0440\u0441\u0430\u043C \u0438 \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u0430\u043C",
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
              purpose: "any"
            },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any"
            },
            {
              src: "/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ]
        }
      })
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxEb3N0dXBcXFxcZG9zdHVwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxEb3N0dXBcXFxcZG9zdHVwXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9Eb3N0dXAvZG9zdHVwL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSBcInZpdGVcIjtcclxuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcclxuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcclxuaW1wb3J0IHsgY29tcG9uZW50VGFnZ2VyIH0gZnJvbSBcImxvdmFibGUtdGFnZ2VyXCI7XHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tIFwidml0ZS1wbHVnaW4tcHdhXCI7XHJcblxyXG5mdW5jdGlvbiBhbGlhc1N1cGFiYXNlRW52KG1vZGU6IHN0cmluZykge1xyXG4gIGNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgXCJcIik7XHJcbiAgY29uc3QgdXJsID0gZW52LlZJVEVfU1VQQUJBU0VfVVJMIHx8IGVudi5ORVhUX1BVQkxJQ19TVVBBQkFTRV9VUkwgfHwgXCJcIjtcclxuICBjb25zdCBrZXkgPVxyXG4gICAgZW52LlZJVEVfU1VQQUJBU0VfUFVCTElTSEFCTEVfS0VZIHx8XHJcbiAgICBlbnYuVklURV9TVVBBQkFTRV9BTk9OX0tFWSB8fFxyXG4gICAgZW52Lk5FWFRfUFVCTElDX1NVUEFCQVNFX0FOT05fS0VZIHx8XHJcbiAgICBlbnYuTkVYVF9QVUJMSUNfU1VQQUJBU0VfUFVCTElTSEFCTEVfS0VZIHx8XHJcbiAgICBcIlwiO1xyXG4gIGNvbnN0IHByb2plY3RJZCA9XHJcbiAgICBlbnYuVklURV9TVVBBQkFTRV9QUk9KRUNUX0lEIHx8XHJcbiAgICBlbnYuTkVYVF9QVUJMSUNfU1VQQUJBU0VfUFJPSkVDVF9JRCB8fFxyXG4gICAgdXJsLm1hdGNoKC9eaHR0cHM6XFwvXFwvKFteLl0rKVxcLnN1cGFiYXNlXFwuY28vKT8uWzFdIHx8XHJcbiAgICBcIlwiO1xyXG5cclxuICBpZiAodXJsKSBwcm9jZXNzLmVudi5WSVRFX1NVUEFCQVNFX1VSTCA9IHVybDtcclxuICBpZiAoa2V5KSBwcm9jZXNzLmVudi5WSVRFX1NVUEFCQVNFX1BVQkxJU0hBQkxFX0tFWSA9IGtleTtcclxuICBpZiAocHJvamVjdElkKSBwcm9jZXNzLmVudi5WSVRFX1NVUEFCQVNFX1BST0pFQ1RfSUQgPSBwcm9qZWN0SWQ7XHJcbn1cclxuXHJcbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+IHtcclxuICBhbGlhc1N1cGFiYXNlRW52KG1vZGUpO1xyXG5cclxuICByZXR1cm4ge1xyXG4gIGVudlByZWZpeDogW1wiVklURV9cIiwgXCJORVhUX1BVQkxJQ19cIl0sXHJcbiAgc2VydmVyOiB7XHJcbiAgICBob3N0OiBcIjo6XCIsXHJcbiAgICBwb3J0OiA4MDgwLFxyXG4gICAgc3RyaWN0UG9ydDogdHJ1ZSxcclxuICB9LFxyXG4gIHBsdWdpbnM6IFtcclxuICAgIHJlYWN0KCksXHJcbiAgICBtb2RlID09PSBcImRldmVsb3BtZW50XCIgJiYgY29tcG9uZW50VGFnZ2VyKCksXHJcbiAgICBWaXRlUFdBKHtcclxuICAgICAgaW5jbHVkZUFzc2V0czogW1xyXG4gICAgICAgIFwiZmF2aWNvbi5pY29cIixcclxuICAgICAgICBcImZhdmljb24tMzIucG5nXCIsXHJcbiAgICAgICAgXCJhcHBsZS10b3VjaC1pY29uLnBuZ1wiLFxyXG4gICAgICAgIFwiaWNvbi0xOTIucG5nXCIsXHJcbiAgICAgICAgXCJpY29uLTUxMi5wbmdcIixcclxuICAgICAgICBcImljb24tbWFza2FibGUtNTEyLnBuZ1wiLFxyXG4gICAgICBdLFxyXG4gICAgICByZWdpc3RlclR5cGU6IFwiYXV0b1VwZGF0ZVwiLFxyXG4gICAgICB3b3JrYm94OiB7XHJcbiAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDYgKiAxMDI0ICogMTAyNCxcclxuICAgICAgICBza2lwV2FpdGluZzogdHJ1ZSxcclxuICAgICAgICBjbGllbnRzQ2xhaW06IHRydWUsXHJcbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbXCIqKi8qLntqcyxjc3MsaHRtbCxpY28scG5nLHN2Zyx3b2ZmLHdvZmYyfVwiXSxcclxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiBcIi9pbmRleC5odG1sXCIsXHJcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFja0RlbnlsaXN0OiBbL15cXC9hcGkvLCAvXlxcL2Z1bmN0aW9ucy8sIC9eXFwvZmlyZWJhc2UtbWVzc2FnaW5nLXN3XFwuanMvXSxcclxuICAgICAgICBydW50aW1lQ2FjaGluZzogW1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICAvLyBTdXBhYmFzZSBSRVNUIEFQSVxyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcLy4qXFwuc3VwYWJhc2VcXC5jb1xcL3Jlc3RcXC92MVxcLy4qLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogXCJOZXR3b3JrRmlyc3RcIixcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJzdXBhYmFzZS1hcGktY2FjaGVcIixcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiAxMDAsXHJcbiAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQsIC8vIDI0IGhvdXJzXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICBuZXR3b3JrVGltZW91dFNlY29uZHM6IDEwLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgLy8gU3VwYWJhc2UgU3RvcmFnZSBpbWFnZXNcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL15odHRwczpcXC9cXC8uKlxcLnN1cGFiYXNlXFwuY29cXC9zdG9yYWdlXFwvdjFcXC9vYmplY3RcXC8uKi8sXHJcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcInN1cGFiYXNlLXN0b3JhZ2UtY2FjaGVcIixcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiA1MCxcclxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDMwLCAvLyAzMCBkYXlzXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIC8vIEdvb2dsZSBGb250cyBzdHlsZXNoZWV0c1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL2ZvbnRzXFwuZ29vZ2xlYXBpc1xcLmNvbVxcLy4qLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogXCJTdGFsZVdoaWxlUmV2YWxpZGF0ZVwiLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImdvb2dsZS1mb250cy1zdHlsZXNoZWV0c1wiLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgLy8gR29vZ2xlIEZvbnRzIHdlYmZvbnRzXHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvZm9udHNcXC5nc3RhdGljXFwuY29tXFwvLiovLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiBcIkNhY2hlRmlyc3RcIixcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJnb29nbGUtZm9udHMtd2ViZm9udHNcIixcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiAzMCxcclxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSwgLy8gMSB5ZWFyXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSxcclxuICAgICAgbWFuaWZlc3Q6IHtcclxuICAgICAgICBpZDogXCIvXCIsXHJcbiAgICAgICAgbmFtZTogXCJEb3N0dXBcIixcclxuICAgICAgICBzaG9ydF9uYW1lOiBcIkRvc3R1cFwiLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlx1MDQxNFx1MDQzRVx1MDQ0MVx1MDQ0Mlx1MDQ0M1x1MDQzRiBcdTA0M0EgXHUwNDNBXHUwNDQzXHUwNDQwXHUwNDQxXHUwNDMwXHUwNDNDIFx1MDQzOCBcdTA0M0NcdTA0MzBcdTA0NDJcdTA0MzVcdTA0NDBcdTA0MzhcdTA0MzBcdTA0M0JcdTA0MzBcdTA0M0NcIixcclxuICAgICAgICBzdGFydF91cmw6IFwiLz9zdGFuZGFsb25lPXRydWVcIixcclxuICAgICAgICBzY29wZTogXCIvXCIsXHJcbiAgICAgICAgZGlzcGxheTogXCJzdGFuZGFsb25lXCIsXHJcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogXCIjZmZmZmZmXCIsXHJcbiAgICAgICAgdGhlbWVfY29sb3I6IFwiI2Y5NzMxNlwiLFxyXG4gICAgICAgIG9yaWVudGF0aW9uOiBcInBvcnRyYWl0LXByaW1hcnlcIixcclxuICAgICAgICBpY29uczogW1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6IFwiL2ljb24tMTkyLnBuZ1wiLFxyXG4gICAgICAgICAgICBzaXplczogXCIxOTJ4MTkyXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiaW1hZ2UvcG5nXCIsXHJcbiAgICAgICAgICAgIHB1cnBvc2U6IFwiYW55XCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6IFwiL2ljb24tNTEyLnBuZ1wiLFxyXG4gICAgICAgICAgICBzaXplczogXCI1MTJ4NTEyXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiaW1hZ2UvcG5nXCIsXHJcbiAgICAgICAgICAgIHB1cnBvc2U6IFwiYW55XCIsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBzcmM6IFwiL2ljb24tbWFza2FibGUtNTEyLnBuZ1wiLFxyXG4gICAgICAgICAgICBzaXplczogXCI1MTJ4NTEyXCIsXHJcbiAgICAgICAgICAgIHR5cGU6IFwiaW1hZ2UvcG5nXCIsXHJcbiAgICAgICAgICAgIHB1cnBvc2U6IFwibWFza2FibGVcIixcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSxcclxuICAgIH0pLFxyXG4gIF0uZmlsdGVyKEJvb2xlYW4pLFxyXG4gIHJlc29sdmU6IHtcclxuICAgIGFsaWFzOiB7XHJcbiAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxyXG4gICAgfSxcclxuICB9LFxyXG59O1xyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF3TyxTQUFTLGNBQWMsZUFBZTtBQUM5USxPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBQ2pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUp4QixJQUFN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
