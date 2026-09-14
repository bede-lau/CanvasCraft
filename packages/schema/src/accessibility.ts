import type { VariantManifest } from './manifest.js';
import type { ScreenSpec, SpecAccessibility } from './screen-spec.js';

/**
 * Measurement, not opinion.
 *
 * The Design Director is only worth reading if what it says is checkable, so
 * every claim it makes traces back to one of the numbers computed here. These
 * are pure functions over a Variant Manifest and the shared Screen Spec, which
 * is why the orchestrator and the web client can both run them and agree.
 */

/** One measured property of a branch, with the floor it is judged against. */
export interface Measurement {
  id: string;
  /** What was measured, in the user's terms. */
  label: string;
  value: number;
  /** The accessibility or legibility floor this value must clear. */
  floor: number;
  /**
   * Which side of `floor` is the passing side.
   *
   * Most entries here are floors — contrast, target size, line height all want
   * more. Timing entries want less, and reading their margin with the same
   * arithmetic reports the worst-paced branch as the safest one. Stated on the
   * measurement rather than inferred from its id so a new entry cannot quietly
   * inherit the wrong comparison.
   */
  direction?: 'floor' | 'ceiling';
  /** Rendered evidence, e.g. "3.1:1, needs 4.5:1". */
  evidence: string;
  passes: boolean;
}

/**
 * How much room a passing measurement has left, as a fraction of its floor.
 *
 * Positive is headroom, negative is a failure. Ceiling measurements are
 * inverted so "more margin" means the same thing for both kinds.
 */
export function measurementMargin(measurement: Measurement): number {
  if (measurement.floor === 0) return Number.POSITIVE_INFINITY;
  const raw = (measurement.value - measurement.floor) / measurement.floor;
  return measurement.direction === 'ceiling' ? -raw : raw;
}

function channel(component: number): number {
  const ratio = component / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance for a `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** WCAG 2.1 contrast ratio between two `#rrggbb` colours, 1–21. */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function contrastMeasurement(
  id: string,
  label: string,
  foreground: string,
  background: string,
  floor: number,
): Measurement {
  const value = round(contrastRatio(foreground, background));
  return {
    id,
    label,
    value,
    floor,
    evidence: `${value.toFixed(2)}:1 measured, ${floor.toFixed(1)}:1 required (${foreground} on ${background}).`,
    passes: value >= floor,
  };
}

/**
 * How long this branch takes to answer a click, as opposed to how long its
 * entrance choreography runs.
 *
 * These used to be the same number, which forced a choice between a page whose
 * sections resolve into place as you scroll and a page whose buttons respond
 * immediately. They are different budgets: an entrance plays once per section
 * per visit, an interaction plays every time anyone touches anything. The
 * renderer derives `--duration-fast` from exactly this, so the measurement and
 * the pixels cannot drift apart.
 */
export const INTERACTION_DURATION_RATIO = 0.4;

/** Where a repeated control starts to feel like waiting rather than responding. */
export const INTERACTION_DURATION_CEILING_MS = 300;

export function interactionDurationMs(manifest: VariantManifest): number {
  return Math.round(manifest.motion.durationMs * INTERACTION_DURATION_RATIO);
}

/**
 * The smallest step that still reads as a step, on a modular type scale.
 *
 * A major second (1.125) is where adjacent sizes stop being distinguishable
 * from each other at normal reading distance. Below it a heading is not a
 * different size, it is the same size rendered slightly wrong, and the page
 * loses its hierarchy no matter how the weights are set.
 */
export const MIN_TYPE_SCALE_RATIO = 1.125;

/**
 * Where a stagger stops making a group read as a group.
 *
 * Gestalt common fate says items that move together are read as one thing.
 * Stagger is what keeps that reading from becoming a wall of simultaneous
 * motion — but past roughly an eighth of a second per sibling the eye tracks
 * arrivals one at a time instead, and a six-item grid spends most of a second
 * delivering its last tile. The ceiling is generous enough that a deliberately
 * playful tempo still clears it.
 */
