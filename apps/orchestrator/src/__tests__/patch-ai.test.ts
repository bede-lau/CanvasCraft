import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiDelta, CanvasDoc, PatchInstruction, RunRecord } from '@canvascraft/schema';

import { buildApp } from '../app.js';
import type { OrchestratorConfig } from '../config.js';

const { responsesCreate } = vi.hoisted(() => ({ responsesCreate: vi.fn() }));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: responsesCreate };
  },
}));

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
    notes: [],
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

/** Every AiDelta field null, so a test only states what it means to change. */
function noChanges(): AiDelta {
  return {
    paletteAccent: null,
    paletteTextPrimary: null,
    paletteTextSecondary: null,
    paletteSurface: null,
    paletteBackdrop: null,
    typographyBaseSizePx: null,
    typographyDisplayWeight: null,
    typographyDisplayTrackingEm: null,
    typographyBodyLeading: null,
    typographyScaleRatio: null,
    formSpaceUnitPx: null,
    formDensity: null,
    formRadiusOuterPx: null,
    formElevation: null,
    formSurface: null,
    controlsButtonShape: null,
    controlsButtonFill: null,
    controlsFocusRing: null,
    controlsIconSizePx: null,
    motionPreset: null,
    motionLanguage: null,
    motionDurationMs: null,
    motionStaggerMs: null,
    motionTravel: null,
    selectionSwaps: [],
  };
}

type QueuedPlan = { plan: unknown } | { error: Error };

describe('design chat interprets requests with the AI', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const queue: QueuedPlan[] = [];

  beforeEach(async () => {
    queue.length = 0;
    responsesCreate.mockReset();
    // Only the patch call is stubbed. Every other AI stage of a run throws and
    // falls back to the deterministic compiler, which is what makes the run
    // under test identical to the no-credentials one the other suite asserts on.
    responsesCreate.mockImplementation(async (body: { text?: { format?: { name?: string } } }) => {
      if (body.text?.format?.name !== 'canvascraft_patch_plan') {
        throw new Error('Only the patch plan call is stubbed in this suite.');
      }
      const next = queue.shift();
      if (!next) throw new Error('No patch plan was queued for this call.');
      if ('error' in next) throw next.error;
      return { status: 'completed', output_text: JSON.stringify(next.plan) };
    });

    const config: OrchestratorConfig = {
      host: '127.0.0.1',
      port: 8787,
      dataDir: await mkdtemp(path.join(os.tmpdir(), 'canvascraft-patch-ai-')),
      credentials: {
        ai: {
          apiKey: 'test-key',
          baseUrl: 'https://api.openai.test/v1',
          visionModel: 'test-vision',
          visualRankerModel: 'test-ranker',
          textModel: 'test-text',
        },
      },
      integrations: {
        ai: { mode: 'degraded', configured: true, detail: 'Stubbed AI.' },
        visualRanking: { mode: 'degraded', configured: true, detail: 'Stubbed ranker.' },
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

  async function patch(run: RunRecord, request: string) {
    return app.inject({
      method: 'POST',
      url: `/runs/${run.id}/patches`,
      payload: { branchId: run.branches[1]!.id, regionId: run.spec!.regions[0]!.id, request },
    });
  }

  it('applies a trait delta the request actually calls for, not a random pattern swap', async () => {
    const run = await createRun();
    const before = run.branches[1]!.manifest;
    queue.push({
      plan: {
        interpretation: 'Widened the working surface and warmed the accent so the top bar reads as the primary chrome.',
        regionId: run.spec!.regions[0]!.id,
        delta: { ...noChanges(), paletteAccent: '#2f6d4f', formDensity: 'roomy', formSurface: 'gradient' },
        refusalReason: null,
      },
    });

    const response = await patch(run, 'Make the nav bar fill up the whole top space');
    expect(response.statusCode).toBe(201);
    const applied = response.json<PatchInstruction>();
    expect(applied.state).toBe('applied');
    expect(applied.interpretation).toBe(
      'Widened the working surface and warmed the accent so the top bar reads as the primary chrome.',
    );
    expect(applied.delta.selectionSwaps).toHaveLength(0);
    expect(applied.delta.palette).toMatchObject({ accent: '#2f6d4f' });
    expect(applied.delta.form).toMatchObject({ density: 'roomy', surface: 'gradient' });

    const after = (await app.inject({ method: 'GET', url: `/runs/${run.id}` }))
      .json<RunRecord>()
      .branches.find((branch) => branch.id === run.branches[1]!.id)!.manifest;
    expect(after.palette.accent).toBe('#2f6d4f');
    expect(after.form.density).toBe('roomy');
    expect(after.form.surface).toBe('gradient');
    // The region's pattern is untouched: the request was about treatment.
    expect(after.selections.map((selection) => selection.recordId)).toEqual(
      before.selections.map((selection) => selection.recordId),
    );
    // Revert must restore what was there, not the values the delta asked for.
    expect(applied.revertTo.palette).toMatchObject({ accent: before.palette.accent });
  });

  it('surfaces a Screen Spec refusal as a 422 instead of guessing a change', async () => {
    const run = await createRun();
    queue.push({
      plan: {
        interpretation: 'The request asks for a new region, which the shared Screen Spec owns.',
        regionId: run.spec!.regions[0]!.id,
        delta: noChanges(),
        refusalReason:
          'Adding a pricing section is a Screen Spec change, so it cannot be applied as a branch patch. Draw the section on the canvas and regenerate.',
      },
    });

    const response = await patch(run, 'Add a pricing section under the table with three tiers');
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: expect.stringContaining('Screen Spec change') });

    const unchanged = (await app.inject({ method: 'GET', url: `/runs/${run.id}` })).json<RunRecord>();
    expect(unchanged.patches).toHaveLength(0);
  });

  it('falls back to the heuristic patch when the AI call fails', async () => {
    const run = await createRun();
    const before = run.branches[1]!.manifest;
    queue.push({ error: new Error('upstream timed out') });

    const response = await patch(run, 'Swap this selected region to another compatible local pattern');
    expect(response.statusCode).toBe(201);
    const applied = response.json<PatchInstruction>();
    expect(applied.interpretation).toContain('gate-approved local pattern');
    expect(applied.delta).not.toEqual(applied.revertTo);
    expect(applied.delta.selectionSwaps).toHaveLength(1);

    const after = (await app.inject({ method: 'GET', url: `/runs/${run.id}` }))
      .json<RunRecord>()
      .branches.find((branch) => branch.id === run.branches[1]!.id)!.manifest;
    const regionId = run.spec!.regions[0]!.id;
    const recordIdFor = (manifest: RunRecord['branches'][number]['manifest']) =>
      manifest.selections.find((selection) => selection.regionId === regionId)!.recordId;
    expect(recordIdFor(after)).toBe(applied.delta.selectionSwaps[0]!.recordId);
    expect(recordIdFor(after)).not.toBe(recordIdFor(before));
  });

  it('keeps the heuristic patch when the AI proposes a delta that changes nothing', async () => {
    const run = await createRun();
    const before = run.branches[1]!.manifest;
    queue.push({
      plan: {
        interpretation: 'Kept the accent exactly as it is.',
        regionId: run.spec!.regions[0]!.id,
        delta: { ...noChanges(), paletteAccent: before.palette.accent },
        refusalReason: null,
      },
    });

    const response = await patch(run, 'Swap this selected region to another compatible local pattern');
    expect(response.statusCode).toBe(201);
    const applied = response.json<PatchInstruction>();
    expect(applied.interpretation).toContain('gate-approved local pattern');
    expect(applied.delta).not.toEqual(applied.revertTo);
  });
});
