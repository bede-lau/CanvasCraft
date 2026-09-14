import { defineConfig } from 'vitest/config';

/**
 * The orchestrator's suite is an integration suite, not a unit suite.
 *
 * `app.test.ts` drives the real Fastify app against a real temporary run
 * directory: every run writes a canvas, a spec, three manifests, per-branch
 * snapshots, and an NDJSON event log, and every assertion round-trips through
 * that on disk. On a slow or synced filesystem a single run comfortably exceeds
 * Vitest's 5s default, which surfaces as a timeout that says nothing about the
 * code under test. The floor is raised rather than the I/O mocked, because the
 * durability of those writes is a large part of what these tests exist to
 * prove.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
