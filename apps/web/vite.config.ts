import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import type { ServerResponse } from 'node:http';

/** Kept in one place so the proxy target and the error it reports cannot drift apart. */
const ORCHESTRATOR_TARGET = process.env['VITE_ORCHESTRATOR_PROXY'] ?? 'http://127.0.0.1:8787';

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
        target: ORCHESTRATOR_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        // Without this, a stopped orchestrator surfaces in the browser as a bare
        // "502 Bad Gateway" HTML page, which the client can only report verbatim.
        // The cause is always the same and always fixable, so say which process
        // is missing and how to start it instead of relaying the gateway's guess.
        configure: (proxy) => {
          proxy.on('error', (error, _request, response) => {
            // A websocket upgrade fails with a raw Socket here rather than a
            // ServerResponse, and there is no status line to write on one.
            if (!('writeHead' in response) || response.writableEnded) return;
            const reply = response as ServerResponse;
            const refused = (error as NodeJS.ErrnoException).code === 'ECONNREFUSED';
            reply.writeHead(503, { 'Content-Type': 'application/json' });
            reply.end(
              JSON.stringify({
                error: refused
                  ? `The orchestrator is not running on ${ORCHESTRATOR_TARGET}. Start it with "pnpm dev:orchestrator" (or "pnpm dev" from the repo root to run both).`
                  : `Could not reach the orchestrator on ${ORCHESTRATOR_TARGET}: ${error.message}`,
              }),
            );
          });
        },
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
