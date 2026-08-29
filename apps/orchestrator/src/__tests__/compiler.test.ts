import { describe, expect, it } from 'vitest';

import { AiDirectionSet, type CanvasDoc } from '@canvascraft/schema';

import {
  buildCandidates,
  buildDirectionsFromAi,
  compileScreenSpec,
  directionSelectionOptions,
  hashSpec,
} from '../compiler.js';

const createdAt = '2026-08-29T12:00:00.000Z';

const canvas: CanvasDoc = {
  version: 1,
  id: 'canvas-brief',
  title: 'Account review',
  size: { width: 1200, height: 800 },
  baseImage: null,
  elements: [
    { id: 'nav', kind: 'navbar', bounds: { x: 0, y: 0, width: 1200, height: 72 }, rotation: 0, z: 0, label: 'Workspace', children: [] },
    { id: 'table', kind: 'table', bounds: { x: 80, y: 180, width: 840, height: 420 }, rotation: 0, z: 1, label: 'Accounts', children: [] },
  ],
  arrows: [],
  notes: [],
  strokes: [],
  createdAt,
  updatedAt: createdAt,
};

function direction(name: string, options: Array<{ regionId: string; recordIds: string[] }>) {
  const styleIndex = name === 'Calm Trust' ? 0 : name === 'Focused Clarity' ? 1 : 2;
  const accents = ['#176b63', '#b44f22', '#2c71a9'] as const;
  return {
    name,
    genome: `${name} palette · soft controls · calm motion`,
    rationale: 'Prioritises steady hierarchy and readable scanning.',
    palette: {
      name,
      background: '#f5f7f8',
      surface: '#ffffff',
      surfaceRaised: '#eef2f3',
      border: '#cbd5d8',
      textPrimary: '#172126',
      textSecondary: '#54636a',
      accent: accents[styleIndex],
      accentContrast: '#ffffff',
      positive: '#267a4a',
      critical: '#b33a3a',
      scheme: 'light' as const,
    },
    typography: {
      displayFamily: 'Inter, system-ui, sans-serif',
      bodyFamily: 'Inter, system-ui, sans-serif',
      monoFamily: 'ui-monospace, monospace',
      scaleRatio: 1.2,
      baseSizePx: 16,
      displayWeight: 650,
      bodyWeight: 400,
      displayTrackingEm: 0,
      bodyLeading: 1.55,
    },
    form: {
      spaceUnitPx: 4,
      density: styleIndex === 1 ? 'roomy' as const : 'regular' as const,
      radiusOuterPx: styleIndex === 2 ? 4 : 8,
      radiusStepPx: 2,
      borderWidthPx: 1,
      elevation: 'hairline' as const,
    },
    controls: {
      buttonShape: 'soft' as const,
      buttonFill: 'solid' as const,
      inputStyle: 'outlined' as const,
      iconWeight: 'regular' as const,
      iconSizePx: 18,
      focusRing: 'ring' as const,
    },
    motionPreset: styleIndex === 1 ? 'playful' as const : styleIndex === 2 ? 'editorial' as const : 'calm' as const,
    selections: options.map((option) => ({
      regionId: option.regionId,
      recordId: option.recordIds[0]!,
      whyItFits: 'The approved pattern supports this region without altering the shared contract.',
    })),
  };
}

describe('AI direction materialisation', () => {
  it('turns three validated AI drafts into three complete manifest directions', () => {
    const spec = compileScreenSpec(canvas);
    const candidates = buildCandidates(spec);
    const options = directionSelectionOptions({ spec, candidates });
    const directionSet = AiDirectionSet.parse({
      variants: [direction('Calm Trust', options), direction('Focused Clarity', options), direction('Editorial Signal', options)],
      contrastSummary: 'The directions vary treatment while keeping the same account-review workflow.',
    });

    const manifests = buildDirectionsFromAi({
      runId: 'run-ai-directions',
      spec,
      specHash: hashSpec(spec),
      candidates,
      directionSet,
      createdAt,
    });

    expect(manifests).toHaveLength(3);
    expect(new Set(manifests.map((manifest) => manifest.name)).size).toBe(3);
    expect(manifests.every((manifest) => manifest.selections.length === spec.regions.length)).toBe(true);
    expect(new Set(manifests.map((manifest) => manifest.motion.preset)).size).toBe(3);
  });

  it('rejects a model-selected pattern that was not approved for a region', () => {
    const spec = compileScreenSpec(canvas);
    const candidates = buildCandidates(spec);
    const options = directionSelectionOptions({ spec, candidates });
    const invalid = direction('Calm Trust', options);
    invalid.selections[0]!.recordId = 'not-approved';
    const directionSet = AiDirectionSet.parse({
      variants: [invalid, direction('Focused Clarity', options), direction('Editorial Signal', options)],
      contrastSummary: 'The directions vary treatment while keeping the same account-review workflow.',
    });

    expect(() =>
      buildDirectionsFromAi({
        runId: 'run-ai-directions',
        spec,
        specHash: hashSpec(spec),
        candidates,
        directionSet,
        createdAt,
      }),
    ).toThrow('not gate-approved');
  });

  it('rejects duplicate region selections instead of silently collapsing them', () => {
    const spec = compileScreenSpec(canvas);
    const candidates = buildCandidates(spec);
    const options = directionSelectionOptions({ spec, candidates });
    const invalid = direction('Calm Trust', options);
    invalid.selections.push({ ...invalid.selections[0]! });
    const directionSet = AiDirectionSet.parse({
      variants: [invalid, direction('Focused Clarity', options), direction('Editorial Signal', options)],
      contrastSummary: 'The directions vary treatment while keeping the same account-review workflow.',
    });

    expect(() =>
      buildDirectionsFromAi({
        runId: 'run-ai-directions',
        spec,
        specHash: hashSpec(spec),
        candidates,
        directionSet,
        createdAt,
      }),
    ).toThrow('must select one pattern for every Screen Spec region');
  });

  it('rejects directions that differ only by name', () => {
    const spec = compileScreenSpec(canvas);
    const candidates = buildCandidates(spec);
    const options = directionSelectionOptions({ spec, candidates });
    const duplicateStyle = direction('Focused Clarity', options);
    duplicateStyle.palette = { ...direction('Calm Trust', options).palette };
    duplicateStyle.typography = { ...direction('Calm Trust', options).typography };
    duplicateStyle.form = { ...direction('Calm Trust', options).form };
    duplicateStyle.controls = { ...direction('Calm Trust', options).controls };
    duplicateStyle.motionPreset = 'calm';
    duplicateStyle.selections = direction('Calm Trust', options).selections;
    const directionSet = AiDirectionSet.parse({
      variants: [direction('Calm Trust', options), duplicateStyle, direction('Editorial Signal', options)],
      contrastSummary: 'The directions vary treatment while keeping the same account-review workflow.',
    });

    expect(() =>
      buildDirectionsFromAi({
        runId: 'run-ai-directions',
        spec,
        specHash: hashSpec(spec),
        candidates,
        directionSet,
        createdAt,
      }),
    ).toThrow('materially distinct');
  });
});
