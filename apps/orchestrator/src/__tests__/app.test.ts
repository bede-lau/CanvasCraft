import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CanvasDoc, RunRecord } from '@canvascraft/schema';

import { buildApp } from '../app.js';
import type { OrchestratorConfig } from '../config.js';

const timestamp = '2026-08-29T12:00:00.000Z';

function canvas(): CanvasDoc {
  return {
    version: 1,
    id: 'canvas-dashboard',
    title: 'Account dashboard',
    size: { width: 1200, height: 800 },
    baseImage: null,
    elements: [
      { id: 'nav', kind: 'navbar', bounds: { x: 0, y: 0, width: 1200, height: 72 }, rotation: 0, z: 0, label: 'Workspace', children: [] },
      { id: 'search', kind: 'input', bounds: { x: 80, y: 120, width: 320, height: 48 }, rotation: 0, z: 1, label: 'Filter accounts', children: [] },
      { id: 'table', kind: 'table', bounds: { x: 80, y: 210, width: 780, height: 430 }, rotation: 0, z: 2, label: 'Accounts', children: [] },
      { id: 'modal', kind: 'modal', bounds: { x: 880, y: 210, width: 260, height: 280 }, rotation: 0, z: 3, label: 'Account details', intendedState: 'modal', children: [] },
    ],
    arrows: [
      { id: 'open-details', from: 'table', to: 'modal', interaction: 'open-modal', label: 'Open account details', points: [] },
    ],
    notes: [
      {
        id: 'intent',
        text: 'A calm account review tool for customer success teams.',
        bounds: { x: 880, y: 520, width: 220, height: 120 },
        tone: 'mint',
      },
    ],
    strokes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('offline-first orchestrator', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'canvascraft-orchestrator-'));
    const config: OrchestratorConfig = {
      host: '127.0.0.1',
      port: 8787,
      dataDir,
      integrations: {
        ai: { mode: 'offline', configured: false, detail: 'Local deterministic compiler.' },
        nosana: { mode: 'offline', configured: false, detail: 'Local registry matcher.' },
        daytona: { mode: 'offline', configured: false, detail: 'No live sandbox.' },
      },
    };
    app = await buildApp({ config });
  });

  afterEach(async () => {
    await app.close();
  });

  async function createRun(): Promise<RunRecord> {
    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { canvas: canvas(), canvasImage: null, branchCount: 3 },
    });
    expect(response.statusCode).toBe(201);
    return response.json<RunRecord>();
  }

  it('reports offline integration state without exposing credentials', async () => {
    const response = await app.inject({ method: 'GET', url: '/config' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      branchCount: 3,
      credentialsExposedToBrowser: false,
      integrations: {
        ai: { mode: 'offline' },
        nosana: { mode: 'offline' },
        daytona: { mode: 'offline' },
      },
    });
  });

  it('permits the local web origin without opening the service to arbitrary origins', async () => {
    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    const rejected = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://untrusted.example' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('creates exactly three valid directions sharing one deterministic spec hash', async () => {
    const run = await createRun();
    expect(run.status).toBe('ready');
    expect(run.branches).toHaveLength(3);
    expect(run.branches.every((branch) => !Object.hasOwn(branch, 'previewToken'))).toBe(true);
    expect(new Set(run.branches.map((branch) => branch.manifest.lineage.specHash))).toEqual(new Set([run.specHash]));
    expect(run.branches.every((branch) => branch.status === 'stopped' && branch.previewUrl === null)).toBe(true);
    expect(run.candidates.every((entry) => entry.matches.every((match) => match.matchSource === 'local'))).toBe(true);

    const runDir = path.join(dataDir, 'runs', run.id);
    expect(await readdir(path.join(runDir, 'snapshots'))).toHaveLength(2);
    const events = await readFile(path.join(runDir, 'events.ndjson'), 'utf8');
    expect(events).toContain('"outcome":"degraded"');
    expect(events).toContain('"matchSource":"local"');
    expect(events).toContain('"stage":"licence-gate"');
    expect(events).toContain('"allowed":true');
  });

  it('replays typed events over SSE', async () => {
    const run = await createRun();
    const response = await app.inject({ method: 'GET', url: `/runs/${run.id}/events?replayOnly=true` });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain('event: run-started');
    expect(response.body).toContain('event: run-finished');
  });

  it('applies and reverts recommendations, creates manifest-only remixes, patches, and selects a champion', async () => {
    const run = await createRun();
    const recommendation = run.recommendations[0]!;
    const originalLeading = run.branches[0]!.manifest.typography.bodyLeading;

    const appliedResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/recommendations`,
      payload: { recommendationId: recommendation.id, apply: true },
    });
    expect(appliedResponse.statusCode).toBe(200);
    expect(appliedResponse.json<RunRecord>().branches[0]!.manifest.typography.bodyLeading).toBeGreaterThan(originalLeading);

    const revertedResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/recommendations`,
      payload: { recommendationId: recommendation.id, apply: false },
    });
    expect(revertedResponse.json<RunRecord>().branches[0]!.manifest.typography.bodyLeading).toBe(originalLeading);

    const sources = Object.fromEntries(
      ['palette', 'typography', 'form', 'controls', 'motion', 'selections'].map((group, index) => [
        group,
        run.branches[index % 3]!.id,
      ]),
    );
    const remixResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/remixes`,
      payload: { name: 'Calm Momentum', sources },
    });
    expect(remixResponse.statusCode).toBe(201);
    expect(remixResponse.json().manifest.lineage.parentBranchIds.length).toBeGreaterThan(1);

    const patchResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/patches`,
      payload: {
        branchId: run.branches[1]!.id,
        regionId: run.spec!.regions[0]!.id,
        request: 'Swap this selected region to another compatible local pattern',
      },
    });
    expect(patchResponse.statusCode).toBe(201);
    expect(patchResponse.json()).toMatchObject({ state: 'applied', regionId: run.spec!.regions[0]!.id });

    const scopedCalmPatchResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/patches`,
      payload: {
        branchId: run.branches[1]!.id,
        regionId: run.spec!.regions[0]!.id,
        request: 'Make this region calmer',
      },
    });
    expect(scopedCalmPatchResponse.statusCode).toBe(201);

    const rejectedPatchResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/patches`,
      payload: {
        branchId: run.branches[1]!.id,
        regionId: run.spec!.regions[0]!.id,
        request: 'Make the whole app calmer',
      },
    });
    expect(rejectedPatchResponse.statusCode).toBe(422);

    const championResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/champion`,
      payload: { branchId: run.branches[0]!.id, retireOthers: true },
    });
    const championRun = championResponse.json<RunRecord>();
    expect(championRun.championBranchId).toBe(run.branches[0]!.id);
    expect(championRun.branches.filter((branch) => branch.status === 'archived')).toHaveLength(3);
  });
});
