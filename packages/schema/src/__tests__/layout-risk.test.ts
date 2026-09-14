import { describe, expect, it } from 'vitest';

import { findLayoutRiskIssues, ScreenSpec, VariantManifest } from '../index.js';

const timestamp = '2026-09-11T00:00:00.000Z';

function makeSpec(regionCount = 1): ScreenSpec {
  return ScreenSpec.parse({
    version: 1,
    id: 'spec-risk',
    canvasId: 'canvas-risk',
    name: 'Risk',
    intent: 'Exercise the layout-risk checks.',
    audience: 'Test',
    regions: Array.from({ length: regionCount }, (_, index) => ({
      id: `region-${index + 1}`,
      sourceElementId: `el-${index + 1}`,
      role: index === 0 ? 'page-title' : 'insight-card',
      region: index === 0 ? 'hero' : 'primary',
      label: `Region ${index + 1}`,
      purpose: 'Placeholder.',
      sourceBounds: null,
      order: index,
      children: [],
      visibleInStates: [],
      contentShape: 'text',
    })),
    interactions: [],
    states: [
      { id: 'default', label: 'Default', description: 'Content.', hiddenRegions: [], placeholderRegions: [] },
      { id: 'narrow', label: 'Narrow', description: 'Narrow.', hiddenRegions: [], placeholderRegions: [] },
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
  });
}

function makeManifest(overrides: {
  archetype?: VariantManifest['archetype'];
  density?: VariantManifest['form']['density'];
  surface?: VariantManifest['form']['surface'];
  backdrop?: VariantManifest['palette']['backdrop'];
  selectionRecordId?: string;
  regionIds?: string[];
} = {}): VariantManifest {
  const regionIds = overrides.regionIds ?? ['region-1'];
  return VariantManifest.parse({
    version: 1,
    id: 'branch-under-test',
    name: 'Calm Trust',
    archetype: overrides.archetype ?? 'application',
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
      backdrop: overrides.backdrop ?? 'wash',
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
      density: overrides.density ?? 'regular',
      radiusOuterPx: 12,
      radiusStepPx: 2,
      borderWidthPx: 1,
      elevation: 'raised',
      surface: overrides.surface ?? 'solid',
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
      language: 'reveal',
      durationMs: 560,
      easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      staggerMs: 70,
      travel: 0.45,
      reducedMotion: 'fade-only',
    },
    selections: regionIds.map((regionId) => ({
      regionId,
      recordId: overrides.selectionRecordId ?? 'reui-command-menu',
      source: 'canvascraft',
      sourceUrl: 'https://canvascraft.local/patterns/x',
      license: 'canvascraft-original',
      licenseNotice: null,
      matchScore: 0.9,
      matchSource: 'local',
      whyItFits: 'Fits the region role.',
      fallbackReason: null,
    })),
    lineage: {
      specId: 'spec-risk',
      specHash: 'a'.repeat(64),
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
  });
}

describe('findLayoutRiskIssues', () => {
  it('is silent when nothing is risky', () => {
    const issues = findLayoutRiskIssues({
      manifest: makeManifest({ density: 'regular', surface: 'solid', backdrop: 'wash' }),
      spec: makeSpec(1),
      selectionOptions: [{ regionId: 'region-1', recordIds: ['reui-command-menu', 'canvascraft-neutral-shell'] }],
    });
    expect(issues).toEqual([]);
  });

  it('flags a region left on the neutral fallback when a richer pattern was approved', () => {
    const issues = findLayoutRiskIssues({
      manifest: makeManifest({ selectionRecordId: 'canvascraft-neutral-shell' }),
      spec: makeSpec(1),
      selectionOptions: [{ regionId: 'region-1', recordIds: ['canvascraft-neutral-shell', 'reui-command-menu'] }],
    });
    expect(issues.map((issue) => issue.kind)).toContain('neutral-fallback');
    expect(issues[0]?.regionId).toBe('region-1');
  });

  it('does not flag the neutral fallback when it was the only approved option', () => {
    const issues = findLayoutRiskIssues({
      manifest: makeManifest({ selectionRecordId: 'canvascraft-neutral-shell' }),
      spec: makeSpec(1),
      selectionOptions: [{ regionId: 'region-1', recordIds: ['canvascraft-neutral-shell'] }],
    });
    expect(issues.map((issue) => issue.kind)).not.toContain('neutral-fallback');
  });

  it('flags roomy density on a working surface', () => {
    const issues = findLayoutRiskIssues({
      manifest: makeManifest({ archetype: 'application', density: 'roomy' }),
      spec: makeSpec(1),
      selectionOptions: [],
    });
    expect(issues.map((issue) => issue.kind)).toContain('dead-space-risk');
  });

  it('flags glass over a flat backdrop and a flat landing page', () => {
    const glassFlat = findLayoutRiskIssues({
      manifest: makeManifest({ surface: 'glass', backdrop: 'flat' }),
      spec: makeSpec(1),
      selectionOptions: [],
    });
    expect(glassFlat.map((issue) => issue.kind)).toContain('surface-conflict');

    const flatLanding = findLayoutRiskIssues({
      manifest: makeManifest({ archetype: 'marketing', backdrop: 'flat' }),
      spec: makeSpec(1),
      selectionOptions: [],
    });
    expect(flatLanding.map((issue) => issue.kind)).toContain('flat-landing');
  });

  it('flags a long page at roomy density', () => {
    const issues = findLayoutRiskIssues({
      manifest: makeManifest({ archetype: 'marketing', density: 'roomy' }),
      spec: makeSpec(7),
      selectionOptions: [],
    });
    expect(issues.map((issue) => issue.kind)).toContain('long-page-roomy');
  });
});
