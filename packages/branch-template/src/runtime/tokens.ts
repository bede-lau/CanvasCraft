import type { VariantManifest } from './types';
import {
  EASING,
  EXIT_DURATION_RATIO,
  INTERACTION_DURATION_RATIO,
  arcRatioFor,
  bezierCss,
  deformationFor,
  easingPairFor,
  roleDuration,
} from './motion';

/**
 * Manifest -> CSS custom properties.
 *
 * Every visual difference between branches passes through this function.
 * Nothing downstream reads the manifest for styling; components read CSS
 * variables. That keeps a patch cheap — swapping a token re-paints without
 * re-rendering logic — and it means a Trait Remix is genuinely just different
 * values here.
 *
 * This file is also where the product's visual bar lives. The previous version
 * emitted hairlines and a 12px/6% shadow and nothing else, which is why every
 * generated branch read as a 2010 admin template no matter what the palette
 * said. Depth, gradient, glass, and a display-type scale are all derived here
 * from traits the manifest already carries, so a direction that asks for
 * `surface: 'glass'` over `backdrop: 'aurora'` gets an actual glass panel over
 * an actual aurora rather than a differently-tinted rectangle.
 */

const DENSITY_SCALE: Record<VariantManifest['form']['density'], number> = {
  compact: 0.75,
  regular: 1,
  roomy: 1.35,
};

/**
 * Vertical rhythm between top-level sections.
 *
 * Separate from the space unit because section rhythm is what makes a page feel
 * composed rather than stacked, and it does not scale with the same curve as
 * the padding inside a card: a roomy card in a cramped page still reads as
 * cramped.
 */
const SECTION_RHYTHM: Record<VariantManifest['form']['density'], number> = {
  compact: 14,
  regular: 20,
  roomy: 28,
};

/** How far a panel sits off the page, as a real shadow stack rather than a hairline. */
const ELEVATION_SHADOW: Record<
  VariantManifest['form']['elevation'],
  (palette: VariantManifest['palette']) => string
> = {
  flat: () => 'none',
  hairline: (palette) => `0 0 0 1px ${palette.border}`,
  raised: (palette) =>
    palette.scheme === 'dark'
      ? '0 1px 1px rgba(0,0,0,0.5), 0 4px 10px rgba(0,0,0,0.4), 0 14px 34px rgba(0,0,0,0.34)'
      : '0 1px 1px rgba(16,20,28,0.05), 0 4px 10px rgba(16,20,28,0.07), 0 14px 34px rgba(16,20,28,0.08)',
  lifted: (palette) =>
    palette.scheme === 'dark'
      ? '0 2px 3px rgba(0,0,0,0.55), 0 10px 24px rgba(0,0,0,0.45), 0 32px 72px rgba(0,0,0,0.5)'
      : '0 2px 3px rgba(16,20,28,0.06), 0 10px 24px rgba(16,20,28,0.09), 0 32px 72px rgba(16,20,28,0.12)',
};

/**
 * The inner light that stops a raised panel reading as a flat rectangle with a
 * blur behind it. A dark scheme catches light on its top edge; a light scheme
 * loses it at the bottom.
 */
function innerEdge(palette: VariantManifest['palette']): string {
  return palette.scheme === 'dark'
    ? 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.3)'
    : 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(16,20,28,0.04)';
}

const BUTTON_RADIUS: Record<VariantManifest['controls']['buttonShape'], (outer: number) => string> = {
  sharp: () => '2px',
  soft: (outer) => `${Math.max(4, outer - 4)}px`,
  pill: () => '999px',
};

/**
 * How a panel is filled.
 *
 * `glass` deliberately keeps a visible border and a solid fallback colour under
 * the translucency: `backdrop-filter` is the first thing a browser drops under
 * memory pressure, and a panel that becomes invisible when it does is a bug,
 * not a degradation.
 */
function surfaceFill(manifest: VariantManifest, raised: boolean): string {
  const { palette, form } = manifest;
  const base = raised ? palette.surfaceRaised : palette.surface;
  const dark = palette.scheme === 'dark';

  switch (form.surface) {
    case 'glass':
      return `color-mix(in srgb, ${base} ${dark ? 62 : 72}%, transparent)`;
    case 'gradient':
      return `linear-gradient(${dark ? '160deg' : '170deg'}, color-mix(in srgb, ${palette.accent} ${
        dark ? 12 : 7
      }%, ${base}) 0%, ${base} 46%, color-mix(in srgb, ${palette.background} ${dark ? 40 : 55}%, ${base}) 100%)`;
    case 'outline':
      return 'transparent';
    case 'solid':
    default:
      return base;
  }
}

