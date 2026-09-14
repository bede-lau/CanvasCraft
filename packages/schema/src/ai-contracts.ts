import { z } from 'zod';
import {
  AI_GENOME_MAX_LENGTH,
  BackdropTreatment,
  HexColor,
  InteractionKind,
  LayoutRegion,
  MotionLanguage,
  MotionPreset,
  SemanticRole,
  Slug,
  StateKind,
  SurfaceTreatment,
} from './primitives.js';
import { IntentTag } from './registry.js';
import { RecommendationSeverity, RecommendationSurface } from './director.js';

/**
 * AI-facing contracts.
 *
 * These are deliberately *not* the internal schemas. Three reasons:
 *
 * 1. Strict structured-output mode forbids optional properties, so every field
 *    here is required and uses `.nullable()` where absence is meaningful.
 * 2. The model should only produce what it is genuinely better at than code.
 *    Ids, hashes, provenance, licences, and lineage are filled in by the
 *    orchestrator, so they are absent here — a model cannot get them wrong if
 *    it is never asked for them.
 * 3. Smaller schemas produce better output and cost less.
 */

/* -------------------------------------------------------------------------- */
/* Stage 3 — interpret the canvas into a Screen Spec                           */
/* -------------------------------------------------------------------------- */

export const AiRegionDraft = z.object({
  /** Kebab-case, stable, meaningful: "revenue-metrics", not "region-1". */
  id: Slug,
  /** Canvas element id this came from, or null for something only implied. */
  sourceElementId: z.string().nullable(),
  role: SemanticRole,
  region: LayoutRegion,
  label: z.string(),
  purpose: z.string(),
  order: z.number().int(),
  children: z.array(Slug),
  visibleInStates: z.array(StateKind),
  contentShape: z.enum([
    'none',
    'text',
    'metric',
    'record-list',
    'record-table',
    'media-grid',
    'form-fields',
    'nav-items',
  ]),
});
export type AiRegionDraft = z.infer<typeof AiRegionDraft>;

export const AiInteractionDraft = z.object({
  id: Slug,
  sourceArrowId: z.string().nullable(),
  kind: InteractionKind,
  fromRegion: Slug,
  toRegion: Slug,
  fromState: StateKind.nullable(),
  toState: StateKind,
  description: z.string(),
  auditionable: z.boolean(),
});
export type AiInteractionDraft = z.infer<typeof AiInteractionDraft>;

export const AiStateDraft = z.object({
  id: StateKind,
  label: z.string(),
  description: z.string(),
  hiddenRegions: z.array(Slug),
  placeholderRegions: z.array(Slug),
});
export type AiStateDraft = z.infer<typeof AiStateDraft>;

/**
 * Fixture records are modelled as explicit field lists rather than free-form
 * objects, because strict mode has no way to express "an object with arbitrary
 * keys" and a `z.record` would be rejected.
 */
export const AiFixtureDraft = z.object({
  regionId: Slug,
  records: z.array(
    z.object({
      fields: z.array(
        z.object({
          key: z.string(),
          value: z.string(),
        }),
      ),
    }),
  ),
});
export type AiFixtureDraft = z.infer<typeof AiFixtureDraft>;

export const AiAmbiguityDraft = z.object({
  id: Slug,
  question: z.string(),
  impact: z.string(),
  options: z.array(
    z.object({
      id: Slug,
      label: z.string(),
      description: z.string(),
    }),
  ),
  defaultOptionId: Slug,
});
export type AiAmbiguityDraft = z.infer<typeof AiAmbiguityDraft>;

export const AiScreenSpecDraft = z.object({
  name: z.string(),
  intent: z.string(),
  audience: z.string(),
  regions: z.array(AiRegionDraft),
  interactions: z.array(AiInteractionDraft),
  states: z.array(AiStateDraft),
  fixtures: z.array(AiFixtureDraft),
  /**
   * Only decisions that materially change the screen. An empty array is the
   * expected answer for a clear wireframe; asking about a detail nobody cares
   * about is worse than picking a sensible default.
   */
  ambiguities: z.array(AiAmbiguityDraft),
  stacksBelowNarrow: z.array(Slug),
  collapsesBelowNarrow: z.array(Slug),
});
export type AiScreenSpecDraft = z.infer<typeof AiScreenSpecDraft>;

