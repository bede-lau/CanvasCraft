import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The template is a standalone project with its own node_modules (ADR 0001).
 * The audit must render it against the exact library versions it ships with,
 * not a second copy — two React instances means "Cannot read properties of
 * null (reading 'useContext')" the moment a `lucide-react` icon renders. So
 * every shared runtime library resolves to the template's own copy.
 */
const templateModule = (specifier: string): string =>
  fileURLToPath(new URL(`../branch-template/node_modules/${specifier}`, import.meta.url));

const shared = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'scheduler',
  'gsap',
  'motion',
  'motion/react',
  'motion-dom',
  'motion-utils',
  'lenis',
  'clsx',
  'lucide-react',
  '@base-ui/react',
];

export default defineConfig({
  resolve: {
    alias: shared.map((specifier) => ({
      find: new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      replacement: templateModule(specifier),
    })),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Rendering 12 manifests across every state is not instant, and the whole
    // point is to run it before shipping rather than in a tight loop.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
