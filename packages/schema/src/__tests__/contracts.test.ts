import { describe, expect, it } from 'vitest';

import {
  BODY_CONTENT_ROLES,
  canonicalJson,
  composeRemix,
  contrastRatio,
  controlHeightPx,
  findCanvasIntegrityIssues,
  findManifestContextIssues,
  findManifestIntegrityIssues,
  findSpecIntegrityIssues,
  measureBranch,
  readinessScore,
  summariseCanvasReadiness,
  unreachableRegions,
  ScreenSpec,
  type CanvasDoc,
  type ManifestPatternContext,
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
    archetype: 'application',
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
      backdrop: 'wash',
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
      surface: 'glass',
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

  it('rejects region nesting that is a graph rather than a forest', () => {
    const spec = makeSpec();
    const child = { ...spec.regions[0]!, id: 'shared-child', sourceElementId: 'child', order: 1 };
    const first = { ...spec.regions[0]!, id: 'first-parent', children: ['shared-child'] };
    const second = { ...spec.regions[0]!, id: 'second-parent', sourceElementId: 'other', order: 2, children: ['shared-child'] };
    spec.regions = [first, second, child];

    expect(findSpecIntegrityIssues(spec)).toContain(
      'Region "shared-child" is nested inside both "first-parent" and "second-parent".',
    );
  });

  it('rejects a nesting cycle that would never finish rendering', () => {
    const spec = makeSpec();
    const outer = { ...spec.regions[0]!, id: 'outer', children: ['inner'] };
    const inner = { ...spec.regions[0]!, id: 'inner', sourceElementId: 'inner', order: 1, children: ['outer'] };
    spec.regions = [outer, inner];

    const issues = findSpecIntegrityIssues(spec);
    expect(issues.some((issue) => issue.startsWith('Region nesting forms a cycle'))).toBe(true);
  });

  it('rejects a region that nests itself', () => {
    const spec = makeSpec();
    spec.regions = [{ ...spec.regions[0]!, children: ['page-title'] }];

    expect(findSpecIntegrityIssues(spec)).toContain('Region "page-title" nests itself.');
  });

  it('accepts nesting that is a plain tree', () => {
    const spec = makeSpec();
    const parent = { ...spec.regions[0]!, id: 'parent', children: ['child-a', 'child-b'] };
    const childA = { ...spec.regions[0]!, id: 'child-a', sourceElementId: 'a', order: 1 };
    const childB = { ...spec.regions[0]!, id: 'child-b', sourceElementId: 'b', order: 2 };
    spec.regions = [parent, childA, childB];

    expect(findSpecIntegrityIssues(spec)).toEqual([]);
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
    playful.motion = { ...playful.motion, preset: 'playful', language: 'spring', durationMs: 500, travel: 0.8 };

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

  it('refuses a remix that would put one archetype’s motion inside another’s shell', () => {
    const application = makeManifest('branch-application');
    const marketing = makeManifest('branch-marketing');
    marketing.archetype = 'marketing';
    marketing.motion = { ...marketing.motion, language: 'parallax' };

    expect(() =>
      composeRemix({
        id: 'branch-cross-archetype',
        name: 'Cross archetype',
        genome: 'Mixed',
        rationale: 'Should never be created.',
        createdAt: timestamp,
        sources: {
          palette: application,
          typography: application,
          form: application,
          controls: application,
          motion: marketing,
          selections: application,
        },
      }),
    ).toThrow('Trait Remix requires every parent manifest to share one page archetype.');
  });

  it('carries the shared archetype onto a remix instead of dropping it', () => {
    const portfolio = makeManifest('branch-portfolio');
    portfolio.archetype = 'portfolio';
    const remix = composeRemix({
      id: 'branch-portfolio-remix',
      name: 'Portfolio Remix',
      genome: 'Ink palette · soft controls · calm motion',
      rationale: 'Same archetype, recombined traits.',
      createdAt: timestamp,
      sources: {
        palette: portfolio,
        typography: portfolio,
        form: portfolio,
        controls: portfolio,
        motion: portfolio,
        selections: portfolio,
      },
    });

    expect(remix.archetype).toBe('portfolio');
  });
});

describe('manifest context backstop', () => {
  function specWithInsight(): ScreenSpec {
    const spec = makeSpec();
    spec.regions.push({
      id: 'insight-deck',
      sourceElementId: 'insights',
      role: 'insight-card',
      region: 'primary',
      label: 'Priority insights',
      purpose: 'Rank the signals that need attention.',
      sourceBounds: null,
      order: 1,
      children: [],
      visibleInStates: [],
      contentShape: 'record-list',
    });
    return spec;
  }

  function manifestSelecting(recordId: string, regionId = 'insight-deck'): VariantManifest {
    const manifest = makeManifest();
    manifest.selections = [
      manifest.selections[0]!,
      {
        regionId,
        recordId,
        source: 'react-bits',
        sourceUrl: 'https://reactbits.dev/components/card-swap',
        license: 'mit-commons-clause',
        licenseNotice: 'React Bits notice retained.',
        matchScore: 0.9,
        matchSource: 'local',
        whyItFits: 'Selected for the test.',
        fallbackReason: null,
      },
    ];
    return manifest;
  }

  const expressive: ManifestPatternContext = {
    name: 'Card Swap',
    motionIntensity: 'expressive',
    mobileRisk: 'medium',
    fallbackId: 'canvascraft-neutral-card-grid',
  };
  const resolve =
    (map: Record<string, ManifestPatternContext>) => (id: string) => map[id];

  it('rejects an expressive-motion pattern on a scanned body region', () => {
    const issues = findManifestContextIssues(
      manifestSelecting('card-swap'),
      specWithInsight(),
      resolve({ 'card-swap': expressive }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/expressive-motion pattern "Card Swap"/);
  });

  it('allows the same pattern on a hero region', () => {
    const spec = makeSpec();
    spec.regions[0]!.role = 'hero-statement';
    const manifest = manifestSelecting('card-swap', 'page-title');
    manifest.selections = [manifest.selections[1]!];
    manifest.archetype = 'marketing';
    expect(findManifestContextIssues(manifest, spec, resolve({ 'card-swap': expressive }))).toEqual([]);
  });

  it('flags an application surface that animates a non-hero region', () => {
    const spec = makeSpec();
    spec.regions[0]!.role = 'nav-primary';
    const manifest = manifestSelecting('card-swap', 'page-title');
    manifest.selections = [manifest.selections[1]!];
    const issues = findManifestContextIssues(manifest, spec, resolve({ 'card-swap': expressive }));
    expect(issues.some((issue) => /only a hero region may carry that motion/.test(issue))).toBe(true);
  });

  it('ignores a selection whose record cannot be resolved', () => {
    const manifest = manifestSelecting('unknown-record');
    expect(findManifestContextIssues(manifest, specWithInsight(), () => undefined)).toEqual([]);
  });

  it('flags a high-mobile-risk pattern with no narrow fallback', () => {
    const risky: ManifestPatternContext = {
      name: 'Risky Table',
      motionIntensity: 'none',
      mobileRisk: 'high',
      fallbackId: null,
    };
    const issues = findManifestContextIssues(
      manifestSelecting('risky'),
      specWithInsight(),
      resolve({ risky }),
    );
    expect(issues.some((issue) => /high mobile risk/.test(issue))).toBe(true);
  });

  it('names the roles that must stay still', () => {
    expect(BODY_CONTENT_ROLES.has('insight-card')).toBe(true);
    expect(BODY_CONTENT_ROLES.has('data-table')).toBe(true);
    expect(BODY_CONTENT_ROLES.has('hero-statement')).toBe(false);
  });
});

describe('branch measurement', () => {
  it('computes WCAG contrast ratios against known reference pairs', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // The canonical 4.5:1 boundary example from the WCAG technique notes.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.6);
  });

  it('is symmetric in its arguments', () => {
    expect(contrastRatio('#176b63', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#176b63'), 10);
  });

  it('fails the touch-target check when the rendered control is under the floor', () => {
    const manifest = makeManifest();
    manifest.controls.iconSizePx = 16;
    manifest.form.spaceUnitPx = 3;
    manifest.form.density = 'compact';

    expect(controlHeightPx(manifest)).toBeLessThan(44);
    const touch = measureBranch(manifest, makeSpec().accessibility).find((entry) => entry.id === 'touch-target');
    expect(touch?.passes).toBe(false);
    expect(touch?.evidence).toContain('44px required');
  });

  it('scores readiness as the share of checks that actually pass', () => {
    const spec = makeSpec();
    const manifest = makeManifest();
    const measurements = measureBranch(manifest, spec.accessibility);
    const readiness = readinessScore(manifest, spec.accessibility);

    expect(readiness.total).toBe(measurements.length);
    expect(readiness.passed).toBe(measurements.filter((entry) => entry.passes).length);
    expect(readiness.score).toBe(Math.round((readiness.passed / readiness.total) * 100));
  });

  it('treats an empty visibleInStates as present everywhere, not as unreachable', () => {
    const spec = makeSpec();
    expect(spec.regions[0]!.visibleInStates).toEqual([]);
    expect(unreachableRegions(spec)).toEqual([]);

    spec.regions = [{ ...spec.regions[0]!, visibleInStates: ['modal'] }];
    expect(unreachableRegions(spec)).toEqual(['page-title']);
  });
});
