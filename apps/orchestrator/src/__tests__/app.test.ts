import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CanvasDoc, PatchInstruction, RunRecord } from '@canvascraft/schema';

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
    designPreferences: {
      archetype: 'application',
      displayFont: 'grotesk',
      bodyFont: 'clean',
      buttonShape: 'soft',
      motionPreset: 'calm',
      motionIntensity: 'moderate',
    },
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
        visualRanking: { mode: 'offline', configured: false, detail: 'Local registry matcher.' },
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
        visualRanking: { mode: 'offline' },
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
    // The layout audit runs on every run, between proposing directions and
    // launching sandboxes, whether or not it finds anything to revise.
    expect(events).toContain('"stage":"layout-audit"');
  });

  it('replays typed events over SSE', async () => {
    const run = await createRun();
    const response = await app.inject({ method: 'GET', url: `/runs/${run.id}/events?replayOnly=true` });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.body).toContain('event: run-started');
    expect(response.body).toContain('"stage":"layout-audit"');
    expect(response.body).toContain('event: run-finished');
  });

  it('honours a free client-chosen run id so the browser can stream a run in flight', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { canvas: canvas(), canvasImage: null, branchCount: 3, runId: 'run-abc123def456' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<RunRecord>().id).toBe('run-abc123def456');
  });

  it('ignores a client run id that is malformed or already taken', async () => {
    const malformed = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { canvas: canvas(), canvasImage: null, branchCount: 3, runId: 'Run 1; DROP' },
    });
    expect(malformed.statusCode).toBe(400);

    const first = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { canvas: canvas(), canvasImage: null, branchCount: 3, runId: 'run-collide00001' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { canvas: canvas(), canvasImage: null, branchCount: 3, runId: 'run-collide00001' },
    });
    expect(first.json<RunRecord>().id).toBe('run-collide00001');
    expect(second.json<RunRecord>().id).not.toBe('run-collide00001');
    expect(second.json<RunRecord>().id).toMatch(/^run-/);
  });

  it('applies recommendations, protects remix lineage, deletes branches, patches, and selects a champion', async () => {
    const run = await createRun();
    const recommendation = run.recommendations[0]!;
    // Which trait a recommendation touches depends on what the branch measured,
    // so the round trip is asserted on the manifest as a whole.
    const branchIndex = run.branches.findIndex((branch) => branch.id === recommendation.branchId);
    const originalManifest = run.branches[branchIndex]!.manifest;

    const appliedResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/recommendations`,
      payload: { recommendationId: recommendation.id, apply: true },
    });
    expect(appliedResponse.statusCode).toBe(200);
    const appliedManifest = appliedResponse.json<RunRecord>().branches[branchIndex]!.manifest;
    expect(appliedManifest).not.toEqual(originalManifest);

    const revertedResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/recommendations`,
      payload: { recommendationId: recommendation.id, apply: false },
    });
    expect(revertedResponse.json<RunRecord>().branches[branchIndex]!.manifest).toEqual(originalManifest);

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
    const remix = remixResponse.json<RunRecord['branches'][number]>();
    expect(remix.manifest.lineage.parentBranchIds.length).toBeGreaterThan(1);

    const protectedDeleteResponse = await app.inject({
      method: 'DELETE',
      url: `/runs/${run.id}/branches/${run.branches[0]!.id}`,
    });
    expect(protectedDeleteResponse.statusCode).toBe(409);
    expect(protectedDeleteResponse.json()).toMatchObject({ error: expect.stringContaining('lineage') });

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/runs/${run.id}/branches/${remix.id}`,
    });
    expect(deleteResponse.statusCode).toBe(200);
    const runAfterDelete = deleteResponse.json<RunRecord>();
    expect(runAfterDelete.branches).toHaveLength(3);
    expect(runAfterDelete.branches.some((branch) => branch.id === remix.id)).toBe(false);
    expect(runAfterDelete.recommendations.some((entry) => entry.branchId === remix.id)).toBe(false);

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
    // "Strict QA": a prompt that goes through must land a real, non-no-op change —
    // never quietly report success while leaving the region exactly as it was.
    const firstPatch = patchResponse.json<PatchInstruction>();
    expect(firstPatch.delta).not.toEqual(firstPatch.revertTo);

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
    const calmPatch = scopedCalmPatchResponse.json<PatchInstruction>();
    expect(calmPatch.delta).not.toEqual(calmPatch.revertTo);

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

    // Chat history: the region must actually carry the latest patch's pattern —
    // this is the "accurately executes the change" half of the QA gate.
    const runAfterPatches = await app.inject({ method: 'GET', url: `/runs/${run.id}` });
    const regionAfterPatches = () =>
      runAfterPatches
        .json<RunRecord>()
        .branches.find((branch) => branch.id === run.branches[1]!.id)!
        .manifest.selections.find((selection) => selection.regionId === run.spec!.regions[0]!.id)!.recordId;
    expect(regionAfterPatches()).toBe(calmPatch.delta.selectionSwaps[0]!.recordId);

    // Deleting a chat message is a real revert, not a soft "hide from the list":
    // the branch manifest must roll back to exactly what it was before that patch.
    const unknownPatchDeleteResponse = await app.inject({
      method: 'DELETE',
      url: `/runs/${run.id}/patches/does-not-exist`,
    });
    expect(unknownPatchDeleteResponse.statusCode).toBe(404);

    const patchDeleteResponse = await app.inject({
      method: 'DELETE',
      url: `/runs/${run.id}/patches/${calmPatch.id}`,
    });
    expect(patchDeleteResponse.statusCode).toBe(200);
    const runAfterPatchDelete = patchDeleteResponse.json<RunRecord>();
    expect(runAfterPatchDelete.patches.some((entry) => entry.id === calmPatch.id)).toBe(false);
    const revertedRecordId = runAfterPatchDelete.branches
      .find((branch) => branch.id === run.branches[1]!.id)!
      .manifest.selections.find((selection) => selection.regionId === run.spec!.regions[0]!.id)!.recordId;
    expect(revertedRecordId).toBe(calmPatch.revertTo.selectionSwaps[0]!.recordId);
    expect(revertedRecordId).toBe(firstPatch.delta.selectionSwaps[0]!.recordId);

    const repeatPatchDeleteResponse = await app.inject({
      method: 'DELETE',
      url: `/runs/${run.id}/patches/${calmPatch.id}`,
    });
    expect(repeatPatchDeleteResponse.statusCode).toBe(404);

    const championResponse = await app.inject({
      method: 'POST',
      url: `/runs/${run.id}/champion`,
      payload: { branchId: run.branches[0]!.id, retireOthers: true },
    });
    const championRun = championResponse.json<RunRecord>();
    expect(championRun.championBranchId).toBe(run.branches[0]!.id);
    expect(championRun.branches.filter((branch) => branch.status === 'archived')).toHaveLength(2);

    const championDeleteResponse = await app.inject({
      method: 'DELETE',
      url: `/runs/${run.id}/branches/${run.branches[0]!.id}`,
    });
    expect(championDeleteResponse.statusCode).toBe(409);
    expect(championDeleteResponse.json()).toMatchObject({ error: expect.stringContaining('champion') });
  });

  it('deletes an entire run — branches and all persisted data — on workspace deletion', async () => {
    const run = await createRun();
    const runDir = path.join(dataDir, 'runs', run.id);
    expect(await readdir(runDir)).not.toHaveLength(0);

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/runs/${run.id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const refetchResponse = await app.inject({ method: 'GET', url: `/runs/${run.id}` });
    expect(refetchResponse.statusCode).toBe(404);
    await expect(readdir(runDir)).rejects.toMatchObject({ code: 'ENOENT' });

    // Deleting an already-gone (or never-existing) run is not an error.
    const repeatResponse = await app.inject({ method: 'DELETE', url: `/runs/${run.id}` });
    expect(repeatResponse.statusCode).toBe(404);
  });
});
