import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite config for a generated branch.
 *
 * This file is part of the pre-baked snapshot, not generated per branch, which
 * is deliberate: every setting below is load-bearing for "runs in a sandbox and
 * renders inside a cross-origin iframe", and none of it should be something a
 * model can get wrong.
 */

const PORT = Number(process.env.PORT ?? process.env.PREVIEW_PORT ?? 4173);
const IS_PROXIED_PREVIEW =
  process.env.PORT !== undefined || process.env.PREVIEW_PORT !== undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Left at the default '/'. The sandbox proxy serves the app from the root of
  // its own preview host, and an absolute base would 404 every asset once the
  // page is iframed from another origin.
  base: '/',

  server: {
    // The sandbox's reverse proxy reaches the dev server over the container
    // network, so binding to localhost only would make the preview unreachable.
    host: '0.0.0.0',
    port: PORT,
    // Fail loudly rather than drift to a port the proxy is not forwarding.
    strictPort: true,
    // Vite rejects any Host header it does not recognise with a 403 "Blocked
    // request". Sandbox preview hostnames are assigned per sandbox and are not
    // knowable at build time, so the check is disabled here. The risk it guards
    // against — DNS rebinding against a dev server on a shared network — does
    // not apply to a single-tenant container reachable only through the
    // platform's own proxy.
    allowedHosts: true,
    ...(IS_PROXIED_PREVIEW
      ? {
          ws: {
            // The page is served over HTTPS by the proxy, so a plain ws:// HMR
            // socket would be blocked as mixed content.
            protocol: 'wss' as const,
            clientPort: 443,
          },
        }
      : {}),
  },

  preview: {
    host: '0.0.0.0',
    port: PORT,
    strictPort: true,
    allowedHosts: true,
  },

  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