/* -------------------------------------------------------------------------- */
/* Stage 5 — turn regions into retrieval requests                              */
/* -------------------------------------------------------------------------- */

export const AiRetrievalRequest = z.object({
  regionId: Slug,
  /** Intent tags to search by. Ordered most to least important. */
  intentTags: z.array(IntentTag),
  /** What this region needs from a pattern, in one sentence. */
  semanticQuery: z.string(),
  /** True when a motion-forward pattern would genuinely serve this region. */
  wantsMotion: z.boolean(),
  /** How much this region matters to the screen, 0–1. Ranks the query budget. */
  prominence: z.number(),
});
export type AiRetrievalRequest = z.infer<typeof AiRetrievalRequest>;

export const AiRetrievalPlan = z.object({
  requests: z.array(AiRetrievalRequest),
});
export type AiRetrievalPlan = z.infer<typeof AiRetrievalPlan>;

/* -------------------------------------------------------------------------- */
/* Stage 8 — propose three directions                                          */
/* -------------------------------------------------------------------------- */

export const AiPaletteDraft = z.object({
  name: z.string().max(60),
  background: HexColor,
  surface: HexColor,
  surfaceRaised: HexColor,
  border: HexColor,
  textPrimary: HexColor,
  textSecondary: HexColor,
  accent: HexColor,
  accentContrast: HexColor,
  positive: HexColor,
  critical: HexColor,
  scheme: z.enum(['light', 'dark']),
  backdrop: BackdropTreatment,
});
export type AiPaletteDraft = z.infer<typeof AiPaletteDraft>;

export const AiTypographyDraft = z.object({
  displayFamily: z.string().max(200),
  bodyFamily: z.string().max(200),
  monoFamily: z.string().max(200),
  scaleRatio: z.number().min(1.05).max(1.7),
  baseSizePx: z.number().min(13).max(18),
  displayWeight: z.number().int().min(300).max(900),
  bodyWeight: z.number().int().min(300).max(600),
  displayTrackingEm: z.number().min(-0.06).max(0.08),
  bodyLeading: z.number().min(1.2).max(1.9),
});
export type AiTypographyDraft = z.infer<typeof AiTypographyDraft>;

export const AiFormDraft = z.object({
  spaceUnitPx: z.number().min(2).max(10),
  density: z.enum(['compact', 'regular', 'roomy']),
  radiusOuterPx: z.number().min(0).max(28),
  radiusStepPx: z.number().min(0).max(8),
  borderWidthPx: z.number().min(0.5).max(2),
  elevation: z.enum(['flat', 'hairline', 'raised', 'lifted']),
  surface: SurfaceTreatment,
});
export type AiFormDraft = z.infer<typeof AiFormDraft>;

export const AiControlsDraft = z.object({
  buttonShape: z.enum(['sharp', 'soft', 'pill']),
  buttonFill: z.enum(['solid', 'tonal', 'outline', 'ghost']),
  inputStyle: z.enum(['outlined', 'filled', 'underlined']),
  iconWeight: z.enum(['light', 'regular', 'bold']),
  iconSizePx: z.number().min(14).max(24),
  focusRing: z.enum(['ring', 'outline', 'underglow']),
});
export type AiControlsDraft = z.infer<typeof AiControlsDraft>;

export const AiSelectionDraft = z.object({
  regionId: Slug,
  /** Must be one of the gate-approved candidate ids offered for this region. */
  recordId: Slug,
  whyItFits: z.string().max(400),
});
export type AiSelectionDraft = z.infer<typeof AiSelectionDraft>;

export const AiVariantDraft = z.object({
  /** Two words, title case, e.g. "Calm Trust". */
  name: z.string().max(60),
  /**
   * "Midnight palette · rounded controls · calm motion" — three traits,
   * dot-separated. Shorter than the manifest's own cap on purpose: the compiler
   * appends the locked toolbar axes to this before parsing the manifest.
   */
  genome: z.string().max(AI_GENOME_MAX_LENGTH),
  /** What this direction argues for, in one sentence. */
  rationale: z.string().max(400),
  palette: AiPaletteDraft,
  typography: AiTypographyDraft,
  form: AiFormDraft,
  controls: AiControlsDraft,
  motionPreset: MotionPreset,
  /**
   * The direction's motion mechanism. Unlike `motionPreset` — which the toolbar
   * locks and the compiler overwrites — this one survives, so it is the model's
   * strongest lever for making three directions genuinely different rather than
   * three palettes of one page.
   */
  motionLanguage: MotionLanguage,
  /**
   * How hard this direction leans on its language, relative to the run's
   * preset. The compiler turns this into bounded duration, stagger, and travel
   * multipliers, so a model can ask for "more" without inventing timings.
   */
  motionEmphasis: z.enum(['restrained', 'balanced', 'amplified']),
  selections: z.array(AiSelectionDraft),
});
export type AiVariantDraft = z.infer<typeof AiVariantDraft>;

