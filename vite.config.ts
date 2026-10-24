import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Plain SPA build. The static `dist/` output is what Capacitor will wrap
// into the native iOS/Android shell in a later phase — no SSR/server runtime.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: 'md01-preview-isolation',
      transformIndexHtml: {
        order: 'post',
        handler(html, context) {
          if (mode !== 'md01' || !context.bundle) return html;
          return {
            html,
            tags: [
              {
                tag: 'meta',
                attrs: {
                  'http-equiv': 'Content-Security-Policy',
                  content:
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
                },
                injectTo: 'head-prepend',
              },
            ],
          };
        },
      },
    },
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
  build: {
    // Preserve Vite 5's transpilation targets rather than silently narrowing
    // browser compatibility when upgrading the build tool.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    outDir: mode === 'md01' ? 'dist-md01' : 'dist',
    rollupOptions: {
      input: path.resolve(__dirname, mode === 'md01' ? 'demo.html' : 'index.html'),
      output: {
        // Split heavy libraries so the initial bundle (and the eventual
        // Capacitor app payload) stays lean.
        manualChunks:
          mode === 'md01'
            ? {
                'vendor-react': ['react', 'react-dom', 'react-router-dom'],
              }
            : {
                'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                'vendor-charts': ['recharts'],
                'vendor-xlsx': ['xlsx'],
                'vendor-supabase': ['@supabase/supabase-js'],
              },
      },
    },
  },
}));
