import { z } from 'zod';
import { MotionPreset, Slug } from './primitives.js';
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
    durationMs: 260,
    easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
    staggerMs: 40,
    travel: 0.25,
    reducedMotion: 'fade-only',
  },
  playful: {
    preset: 'playful',
    durationMs: 380,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    staggerMs: 70,
    travel: 0.7,
    reducedMotion: 'fade-only',
  },
  editorial: {
    preset: 'editorial',
    durationMs: 180,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    staggerMs: 20,
    travel: 0.1,
    reducedMotion: 'instant',
  },
};

/** One-line explanation of each preset, shown in the inspector. */
export const MOTION_PRESET_INTENT: Record<MotionPreset, string> = {
  calm: 'Slow, low-travel easing. Movement confirms a change without asking for attention.',
  playful: 'Overshooting spring with visible stagger. Movement celebrates the change.',
  editorial: 'Fast and nearly flat. Movement gets out of the way of reading.',
};
