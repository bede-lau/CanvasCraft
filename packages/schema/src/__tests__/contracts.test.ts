import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  composeRemix,
  findCanvasIntegrityIssues,
  findManifestIntegrityIssues,
  findSpecIntegrityIssues,
  summariseCanvasReadiness,
  ScreenSpec,
  type CanvasDoc,
  type VariantManifest,
} from '../index.js';

const timestamp = '2026-08-29T00:00:00.000Z';

function makeSpec(): ScreenSpec {
  return {
    version: 1,
    id: 'spec-insights',
    canvasId: 'canvas-insights',
    name: 'Insights',
    intent: 'Review account signals.',
    audience: 'Product team',
    regions: [
      {
        id: 'page-title',
        sourceElementId: 'title',
        role: 'page-title',
        region: 'hero',
        label: 'Account insights',
        purpose: 'Describe the screen.',
        sourceBounds: null,
        order: 0,
        children: [],
        visibleInStates: [],
        contentShape: 'text',
      },
    ],
    interactions: [],
    states: [
      {
        id: 'default',
        label: 'Default',
        description: 'Populated content.',
        hiddenRegions: [],
        placeholderRegions: [],
      },
      {
        id: 'narrow',
        label: 'Narrow',
        description: 'Narrow layout.',
        hiddenRegions: [],
        placeholderRegions: [],
      },
    ],
    fixtures: [],
    ambiguities: [],
    accessibility: {
      minBodyContrast: 4.5,
      minLargeTextContrast: 3,
      minTouchTargetPx: 44,
      requiresVisibleFocus: true,
      requiresKeyboardPath: true,
      requiresReducedMotionFallback: true,
      landmarks: ['banner', 'main'],
    },
    responsive: {
      narrowBreakpointPx: 640,
      wideBreakpointPx: 1280,
      stacksBelowNarrow: [],
      collapsesBelowNarrow: [],
    },
    createdAt: timestamp,
  };
}

function makeManifest(id = 'branch-calm'): VariantManifest {
  const spec = makeSpec();
  const specHash = 'a'.repeat(64);
  return {
    version: 1,
    id,
    name: 'Calm Trust',
    genome: 'Ink palette · soft controls · calm motion',
    rationale: 'Prioritises steady reading.',
    palette: {
      name: 'Ink',
      background: '#0a0b0f',
      surface: '#14161c',
      surfaceRaised: '#1d212a',
      border: '#2a2f3b',
      textPrimary: '#e8ebf2',
      textSecondary: '#8b93a7',
      accent: '#f0b860',
      accentContrast: '#14161c',
      positive: '#6ea97f',
      critical: '#c4736b',
      scheme: 'dark',
    },
    typography: {
      displayFamily: 'Bricolage Grotesque',
      bodyFamily: 'Geist',
      monoFamily: 'Geist Mono',
      scaleRatio: 1.25,
      baseSizePx: 16,
      displayWeight: 600,
      bodyWeight: 400,
      displayTrackingEm: 0,
      bodyLeading: 1.5,
    },
    form: {
      spaceUnitPx: 4,
      density: 'regular',
      radiusOuterPx: 12,
      radiusStepPx: 2,
      borderWidthPx: 1,
      elevation: 'hairline',
    },
    controls: {
      buttonShape: 'soft',
      buttonFill: 'solid',
      inputStyle: 'outlined',
      iconWeight: 'regular',
      iconSizePx: 18,
      focusRing: 'ring',
    },
    motion: {
      preset: 'calm',
      durationMs: 260,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      staggerMs: 40,
      travel: 0.25,
      reducedMotion: 'fade-only',
    },
    selections: [
      {
        regionId: 'page-title',
        recordId: 'canvascraft-neutral-shell',
        source: 'canvascraft',
        sourceUrl: 'https://canvascraft.local/patterns/neutral-shell',
        license: 'canvascraft-original',
        licenseNotice: null,
        matchScore: 0.9,
        matchSource: 'local',
        whyItFits: 'Neutral text pattern preserves hierarchy.',
        fallbackReason: null,
      },
    ],
    lineage: {
      specId: spec.id,
      specHash,
      parentBranchIds: [],
      traitOrigins: {
        palette: null,
        typography: null,
        form: null,
        controls: null,
        motion: null,
        selections: null,
      },
      registryVersion: '0.1.0',
    },
    createdAt: timestamp,
  };
}