/**
 * The page ground.
 *
 * Every stop is derived from the palette the manifest already validated, so a
 * backdrop can never introduce a colour the contrast measurements did not see.
 * The animated ones are driven by a CSS custom property the runtime freezes
 * under reduced motion, so the treatment survives and only the movement goes.
 */
function backdropLayers(palette: VariantManifest['palette']): string {
  const { background, surfaceRaised, accent, positive, scheme } = palette;
  const veil = scheme === 'dark' ? 22 : 12;
  const soft = scheme === 'dark' ? 14 : 9;

  switch (palette.backdrop) {
    case 'wash':
      return [
        `radial-gradient(120% 80% at 12% -10%, color-mix(in srgb, ${accent} ${veil}%, transparent) 0%, transparent 60%)`,
        `radial-gradient(90% 70% at 100% 0%, color-mix(in srgb, ${surfaceRaised} 70%, transparent) 0%, transparent 55%)`,
        background,
      ].join(', ');

    case 'aurora':
      return [
        `radial-gradient(65% 45% at var(--aurora-x, 20%) var(--aurora-y, 8%), color-mix(in srgb, ${accent} ${veil + 10}%, transparent) 0%, transparent 62%)`,
        `radial-gradient(55% 40% at calc(100% - var(--aurora-x, 20%)) 30%, color-mix(in srgb, ${positive} ${soft}%, transparent) 0%, transparent 58%)`,
        `radial-gradient(80% 60% at 50% 110%, color-mix(in srgb, ${surfaceRaised} 60%, transparent) 0%, transparent 70%)`,
        background,
      ].join(', ');

    case 'spotlight':
      return [
        `radial-gradient(70% 55% at 50% -15%, color-mix(in srgb, ${surfaceRaised} 85%, transparent) 0%, transparent 65%)`,
        `radial-gradient(40% 40% at var(--aurora-x, 50%) 0%, color-mix(in srgb, ${accent} ${soft}%, transparent) 0%, transparent 70%)`,
        background,
      ].join(', ');

    case 'grain':
      // The grain itself is a repeating SVG in the stylesheet; this supplies the
      // tonal ground it sits on so the two read as one material.
      return [
        `linear-gradient(180deg, color-mix(in srgb, ${surfaceRaised} 55%, ${background}) 0%, ${background} 42%)`,
        background,
      ].join(', ');

    case 'flat':
    default:
      return background;
  }
}

/** A modular type scale, so every branch's sizes are internally consistent. */
function typeScale(base: number, ratio: number, step: number): string {
  return `${(base * Math.pow(ratio, step)).toFixed(2)}px`;
}

