import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@canvascraft/registry': fileURLToPath(new URL('../../packages/registry/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/konva/') || id.includes('/node_modules/react-konva/')) {
            return 'canvas-runtime';
          }
          if (id.includes('/node_modules/motion/')) return 'motion-runtime';
          if (id.includes('/node_modules/lucide-react/')) return 'icon-runtime';
        },
      },
    },
  },
});
