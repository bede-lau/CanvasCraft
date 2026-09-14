import { z } from 'zod';
import { MotionLanguage, MotionPreset, PageArchetype, Slug } from './primitives.js';
import { PaletteTraits, ControlTraits, FormTraits, MotionTraits, TypographyTraits } from './manifest.js';

/**
 * Design Director outputs.
 *
 * A recommendation is a *proposal plus the delta that would apply it*, so
 * apply and revert are both mechanical. Nothing here can change the Screen
 * Spec — the Director tunes treatment, never product intent.
 */

export const RecommendationSurface = z.enum([
  'hierarchy',
  'state-completeness',
  'accessibility',
  'motion',
  'readability',
  'touch-target',
  'contrast',
]);
export type RecommendationSurface = z.infer<typeof RecommendationSurface>;

export const RecommendationSeverity = z.enum(['blocker', 'improvement', 'polish']);
export type RecommendationSeverity = z.infer<typeof RecommendationSeverity>;

/**
 * A partial manifest patch. Each key is optional; applying a delta is a
 * shallow merge per trait group, which keeps revert a matter of storing the
 * previous values rather than re-running generation.
 */
export const ManifestDelta = z.object({
  palette: PaletteTraits.partial().optional(),
  typography: TypographyTraits.partial().optional(),
  form: FormTraits.partial().optional(),
  controls: ControlTraits.partial().optional(),
  motion: MotionTraits.partial().optional(),
  /** Swap the pattern selected for one region to another compatible record. */
  selectionSwaps: z
    .array(z.object({ regionId: Slug, recordId: Slug }))
    .default([]),
});
export type ManifestDelta = z.infer<typeof ManifestDelta>;

export const Recommendation = z.object({
  id: z.string().min(1),
  /** Branch this applies to. Recommendations are never cross-branch. */
  branchId: z.string().min(1),
  surface: RecommendationSurface,
  severity: RecommendationSeverity,
  /** Imperative and specific: "Raise body contrast on the metric tiles". */
  title: z.string().max(120),
  /** What is wrong and what changes if applied. Two sentences at most. */
  rationale: z.string().max(500),
  /** Region this concerns, when it is local. */
  regionId: Slug.nullable().default(null),
  /** The change itself. */
  delta: ManifestDelta,
  /** Measured evidence where there is any, e.g. "contrast 3.1:1, needs 4.5:1". */
  evidence: z.string().max(240).default(''),
  /**
   * Who produced this. The UI labels the two differently on purpose: a measured
   * finding is reproducible from the manifest, an AI one is a design argument.
   */
  source: z.enum(['measured', 'ai']).default('measured'),
  state: z.enum(['proposed', 'applied', 'reverted', 'dismissed']).default('proposed'),
  createdAt: z.string(),
});
export type Recommendation = z.infer<typeof Recommendation>;

/**
 * A scoped patch: one region, one branch, no regeneration.
 *
 * The user's words go in `request`; the resolved change goes in `delta`. Both
 * are kept so the Design Director can explain what it understood.
 */
export const PatchInstruction = z.object({
  id: z.string().min(1),
  branchId: z.string().min(1),
  regionId: Slug,
  /** The user's own phrasing, e.g. "make this card calmer". */
  request: z.string().max(500),
  /** What the Director understood, in its own words. Shown before applying. */
  interpretation: z.string().max(400),
  delta: ManifestDelta,
  /** Manifest values before the patch, so revert needs no regeneration. */
  revertTo: ManifestDelta,
  state: z.enum(['proposed', 'applying', 'applied', 'failed', 'reverted']).default('proposed'),
  error: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type PatchInstruction = z.infer<typeof PatchInstruction>;

/**
 * Fixed motion preset definitions.
 *
 * These are the product's semantic vocabulary for motion. They are literals,
 * not model output: "Calm" must mean the same thing in every branch and every
 * run, or Motion Audition compares nothing.
 */
export const MOTION_PRESETS: Record<MotionPreset, MotionTraits> = {
  calm: {
    preset: 'calm',
    language: 'reveal',
    durationMs: 560,
    easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    staggerMs: 70,
    travel: 0.45,
    reducedMotion: 'fade-only',
  },
  playful: {
    preset: 'playful',
    language: 'spring',
    durationMs: 500,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    staggerMs: 95,
    travel: 0.8,
    reducedMotion: 'fade-only',
  },
  editorial: {
    preset: 'editorial',
    language: 'cut',
    durationMs: 300,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    staggerMs: 34,
    travel: 0.22,
    reducedMotion: 'instant',
  },
};

/** One-line explanation of each preset, shown in the inspector. */
export const MOTION_PRESET_INTENT: Record<MotionPreset, string> = {
  calm: 'Long, low-overshoot easing. Sections resolve into place as you reach them.',
  playful: 'Overshooting spring with visible stagger. Movement celebrates the change.',
  editorial: 'Fast and nearly flat. Movement gets out of the way of reading.',
};

/** One-line explanation of each motion language, shown beside the preset. */
export const MOTION_LANGUAGE_INTENT: Record<MotionLanguage, string> = {
  reveal: 'Sections fade and rise as they enter the viewport, once each.',
  cascade: 'Siblings arrive in sequence, so a group reads as a group.',
  spring: 'Entrances overshoot and settle; pressing anything pushes back.',
  parallax: 'Foreground and background move at different rates against the scroll.',
  cut: 'No travel. Changes are instant and carried by type and colour.',
};

/**
 * What each archetype is for, in the user's terms.
 *
 * Shown beside the toolbar control, because picking the wrong archetype is the
 * most expensive mistake available on that toolbar: it changes the whole
 * vocabulary, not one token.
 */
export const ARCHETYPE_INTENT: Record<PageArchetype, string> = {
  marketing: 'Landing page. Oversized display type, moving gradient ground, scroll-driven reveals.',
  application: 'Product surface. Bento panels, real depth, dense data, restrained spring feedback.',
  portfolio: 'Editorial work. Large media, parallax, text-mask reveals, grain.',
  'ai-native': 'AI product. Aurora ground, streaming and thinking primitives, prompt-shaped inputs.',
};
