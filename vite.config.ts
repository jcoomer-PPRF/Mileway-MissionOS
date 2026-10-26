import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Plain SPA build. The static `dist/` output is what Capacitor will wrap
// into the native iOS/Android shell in a later phase — no SSR/server runtime.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: "md01-preview-isolation",
      transformIndexHtml: {
        order: "post",
        handler(html, context) {
          if (!["md01", "md02", "md02-staging"].includes(mode) || !context.bundle) return html;
          return {
            html,
            tags: [
              {
                tag: "meta",
                attrs: {
                  "http-equiv": "Content-Security-Policy",
                  content:
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src " +
                    (mode.startsWith("md02") ? "'self'" : "'none'") +
                    "; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
                },
                injectTo: "head-prepend",
              },
            ],
          };
        },
      },
    },
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server:
    mode.startsWith("md02")
      ? {
          host: "127.0.0.1",
          port: Number(process.env.MD02_APP_PORT || 5175),
          strictPort: true,
          proxy: {
            "/api/md02": {
              target: `http://127.0.0.1:${Number(process.env.MD02_GATEWAY_PORT || 5176)}`,
              changeOrigin: false,
            },
          },
          headers: {
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        }
      : { port: 5173 },
  build: {
    // Preserve Vite 5's transpilation targets rather than silently narrowing
    // browser compatibility when upgrading the build tool.
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
    outDir:
      mode === "md02-staging" ? "dist-md02-staging" : mode === "md02" ? "dist-md02" : mode === "md01" ? "dist-md01" : "dist",
    rollupOptions: {
      input: path.resolve(
        __dirname,
        mode === "md02-staging"
          ? "md02-staging.html"
          : mode === "md02"
          ? "md02.html"
          : mode === "md01"
            ? "demo.html"
            : "index.html",
      ),
      output: {
        // Split heavy libraries so the initial bundle (and the eventual
        // Capacitor app payload) stays lean.
        manualChunks:
          mode === "md01" || mode.startsWith("md02")
            ? {
                "vendor-react": ["react", "react-dom", "react-router-dom"],
              }
            : {
                "vendor-react": ["react", "react-dom", "react-router-dom"],
                "vendor-charts": ["recharts"],
                "vendor-xlsx": ["xlsx"],
                "vendor-supabase": ["@supabase/supabase-js"],
              },
      },
    },
  },
}));
