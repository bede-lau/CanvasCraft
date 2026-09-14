import { describe, expect, it } from 'vitest';

import {
  AI_GENOME_MAX_LENGTH,
  AiDirectionSet,
  ButtonShape,
  GENOME_MAX_LENGTH,
  MOTION_PRESETS,
  MotionIntensity,
  MotionPreset,
  PageArchetype,
  measureBranch,
  type CanvasDoc,
} from '@canvascraft/schema';

import { getRegistryRecord } from '@canvascraft/registry';

import {
  buildCandidates,
  buildDirections,
  buildDirectionsFromAi,
  compileScreenSpec,
  directionSelectionOptions,
  hashSpec,
  lockedAxisGenomeSuffix,
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
  designPreferences: {
    archetype: 'application',
    displayFont: 'grotesk',
    bodyFont: 'clean',
    buttonShape: 'soft',
    motionPreset: 'calm',
    motionIntensity: 'moderate',
  },
  createdAt,
  updatedAt: createdAt,
};

function direction(name: string, options: Array<{ regionId: string; recordIds: string[] }>) {
  const styleIndex = name === 'Calm Trust' ? 0 : name === 'Focused Clarity' ? 1 : 2;
  const accents = ['#176b63', '#b44f22', '#2c71a9'] as const;
  const backdrops = ['wash', 'aurora', 'flat'] as const;
  const surfaces = ['glass', 'gradient', 'solid'] as const;
  const languages = ['reveal', 'spring', 'cut'] as const;
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
      backdrop: backdrops[styleIndex]!,
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
      surface: surfaces[styleIndex]!,
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
    motionLanguage: languages[styleIndex]!,
    motionEmphasis: styleIndex === 1 ? 'amplified' as const : styleIndex === 2 ? 'restrained' as const : 'balanced' as const,
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
      designPreferences: canvas.designPreferences,
      directionSet,
      createdAt,
    });

    expect(manifests).toHaveLength(3);
    expect(new Set(manifests.map((manifest) => manifest.name)).size).toBe(3);
    expect(manifests.every((manifest) => manifest.selections.length === spec.regions.length)).toBe(true);

    // The axes the canvas toolbar steers are applied after the model and are
    // uniform on purpose, even though the drafts asked for three different
    // motion presets. See applyDesignPreferences.
    expect(manifests.every((manifest) => manifest.archetype === canvas.designPreferences.archetype)).toBe(true);
    expect(manifests.every((manifest) => manifest.motion.preset === canvas.designPreferences.motionPreset)).toBe(true);
    expect(new Set(manifests.map((manifest) => manifest.typography.displayFamily)).size).toBe(1);
    expect(new Set(manifests.map((manifest) => manifest.typography.bodyFamily)).size).toBe(1);
    expect(new Set(manifests.map((manifest) => manifest.controls.buttonShape)).size).toBe(1);

    // Everything the user did not steer must still differ, or the three
    // directions are not a comparison. This is what the locked axes cost.
    expect(new Set(manifests.map((manifest) => manifest.palette.accent)).size).toBe(3);
    expect(new Set(manifests.map((manifest) => `${manifest.form.density}:${manifest.form.radiusOuterPx}`)).size).toBe(3);

    // Motion is the axis the toolbar used to flatten. The preset is shared, but
    // the mechanism and the timings that express it must not be, or the Motion
    // Audition compares three copies of one animation.
    expect(new Set(manifests.map((manifest) => manifest.motion.language)).size).toBe(3);
    expect(new Set(manifests.map((manifest) => manifest.motion.durationMs)).size).toBe(3);
    expect(new Set(manifests.map((manifest) => manifest.motion.staggerMs)).size).toBe(3);
    expect(new Set(manifests.map((manifest) => manifest.form.surface)).size).toBe(3);
    expect(new Set(manifests.map((manifest) => manifest.palette.backdrop)).size).toBe(3);
  });

  it('accepts a genome that spends the whole AI budget once the locked axes are appended', () => {
    const spec = compileScreenSpec(canvas);
    const candidates = buildCandidates(spec);
    const options = directionSelectionOptions({ spec, candidates });
    // The longest suffix applyDesignPreferences can append is the longest value
    // of each locked axis, so this is the worst case a real model output faces.
    const worstCasePreferences = {
      ...canvas.designPreferences,
      archetype: 'ai-native' as const,
      buttonShape: 'sharp' as const,
      motionPreset: 'editorial' as const,
      motionIntensity: 'expressive' as const,
    };
    const maximalGenome = 'x'.repeat(AI_GENOME_MAX_LENGTH);
    const directionSet = AiDirectionSet.parse({
      variants: [
        { ...direction('Calm Trust', options), genome: maximalGenome },
        direction('Focused Clarity', options),
        direction('Editorial Signal', options),
      ],
      contrastSummary: 'The directions vary treatment while keeping the same account-review workflow.',
    });

    const manifests = buildDirectionsFromAi({
      runId: 'run-ai-genome-budget',
      spec,
      specHash: hashSpec(spec),
      candidates,
      designPreferences: worstCasePreferences,
      directionSet,
      createdAt,
    });

    expect(manifests[0]!.genome.startsWith(maximalGenome)).toBe(true);
    expect(manifests[0]!.genome.length).toBeGreaterThan(AI_GENOME_MAX_LENGTH);
    expect(manifests[0]!.genome.length).toBeLessThanOrEqual(GENOME_MAX_LENGTH);
  });

  it('keeps enough manifest headroom for the longest suffix the locked axes can append', () => {
    // Measured from the real suffix builder over every combination of the locked
    // axes, rather than by counting the template's characters by hand. Adding a
    // fifth axis or a longer enum value then fails here, instead of silently
    // pushing every AI direction back into the deterministic fallback the way
    // the original 140/140 pairing did.
    let longestSuffix = 0;
    for (const archetype of PageArchetype.options) {
      for (const buttonShape of ButtonShape.options) {
        for (const motionPreset of MotionPreset.options) {
          for (const motionIntensity of MotionIntensity.options) {
            const suffix = lockedAxisGenomeSuffix({
              ...canvas.designPreferences,
              archetype,
              buttonShape,
              motionPreset,
              motionIntensity,
            });
            longestSuffix = Math.max(longestSuffix, suffix.length);
          }
        }
      }
    }

    expect(longestSuffix).toBeGreaterThan(0);
    expect(GENOME_MAX_LENGTH - AI_GENOME_MAX_LENGTH).toBeGreaterThanOrEqual(longestSuffix);
  });

  it('bends the toolbar motion preset per direction instead of flattening all three onto it', () => {
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
      designPreferences: { ...canvas.designPreferences, motionPreset: 'playful' },
      directionSet,
      createdAt,
    });

    // The preset is the run's tempo, so it stays uniform: "playful" has to mean
    // one thing in every branch or the audition compares nothing.
    expect(manifests.every((manifest) => manifest.motion.preset === 'playful')).toBe(true);

    // The timings that express it are the direction's own. The amplified draft
    // must run longer than the restrained one, and the balanced one must sit at
    // the preset's own baseline rather than every branch sharing it.
    const [balanced, amplified, restrained] = manifests;
    expect(balanced!.motion.durationMs).toBe(MOTION_PRESETS.playful.durationMs);
    expect(amplified!.motion.durationMs).toBeGreaterThan(balanced!.motion.durationMs);
    expect(restrained!.motion.durationMs).toBeLessThan(balanced!.motion.durationMs);
    expect(new Set(manifests.map((manifest) => manifest.motion.language))).toEqual(
      new Set(['reveal', 'spring', 'cut']),
    );
  });

  it('keeps every deterministic archetype direction inside the run’s accessibility floors', () => {
    // The palettes in ARCHETYPE_RECIPES are hand-tuned, and hand-tuning is
    // exactly the kind of claim that rots. Measuring all four archetypes here
    // means a new palette that fails a contrast floor fails the build rather
    // than shipping a branch the Design Director immediately flags as broken.
    const spec = compileScreenSpec(canvas);
    const candidates = buildCandidates(spec);

    for (const archetype of PageArchetype.options) {
      const manifests = buildDirections({
        runId: `run-${archetype}`,
        spec,
        specHash: hashSpec(spec),
        candidates,
        designPreferences: { ...canvas.designPreferences, archetype },
        createdAt,
      });

      expect(manifests).toHaveLength(3);
      for (const manifest of manifests) {
        const failures = measureBranch(manifest, spec.accessibility).filter((entry) => !entry.passes);
        expect(failures.map((entry) => `${archetype}/${manifest.name}: ${entry.evidence}`)).toEqual([]);
      }

      // Within an archetype the three directions must still be a comparison.
      expect(new Set(manifests.map((manifest) => manifest.palette.name)).size).toBe(3);
      expect(new Set(manifests.map((manifest) => manifest.motion.language)).size).toBe(3);
      expect(manifests.every((entry) => entry.archetype === archetype)).toBe(true);
    }
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
        designPreferences: canvas.designPreferences,
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
        designPreferences: canvas.designPreferences,
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
    duplicateStyle.motionLanguage = direction('Calm Trust', options).motionLanguage;
    duplicateStyle.motionEmphasis = direction('Calm Trust', options).motionEmphasis;
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
        designPreferences: canvas.designPreferences,
        directionSet,
        createdAt,
      }),
    ).toThrow('materially distinct');
  });

  it('applies the canvas typography, control, and motion preferences to every local direction', () => {
    const spec = compileScreenSpec(canvas);
    const manifests = buildDirections({
      runId: 'run-design-system',
      spec,
      specHash: hashSpec(spec),
      candidates: buildCandidates(spec),
      designPreferences: {
        archetype: 'application',
        displayFont: 'serif',
        bodyFont: 'humanist',
        buttonShape: 'pill',
        motionPreset: 'playful',
        motionIntensity: 'subtle',
      },
      createdAt,
    });

    expect(manifests).toHaveLength(3);
    expect(manifests.every((manifest) => manifest.typography.displayFamily.includes('Georgia'))).toBe(true);
    expect(manifests.every((manifest) => manifest.typography.bodyFamily.includes('Segoe UI'))).toBe(true);
    expect(manifests.every((manifest) => manifest.controls.buttonShape === 'pill')).toBe(true);
    expect(manifests.every((manifest) => manifest.motion.preset === 'playful')).toBe(true);
    // Subtle intensity scales every direction down without erasing the spread
    // between them: the toolbar spends less motion, it does not pick the motion.
    expect(manifests.every((manifest) => manifest.motion.travel < MOTION_PRESETS.playful.travel)).toBe(true);
    expect(new Set(manifests.map((manifest) => manifest.motion.travel)).size).toBe(3);
  });

  it('collapses every direction to instant motion when the canvas asks for none', () => {
    const spec = compileScreenSpec(canvas);
    const manifests = buildDirections({
      runId: 'run-still',
      spec,
      specHash: hashSpec(spec),
      candidates: buildCandidates(spec),
      designPreferences: { ...canvas.designPreferences, motionIntensity: 'none' },
      createdAt,
    });

    // "None" is an accessibility-shaped request, not a taste one, so a
    // direction's own motion personality must not survive it.
    expect(manifests.every((manifest) => manifest.motion.travel === 0)).toBe(true);
    expect(manifests.every((manifest) => manifest.motion.staggerMs === 0)).toBe(true);
    expect(manifests.every((manifest) => manifest.motion.language === 'cut')).toBe(true);
    expect(manifests.every((manifest) => manifest.motion.reducedMotion === 'instant')).toBe(true);
  });
});

