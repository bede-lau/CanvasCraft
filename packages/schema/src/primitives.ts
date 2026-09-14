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

/**
 * Button silhouette. One of the four axes the canvas toolbar locks, so it is
 * named here rather than inlined: the genome budget test reads its options to
 * work out the longest suffix the compiler can append.
 */
export const ButtonShape = z.enum(['sharp', 'soft', 'pill']);
export type ButtonShape = z.infer<typeof ButtonShape>;

/** The three fixed semantic motion presets. Not a keyframe editor. */
export const MotionPreset = z.enum(['calm', 'playful', 'editorial']);
export type MotionPreset = z.infer<typeof MotionPreset>;

/**
 * What kind of webpage is being built.
 *
 * The archetype is the vocabulary selector: it decides which layout shell,
 * which background treatment, which component adapters, and which motion
 * system a branch may reach for. A dashboard and a landing page are not the
 * same design problem, and a renderer that pretends otherwise produces the
 * same beige admin template for both — which is exactly the failure this
 * enum exists to end.
 *
 * It is chosen once in the canvas toolbar and shared by all three directions,
 * like the Screen Spec: the comparison is *within* an archetype, never across.
 */
export const PageArchetype = z.enum(['marketing', 'application', 'portfolio', 'ai-native']);
export type PageArchetype = z.infer<typeof PageArchetype>;

/**
 * How a direction moves, as opposed to how fast.
 *
 * `MotionPreset` is the run's shared tempo (locked by the toolbar); this is the
 * per-direction personality layered on top, and it is the axis that stops three
 * branches from being the same page in three palettes. Each value names a
 * concrete mechanism the runtime implements, not a mood:
 *
 * - `reveal`    sections fade and rise as they enter the viewport
 * - `cascade`   siblings arrive in a visible staggered sequence
 * - `spring`    entrances overshoot and settle; interactions are springy
 * - `parallax`  layers move at different rates against the scroll
 * - `cut`       no travel; state changes are instant and typographic
 */
export const MotionLanguage = z.enum(['reveal', 'cascade', 'spring', 'parallax', 'cut']);
export type MotionLanguage = z.infer<typeof MotionLanguage>;

/**
 * How a branch's panels are made of light.
 *
 * Depth is a design argument, not decoration: a glass panel over a gradient
 * says "this floats above a living surface", a solid one says "this is a
 * document". Both are legitimate; a hairline-only renderer can say neither.
 */
export const SurfaceTreatment = z.enum(['solid', 'glass', 'gradient', 'outline']);
export type SurfaceTreatment = z.infer<typeof SurfaceTreatment>;

/**
 * What sits behind everything.
 *
 * `flat` is the honest default. The rest are the treatments that make a page
 * read as designed rather than generated, and each is implemented so that
 * reduced motion freezes it rather than removing it.
 */
export const BackdropTreatment = z.enum(['flat', 'wash', 'aurora', 'grain', 'spotlight']);
export type BackdropTreatment = z.infer<typeof BackdropTreatment>;

/** How much movement a pattern introduces. Used for gating and for audition. */
export const MotionIntensity = z.enum(['none', 'subtle', 'moderate', 'expressive']);
export type MotionIntensity = z.infer<typeof MotionIntensity>;

/**
 * The Design Genome length budget.
 *
 * The compiler appends the locked toolbar axes to whatever genome a direction
 * arrives with — archetype, button shape, and motion preset × intensity.
 * Capping the AI draft and the finished manifest at the same number meant a
 * draft that spent its whole budget could never fit afterwards, so every
 * AI-authored direction failed manifest validation and the run silently fell
 * back to the deterministic set. The manifest cap therefore has to stay
 * comfortably above the draft cap, and the compiler test measures the real
 * worst-case suffix rather than trusting this comment.
 */
export const AI_GENOME_MAX_LENGTH = 140;
export const GENOME_MAX_LENGTH = 240;

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