describe('cross-layer contract safeguards', () => {
  it('reports canvas references that no longer exist without blocking a draft', () => {
    const canvas: CanvasDoc = {
      version: 1,
      id: 'canvas-insights',
      title: 'Insights',
      size: { width: 1024, height: 640 },
      baseImage: null,
      elements: [],
      arrows: [{ id: 'arrow-1', from: 'gone', to: 'also-gone', interaction: 'open-modal', label: '', points: [] }],
      notes: [],
      strokes: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    expect(findCanvasIntegrityIssues(canvas)).toHaveLength(2);
    expect(summariseCanvasReadiness(canvas).ready).toBe(false);
  });

  it('requires default and narrow states in the locked shared spec', () => {
    const spec = makeSpec();
    spec.states = [spec.states[0]!];

    expect(findSpecIntegrityIssues(spec)).toContain(
      'Every screen needs a "narrow" state — the responsive contract is locked.',
    );
  });

  it('enforces the accessibility floor and breakpoint ordering in parsed specs', () => {
    const spec = makeSpec();
    expect(() =>
      ScreenSpec.parse({
        ...spec,
        accessibility: { ...spec.accessibility, minTouchTargetPx: 40 },
      }),
    ).toThrow();
    expect(() =>
      ScreenSpec.parse({
        ...spec,
        responsive: { ...spec.responsive, wideBreakpointPx: 640 },
      }),
    ).toThrow();
  });

  it('keeps a semantic equivalent Screen Spec on the same hash regardless of key insertion order', () => {
    expect(canonicalJson({ b: [2, { z: true, a: null }], a: 1 })).toBe(
      canonicalJson({ a: 1, b: [2, { a: null, z: true }] }),
    );
  });

  it('rejects a manifest that silently omits a shared region', () => {
    const spec = makeSpec();
    const manifest = makeManifest();
    manifest.selections = [];

    expect(findManifestIntegrityIssues(manifest, spec, manifest.lineage.specHash)).toContain(
      'Branch "Calm Trust" does not resolve region "page-title".',
    );
  });

  it('records every trait origin when composing a remix', () => {
    const calm = makeManifest('branch-calm');
    const playful = makeManifest('branch-playful');
    playful.motion = { ...playful.motion, preset: 'playful', durationMs: 380, travel: 0.7 };

    const remix = composeRemix({
      id: 'branch-remix',
      name: 'Calm Play',
      genome: 'Ink palette · soft controls · playful motion',
      rationale: 'Combines readable tokens with expressive feedback.',
      createdAt: timestamp,
      sources: {
        palette: calm,
        typography: calm,
        form: calm,
        controls: calm,
        motion: playful,
        selections: calm,
      },
    });

    expect(remix.motion.preset).toBe('playful');
    expect(remix.lineage.parentBranchIds).toEqual(['branch-calm', 'branch-playful']);
    expect(remix.lineage.traitOrigins.motion).toBe('branch-playful');
  });

  it('refuses a remix that would combine different shared product contracts', () => {
    const calm = makeManifest('branch-calm');
    const stale = makeManifest('branch-stale');
    stale.lineage.specHash = 'b'.repeat(64);

    expect(() =>
      composeRemix({
        id: 'branch-invalid-remix',
        name: 'Invalid remix',
        genome: 'Mixed',
        rationale: 'Should never be created.',
        createdAt: timestamp,
        sources: {
          palette: calm,
          typography: calm,
          form: calm,
          controls: calm,
          motion: stale,
          selections: calm,
        },
      }),
    ).toThrow('Trait Remix requires every parent manifest to belong to the same Screen Spec.');
  });
});