describe('context-fit selection guard', () => {
  const insightCanvas: CanvasDoc = {
    ...canvas,
    id: 'canvas-insight',
    elements: [
      ...canvas.elements,
      { id: 'card', kind: 'card', bounds: { x: 80, y: 620, width: 360, height: 220 }, rotation: 0, z: 2, label: 'Priority insights', children: [] },
    ],
  };

  it('keeps an expressive-motion pattern out of a scanned body region', () => {
    const spec = compileScreenSpec(insightCanvas);
    const insight = spec.regions.find((region) => region.role === 'insight-card');
    expect(insight).toBeDefined();

    const forInsight = buildCandidates(spec, 'application').find(
      (entry) => entry.regionId === insight!.id,
    )!;

    expect(forInsight.matches.some((match) => match.recordId === 'react-bits-card-swap')).toBe(false);
    expect(
      forInsight.rejected.some(
        (entry) => entry.recordId === 'react-bits-card-swap' && /expressive/i.test(entry.reason),
      ),
    ).toBe(true);
  });

  it('still offers a stacked treatment for a portfolio media showcase', () => {
    const mediaCanvas: CanvasDoc = {
      ...canvas,
      id: 'canvas-media',
      elements: [
        ...canvas.elements,
        { id: 'media', kind: 'media', bounds: { x: 80, y: 620, width: 900, height: 360 }, rotation: 0, z: 2, label: 'Selected work', children: [] },
      ],
    };
    const spec = compileScreenSpec(mediaCanvas);
    const media = spec.regions.find((region) => region.role === 'media-card')!;

    const forMedia = buildCandidates(spec, 'portfolio').find((entry) => entry.regionId === media.id)!;
    expect(forMedia.matches.some((match) => match.recordId === 'react-bits-card-swap')).toBe(true);
  });

  it('lets an application surface carry expressive motion only in its hero', () => {
    const spec = compileScreenSpec(insightCanvas);
    const candidates = buildCandidates(spec, 'application');

    for (const region of spec.regions) {
      const forRegion = candidates.find((entry) => entry.regionId === region.id)!;
      for (const match of forRegion.matches) {
        if (getRegistryRecord(match.recordId)?.motionIntensity === 'expressive') {
          expect(region.role).toBe('hero-statement');
        }
      }
    }
  });
});