export const AiDirectionSet = z.object({
  variants: z.array(AiVariantDraft).length(3),
  /** What meaningfully separates the three, in one sentence. Shown in the UI. */
  contrastSummary: z.string().max(400),
});
export type AiDirectionSet = z.infer<typeof AiDirectionSet>;

/* -------------------------------------------------------------------------- */
/* Design Director — recommendations and patches                               */
/* -------------------------------------------------------------------------- */

/**
 * Deltas the Director may propose.
 *
 * Every field is nullable rather than optional, and the set is a flat allow-list
 * rather than a partial of the manifest, because strict mode cannot express
 * a partial and because a flat list makes it obvious what the Director can and
 * cannot reach. It cannot reach anything in the Screen Spec.
 */
export const AiDelta = z.object({
  paletteAccent: HexColor.nullable(),
  paletteTextPrimary: HexColor.nullable(),
  paletteTextSecondary: HexColor.nullable(),
  paletteSurface: HexColor.nullable(),
  /** Change what sits behind the page: flat, wash, aurora, grain, spotlight. */
  paletteBackdrop: BackdropTreatment.nullable(),
  typographyBaseSizePx: z.number().nullable(),
  typographyDisplayWeight: z.number().nullable(),
  typographyDisplayTrackingEm: z.number().nullable(),
  typographyBodyLeading: z.number().nullable(),
  typographyScaleRatio: z.number().nullable(),
  formSpaceUnitPx: z.number().nullable(),
  formDensity: z.enum(['compact', 'regular', 'roomy']).nullable(),
  formRadiusOuterPx: z.number().nullable(),
  formElevation: z.enum(['flat', 'hairline', 'raised', 'lifted']).nullable(),
  /** Change what panels are made of: solid, glass, gradient, outline. */
  formSurface: SurfaceTreatment.nullable(),
  controlsButtonShape: z.enum(['sharp', 'soft', 'pill']).nullable(),
  controlsButtonFill: z.enum(['solid', 'tonal', 'outline', 'ghost']).nullable(),
  controlsFocusRing: z.enum(['ring', 'outline', 'underglow']).nullable(),
  controlsIconSizePx: z.number().nullable(),
  motionPreset: MotionPreset.nullable(),
  /** Change the mechanism: reveal, cascade, spring, parallax, cut. */
  motionLanguage: MotionLanguage.nullable(),
  motionDurationMs: z.number().nullable(),
  motionStaggerMs: z.number().nullable(),
  motionTravel: z.number().nullable(),
  /** Swap one region's pattern for another gate-approved candidate. */
  selectionSwaps: z.array(z.object({ regionId: Slug, recordId: Slug })),
});
export type AiDelta = z.infer<typeof AiDelta>;

export const AiRecommendationDraft = z.object({
  surface: RecommendationSurface,
  severity: RecommendationSeverity,
  title: z.string(),
  rationale: z.string(),
  regionId: Slug.nullable(),
  evidence: z.string(),
  delta: AiDelta,
});
export type AiRecommendationDraft = z.infer<typeof AiRecommendationDraft>;

export const AiRecommendationSet = z.object({
  recommendations: z.array(AiRecommendationDraft).min(3).max(6),
});
export type AiRecommendationSet = z.infer<typeof AiRecommendationSet>;

export const AiPatchPlan = z.object({
  /** What the Director understood the user to be asking for. */
  interpretation: z.string(),
  /** The region the request resolves to. */
  regionId: Slug,
  delta: AiDelta,
  /** Set when the request cannot be honoured without changing the Screen Spec. */
  refusalReason: z.string().nullable(),
});
export type AiPatchPlan = z.infer<typeof AiPatchPlan>;
