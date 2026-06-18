import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Plain SPA build. The static `dist/` output is what Capacitor will wrap
// into the native iOS/Android shell in a later phase — no SSR/server runtime.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Split heavy libraries so the initial bundle (and the eventual
        // Capacitor app payload) stays lean.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-xlsx': ['xlsx'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
});