export const STAGGER_COHESION_CEILING_MS = 120;

/**
 * True when the border is the only thing defining a component's edge.
 *
 * WCAG 1.4.11 applies to boundaries that are *required* to identify a control,
 * not to decorative hairlines on a panel that a shadow already separates from
 * the page. Holding every branch to 3:1 on a border it does not depend on
 * produced a recommendation that was technically true and practically noise,
 * so the floor is only enforced where the border is load-bearing.
 */
function borderIsLoadBearing(manifest: VariantManifest): boolean {
  return manifest.form.elevation === 'hairline' || manifest.form.surface === 'outline';
}

/** Minimum rendered height of an icon-only control, from the manifest's own tokens. */
export function controlHeightPx(manifest: VariantManifest): number {
  const padding = manifest.form.spaceUnitPx * (manifest.form.density === 'compact' ? 2 : manifest.form.density === 'roomy' ? 4 : 3);
  return round(manifest.controls.iconSizePx + padding * 2 + manifest.form.borderWidthPx * 2, 1);
}

/**
 * Everything the Director is allowed to assert about one branch.
 *
 * Ordered most to least severe so the first failing entry is the headline.
 */
export function measureBranch(
  manifest: VariantManifest,
  accessibility: SpecAccessibility,
): Measurement[] {
  const { palette, typography, motion } = manifest;
  const controlHeight = controlHeightPx(manifest);
  const loadBearingBorder = borderIsLoadBearing(manifest);

  return [
    contrastMeasurement(
      'body-contrast',
      'Body text on the page background',
      palette.textPrimary,
      palette.background,
      accessibility.minBodyContrast,
    ),
    contrastMeasurement(
      'secondary-contrast',
      'Secondary text on raised surfaces',
      palette.textSecondary,
      palette.surfaceRaised,
      accessibility.minBodyContrast,
    ),
    contrastMeasurement(
      'accent-contrast',
      'Label on the primary action',
      palette.accentContrast,
      palette.accent,
      accessibility.minBodyContrast,
    ),
    contrastMeasurement(
      'critical-contrast',
      'Error text on the surface',
      palette.critical,
      palette.surface,
      accessibility.minLargeTextContrast,
    ),
    {
      id: 'touch-target',
      label: 'Icon control height',
      value: controlHeight,
      floor: accessibility.minTouchTargetPx,
      evidence: `${controlHeight}px from a ${manifest.controls.iconSizePx}px icon on ${manifest.form.density} density, ${accessibility.minTouchTargetPx}px required.`,
      passes: controlHeight >= accessibility.minTouchTargetPx,
    },
    // WCAG 1.4.11 and 2.4.11. The focus ring is drawn in the accent, so an
    // accent that disappears into the page is a keyboard user losing their
    // place — invisible to every check that only looks at text.
    contrastMeasurement(
      'focus-visibility',
      'Focus ring against the page background',
      palette.accent,
      palette.background,
      accessibility.minLargeTextContrast,
    ),
    {
      id: 'boundary-definition',
      label: 'Component border against its surface',
      value: round(contrastRatio(palette.border, palette.surface)),
      floor: loadBearingBorder ? accessibility.minLargeTextContrast : 1,
      evidence: loadBearingBorder
        ? `${round(contrastRatio(palette.border, palette.surface)).toFixed(2)}:1 (${palette.border} on ${palette.surface}). This direction uses ${manifest.form.elevation === 'hairline' ? 'a hairline elevation' : 'outline surfaces'}, so the border is the only thing separating a component from the page; WCAG 1.4.11 requires ${accessibility.minLargeTextContrast.toFixed(1)}:1.`
        : `${round(contrastRatio(palette.border, palette.surface)).toFixed(2)}:1 (${palette.border} on ${palette.surface}). Not held to the 3:1 boundary floor: ${manifest.form.elevation} elevation already separates the panel, so this border is decorative.`,
      passes: round(contrastRatio(palette.border, palette.surface)) >= (loadBearingBorder ? accessibility.minLargeTextContrast : 1),
    },
    {
      id: 'type-scale-step',
      label: 'Step between type sizes',
      value: typography.scaleRatio,
      floor: MIN_TYPE_SCALE_RATIO,
      evidence: `A ${typography.scaleRatio} ratio puts adjacent steps ${Math.round((typography.scaleRatio - 1) * 100)}% apart from a ${typography.baseSizePx}px base; ${MIN_TYPE_SCALE_RATIO} (a major second) is where a size change stops reading as one.`,
      passes: typography.scaleRatio >= MIN_TYPE_SCALE_RATIO,
    },
    {
      id: 'stagger-cohesion',
      label: 'Stagger between sibling entrances',
      value: motion.staggerMs,
      floor: STAGGER_COHESION_CEILING_MS,
      direction: 'ceiling',
      evidence: `${motion.staggerMs}ms between siblings in the ${motion.language} language means a six-item group takes ${motion.durationMs + motion.staggerMs * 5}ms to finish arriving; past ${STAGGER_COHESION_CEILING_MS}ms per sibling the group reads as separate arrivals rather than one group.`,
      passes: motion.staggerMs <= STAGGER_COHESION_CEILING_MS,
    },
    {
      id: 'body-leading',
      label: 'Body line height',
      value: typography.bodyLeading,
      floor: 1.5,
      evidence: `Line height ${typography.bodyLeading} at ${typography.baseSizePx}px; 1.5 is the WCAG 1.4.12 floor for body copy.`,
      passes: typography.bodyLeading >= 1.5,
    },
    {
      id: 'heading-separation',
      label: 'Heading-to-body weight separation',
      value: typography.displayWeight - typography.bodyWeight,
      floor: 150,
      evidence: `Display ${typography.displayWeight} against body ${typography.bodyWeight} on a ${typography.scaleRatio} scale; 150 keeps headings legible as headings.`,
      passes: typography.displayWeight - typography.bodyWeight >= 150,
    },
    {
      id: 'motion-duration',
      label: 'Interaction response time',
      value: interactionDurationMs(manifest),
      floor: INTERACTION_DURATION_CEILING_MS,
      direction: 'ceiling',
      evidence: `${interactionDurationMs(manifest)}ms to answer a click, from a ${motion.durationMs}ms ${motion.preset} entrance in the ${motion.language} language; ${INTERACTION_DURATION_CEILING_MS}ms is where a repeated control starts to feel like waiting.`,
      // A one-shot entrance may be long and expressive. A control that answers
      // slowly is uncomfortable on the tenth press, which is the number that
      // actually matters, so that is the one measured here.
      passes: interactionDurationMs(manifest) <= INTERACTION_DURATION_CEILING_MS,
    },
  ];
}

/**
 * A branch's readiness as a percentage of the checks it clears.
 *
 * Deliberately a count of measured passes rather than a judgement of taste:
 * a number nobody can reconstruct is worse than no number at all.
 */
export function readinessScore(
  manifest: VariantManifest,
  accessibility: SpecAccessibility,
): { score: number; passed: number; total: number } {
  const measurements = measureBranch(manifest, accessibility);
  const passed = measurements.filter((measurement) => measurement.passes).length;
  return {
    score: Math.round((passed / measurements.length) * 100),
    passed,
    total: measurements.length,
  };
}

/** Regions the shared spec declares but no state ever shows. */
export function unreachableRegions(spec: ScreenSpec): string[] {
  const stateIds = spec.states.map((state) => state.id);
  return spec.regions
    .filter((region) => {
      // Empty means "every state", so only an explicit list can strand a region.
      if (region.visibleInStates.length === 0) return false;
      return !region.visibleInStates.some((stateId) => stateIds.includes(stateId));
    })
    .map((region) => region.id);
}