export function manifestToCssVariables(manifest: VariantManifest): Record<string, string> {
  const { palette, typography, form, controls, motion } = manifest;
  const unit = form.spaceUnitPx * DENSITY_SCALE[form.density];
  const interactionMs = Math.round(motion.durationMs * INTERACTION_DURATION_RATIO);
  const easing = easingPairFor(motion);

  const vars: Record<string, string> = {
    '--bg': palette.background,
    '--surface': palette.surface,
    '--surface-raised': palette.surfaceRaised,
    '--border': palette.border,
    '--text': palette.textPrimary,
    '--text-muted': palette.textSecondary,
    '--accent': palette.accent,
    '--accent-contrast': palette.accentContrast,
    '--positive': palette.positive,
    '--critical': palette.critical,

    // Derived colour roles. Components use these instead of re-deriving mixes,
    // so a palette change reaches every tint at once.
    '--accent-soft': `color-mix(in srgb, ${palette.accent} 14%, ${palette.surface})`,
    '--accent-line': `color-mix(in srgb, ${palette.accent} 40%, transparent)`,
    '--hairline': `color-mix(in srgb, ${palette.border} 70%, transparent)`,
    '--scrim': palette.scheme === 'dark' ? 'rgba(2,3,6,0.72)' : 'rgba(14,18,26,0.42)',

    '--backdrop': backdropLayers(palette),
    '--surface-fill': surfaceFill(manifest, false),
    '--surface-fill-raised': surfaceFill(manifest, true),
    '--surface-blur': form.surface === 'glass' ? `${palette.scheme === 'dark' ? 22 : 18}px` : '0px',
    '--surface-saturate': form.surface === 'glass' ? '1.5' : '1',

    '--font-display': typography.displayFamily,
    '--font-body': typography.bodyFamily,
    '--font-mono': typography.monoFamily,
    '--weight-display': String(typography.displayWeight),
    '--weight-body': String(typography.bodyWeight),
    '--tracking-display': `${typography.displayTrackingEm}em`,
    '--leading-body': String(typography.bodyLeading),
    // Display copy needs a tighter leading than body copy at every size, or a
    // two-line headline reads as two sentences.
    '--leading-display': String(Math.max(0.95, 1.32 - typography.scaleRatio * 0.22).toFixed(3)),

    '--space-1': `${(unit * 1).toFixed(2)}px`,
    '--space-2': `${(unit * 2).toFixed(2)}px`,
    '--space-3': `${(unit * 3).toFixed(2)}px`,
    '--space-4': `${(unit * 4).toFixed(2)}px`,
    '--space-5': `${(unit * 5).toFixed(2)}px`,
    '--space-6': `${(unit * 6).toFixed(2)}px`,
    '--space-8': `${(unit * 8).toFixed(2)}px`,
    '--space-12': `${(unit * 12).toFixed(2)}px`,
    // Section rhythm is deliberately larger than the padding inside a card, but
    // the raw `spaceUnitPx * {14|20|28}` reached 110–160px on a roomy branch and
    // was applied uniformly between full sections *and* near-empty ones — that is
    // the dead vertical space in the generated pages. Bound it to the density
    // unit and a hard ceiling; `--section-gap-tight` is for stacked utility/nav
    // areas that should read as one band, not several.
    '--section-gap': `${Math.max(
      unit * 4,
      Math.min(form.spaceUnitPx * SECTION_RHYTHM[form.density], unit * 10, 88),
    ).toFixed(2)}px`,
    '--section-gap-tight': `${Math.max(
      unit * 2,
      Math.min(form.spaceUnitPx * SECTION_RHYTHM[form.density] * 0.45, 40),
    ).toFixed(2)}px`,

    // Radii nest: an inner corner is the outer corner minus the padding between
    // them, so concentric shapes stay concentric at every density.
    '--radius-outer': `${form.radiusOuterPx}px`,
    '--radius-inner': `${Math.max(0, form.radiusOuterPx - form.radiusStepPx)}px`,
    '--radius-control': `${Math.max(0, form.radiusOuterPx - form.radiusStepPx * 2)}px`,
    '--radius-chip': `${Math.max(0, form.radiusOuterPx - form.radiusStepPx * 3)}px`,
    '--radius-button': BUTTON_RADIUS[controls.buttonShape](form.radiusOuterPx),

    '--border-width': `${form.borderWidthPx}px`,
    '--shadow': ELEVATION_SHADOW[form.elevation](palette),
    '--shadow-edge': form.elevation === 'flat' ? 'none' : innerEdge(palette),
    // What a panel becomes when the pointer is over it. One step up the same
    // stack, so hover reads as the same material lifting rather than a new one.
    '--shadow-hover': ELEVATION_SHADOW[form.elevation === 'lifted' ? 'lifted' : 'raised'](palette),

    // Floored: a pattern that reserves leading room for an adornment as
    // `calc(var(--icon-size) + ...)` collides with its own text if the token
    // ever resolves small or unset. 16px is the smallest a lucide glyph reads at.
    '--icon-size': `${Math.max(16, controls.iconSizePx)}px`,
    '--icon-stroke':
      controls.iconWeight === 'light' ? '1.25' : controls.iconWeight === 'bold' ? '2.25' : '1.75',

    // Two budgets, not one. The entrance choreography may be long; the answer
    // to a click may not. See INTERACTION_DURATION_RATIO.
    '--duration': `${motion.durationMs}ms`,
    '--duration-fast': `${interactionMs}ms`,
    '--duration-slow': `${Math.round(motion.durationMs * 1.6)}ms`,
    '--easing': motion.easing,
    '--stagger': `${motion.staggerMs}ms`,
    '--travel': `${(motion.travel * 40).toFixed(1)}px`,
    '--lift': `${(motion.travel * 4).toFixed(2)}px`,

    // The duration ladder, named by what an animation *is* rather than by how
    // long it takes. A stylesheet that only has `--duration-fast` has to decide
    // that a hover and a drawer are the same event, and every branch here made
    // that decision the same way — which is why the output read as one tempo no
    // matter what the manifest asked for. See ROLE_DURATION in motion.ts.
    '--dur-press': `${roleDuration(motion, 'press')}ms`,
    '--dur-hover': `${roleDuration(motion, 'hover')}ms`,
    '--dur-state': `${roleDuration(motion, 'state')}ms`,
    '--dur-container': `${roleDuration(motion, 'container')}ms`,
    '--dur-screen': `${roleDuration(motion, 'screen')}ms`,
    '--dur-hero': `${roleDuration(motion, 'hero')}ms`,
    '--dur-morph': `${roleDuration(motion, 'morph')}ms`,
    // A supporting detail starts fractionally after the move it accompanies and
    // finishes inside it. Same two numbers `secondaryTransitionFor` uses, so a
    // CSS-driven accompaniment and a Motion-driven one stay in step.
    '--dur-secondary': `${Math.round(roleDuration(motion, 'state') * 0.8)}ms`,
    '--delay-secondary': `${Math.round(roleDuration(motion, 'state') * 0.25)}ms`,

    // Leaving is not an event anyone watches. Every exit is the same shape as
    // its enter at 70% of the time — see EXIT_DURATION_RATIO.
    '--dur-state-exit': `${Math.round(roleDuration(motion, 'state') * EXIT_DURATION_RATIO)}ms`,
    '--dur-container-exit': `${Math.round(roleDuration(motion, 'container') * EXIT_DURATION_RATIO)}ms`,
    '--dur-screen-exit': `${Math.round(roleDuration(motion, 'screen') * EXIT_DURATION_RATIO)}ms`,
    '--dur-exit': `${Math.round(roleDuration(motion, 'hero') * EXIT_DURATION_RATIO)}ms`,

    // The directional set. `--ease-enter` is the branch's own signature curve;
    // `--ease-exit` is that same curve time-reversed, so an exit is never the
    // literal curve an entrance used and is still recognisably the same branch.
    '--ease-enter': bezierCss(easing.enter),
    '--ease-exit': bezierCss(easing.exit),
    '--ease-emphasized': bezierCss(EASING.emphasized),
    '--ease-emphasized-decelerate': bezierCss(EASING.emphasizedDecelerate),
    '--ease-emphasized-accelerate': bezierCss(EASING.emphasizedAccelerate),
    '--ease-standard': bezierCss(EASING.standard),
    '--ease-standard-decelerate': bezierCss(EASING.standardDecelerate),
    '--ease-standard-accelerate': bezierCss(EASING.standardAccelerate),
    // Loops and progress only. A curve on a repeating animation makes the loop
    // audible as a pulse, which is the one place linear is the honest choice.
    '--ease-linear': 'linear',

    // Geometry the JS entrances already use, exposed so a CSS-driven reveal
    // traces the same arc rather than dropping straight down beside it.
    '--arc-ratio': String(arcRatioFor(motion)),
    '--travel-x': `${(motion.travel * 40 * arcRatioFor(motion)).toFixed(1)}px`,
    // Squash and stretch, capped inside the 0.95–1.05 band that separates
    // believable weight from cartoon. See deformationFor.
    '--press-squash': (1 - deformationFor(motion)).toFixed(3),
    '--press-stretch': (1 + deformationFor(motion) * 0.6).toFixed(3),

    // Touch targets are part of the shared accessibility contract, so this is a
    // floor rather than a branch-varying value.
    '--min-target': '44px',
  };

  for (let step = -2; step <= 8; step += 1) {
    vars[`--text-${step < 0 ? `n${Math.abs(step)}` : step}`] = typeScale(
      typography.baseSizePx,
      typography.scaleRatio,
      step,
    );
  }

  return vars;
}

/** Applies the manifest to an element as inline custom properties. */
export function cssVariableStyle(manifest: VariantManifest): React.CSSProperties {
  return manifestToCssVariables(manifest) as unknown as React.CSSProperties;
}

/** Focus treatment varies by branch, but a visible focus ring never disappears. */
export function focusRingCss(controls: VariantManifest['controls']): string {
  switch (controls.focusRing) {
    case 'outline':
      return 'outline: 2px solid var(--accent); outline-offset: 2px;';
    case 'underglow':
      return 'box-shadow: 0 3px 0 -1px var(--accent), var(--shadow); outline: 1px solid transparent;';
    case 'ring':
    default:
      return 'box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent); outline: 1px solid transparent;';
  }
}
