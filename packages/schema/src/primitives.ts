import { z } from 'zod';

/**
 * Closed vocabularies.
 *
 * Every one of these is deliberately small. The PRD's first risk is that
 * generation becomes unreliable, and its mitigation is a narrow stamp and
 * interaction vocabulary. Anything outside these sets falls back to a neutral
 * component rather than being invented.
 */

/** The ten UI stamps the Canvas Studio offers. */
export const StampKind = z.enum([
  'navbar',
  'hero',
  'card',
  'button',
  'input',
  'table',
  'tab',
  'media',
  'modal',
  'sidebar',
]);
export type StampKind = z.infer<typeof StampKind>;

/**
 * What an interaction arrow means. Each maps to a local UI change only —
 * nothing here can imply a network request.
 */
export const InteractionKind = z.enum([
  'navigate-tab',
  'open-modal',
  'open-drawer',
  'show-filtered-state',
  'select-item',
  'advance-carousel',
  'next-step',
  'submit-with-validation',
  'show-toast',
  'reset-state',
]);
export type InteractionKind = z.infer<typeof InteractionKind>;

/**
 * The local UI states a branch can render. `default` and `narrow` are always
 * required; the rest are selected by the Intent Compiler based on what was
 * actually drawn.
 */
export const StateKind = z.enum([
  'default',
  'loading',
  'empty',
  'filtered',
  'selected',
  'modal',
  'drawer',
  'success',
  'error',
  'narrow',
]);
export type StateKind = z.infer<typeof StateKind>;

/** Where an element sits in the page. Locked across branches. */
export const LayoutRegion = z.enum([
  'header',
  'sidebar',
  'hero',
  'primary',
  'secondary',
  'aside',
  'footer',
  'overlay',
]);
export type LayoutRegion = z.infer<typeof LayoutRegion>;

/**
 * Semantic role of an element. Richer than StampKind because the compiler
 * resolves a drawn `card` into e.g. `metric-tile` or `insight-card` using the
 * surrounding notes.
 */
export const SemanticRole = z.enum([
  'app-bar',
  'nav-primary',
  'nav-secondary',
  'page-title',
  'hero-statement',
  'metric-tile',
  'insight-card',
  'media-card',
  'list-row',
  'data-table',
  'search-control',
  'filter-control',
  'tab-strip',
  'primary-action',
  'secondary-action',
  'form-field',
  'dialog',
  'drawer',
  'toast',
  'empty-state',
  'skeleton',
  'neutral-block',
]);
export type SemanticRole = z.infer<typeof SemanticRole>;

/** The three fixed semantic motion presets. Not a keyframe editor. */
export const MotionPreset = z.enum(['calm', 'playful', 'editorial']);
export type MotionPreset = z.infer<typeof MotionPreset>;

/** How much movement a pattern introduces. Used for gating and for audition. */
export const MotionIntensity = z.enum(['none', 'subtle', 'moderate', 'expressive']);
export type MotionIntensity = z.infer<typeof MotionIntensity>;

export const RiskLevel = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevel>;

/** The four curated sources plus CanvasCraft's own neutral fallbacks. */
export const PatternSource = z.enum([
  'react-bits',
  'beautiful-ui',
  'coss-ui',
  'reui',
  'canvascraft',
]);
export type PatternSource = z.infer<typeof PatternSource>;

/**
 * Licences we recognise. `mit-commons-clause` is called out separately because
 * it permits preview inside a product but forbids redistribution — the exact
 * distinction the export gate turns on.
 */
export const LicenseId = z.enum([
  'mit',
  'mit-commons-clause',
  'apache-2.0',
  'canvascraft-original',
]);
export type LicenseId = z.infer<typeof LicenseId>;

/**
 * The single allowed primitive stack. Recorded per pattern so the compatibility
 * gate can refuse to put a Radix-based pattern next to a Base UI one.
 */
export const PrimitiveStack = z.enum(['base-ui', 'headless-none', 'radix']);
export type PrimitiveStack = z.infer<typeof PrimitiveStack>;

/** Rectangle in canvas coordinates. */
export const Bounds = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type Bounds = z.infer<typeof Bounds>;

/** A hex colour, normalised to 6-digit lowercase form. */
export const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'expected a 6-digit hex colour such as #1d212a')
  .transform((value) => value.toLowerCase());
export type HexColor = z.infer<typeof HexColor>;

/** Stable, human-readable identifier used to address elements across layers. */
export const Slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'expected a lowercase kebab-case identifier');
export type Slug = z.infer<typeof Slug>;

export const IsoTimestamp = z.string().datetime({ offset: true });
export type IsoTimestamp = z.infer<typeof IsoTimestamp>;
