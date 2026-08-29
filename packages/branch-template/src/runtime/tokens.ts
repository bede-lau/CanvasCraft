import type { VariantManifest } from './types';

/**
 * Manifest -> CSS custom properties.
 *
 * Every visual difference between branches passes through this function. Nothing
 * downstream reads the manifest for styling; components read CSS variables. That
 * keeps a patch cheap — swapping a token re-paints without re-rendering logic —
 * and it means a Trait Remix is genuinely just different values here.
 */

const DENSITY_SCALE: Record<VariantManifest['form']['density'], number> = {
  compact: 0.75,
  regular: 1,
  roomy: 1.35,
};

const ELEVATION_SHADOW: Record<
  VariantManifest['form']['elevation'],
  (palette: VariantManifest['palette']) => string
> = {
  flat: () => 'none',
  hairline: (palette) => `0 0 0 1px ${palette.border}`,
  raised: (palette) =>
    palette.scheme === 'dark'
      ? '0 1px 2px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.28)'
      : '0 1px 2px rgba(16,20,28,0.06), 0 4px 12px rgba(16,20,28,0.06)',
  lifted: (palette) =>
    palette.scheme === 'dark'
      ? '0 2px 4px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.4)'
      : '0 2px 4px rgba(16,20,28,0.07), 0 12px 32px rgba(16,20,28,0.1)',
};

const BUTTON_RADIUS: Record<VariantManifest['controls']['buttonShape'], (outer: number) => string> = {
  sharp: () => '2px',
  soft: (outer) => `${Math.max(4, outer - 4)}px`,
  pill: () => '999px',
};

/** A modular type scale, so every branch's sizes are internally consistent. */
function typeScale(base: number, ratio: number, step: number): string {
  return `${(base * Math.pow(ratio, step)).toFixed(2)}px`;
}

export function manifestToCssVariables(manifest: VariantManifest): Record<string, string> {
  const { palette, typography, form, controls, motion } = manifest;
  const unit = form.spaceUnitPx * DENSITY_SCALE[form.density];

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

    '--font-display': typography.displayFamily,
    '--font-body': typography.bodyFamily,
    '--font-mono': typography.monoFamily,
    '--weight-display': String(typography.displayWeight),
    '--weight-body': String(typography.bodyWeight),
    '--tracking-display': `${typography.displayTrackingEm}em`,
    '--leading-body': String(typography.bodyLeading),

    '--space-1': `${(unit * 1).toFixed(2)}px`,
    '--space-2': `${(unit * 2).toFixed(2)}px`,
    '--space-3': `${(unit * 3).toFixed(2)}px`,
    '--space-4': `${(unit * 4).toFixed(2)}px`,
    '--space-6': `${(unit * 6).toFixed(2)}px`,
    '--space-8': `${(unit * 8).toFixed(2)}px`,
    '--space-12': `${(unit * 12).toFixed(2)}px`,

    // Radii nest: an inner corner is the outer corner minus the padding between
    // them, so concentric shapes stay concentric at every density.
    '--radius-outer': `${form.radiusOuterPx}px`,
    '--radius-inner': `${Math.max(0, form.radiusOuterPx - form.radiusStepPx)}px`,
    '--radius-control': `${Math.max(0, form.radiusOuterPx - form.radiusStepPx * 2)}px`,
    '--radius-chip': `${Math.max(0, form.radiusOuterPx - form.radiusStepPx * 3)}px`,
    '--radius-button': BUTTON_RADIUS[controls.buttonShape](form.radiusOuterPx),

    '--border-width': `${form.borderWidthPx}px`,
    '--shadow': ELEVATION_SHADOW[form.elevation](palette),

    '--icon-size': `${controls.iconSizePx}px`,
    '--icon-stroke':
      controls.iconWeight === 'light' ? '1.25' : controls.iconWeight === 'bold' ? '2.25' : '1.75',

    '--duration': `${motion.durationMs}ms`,
    '--duration-fast': `${Math.round(motion.durationMs * 0.6)}ms`,
    '--easing': motion.easing,
    '--stagger': `${motion.staggerMs}ms`,
    '--travel': `${(motion.travel * 16).toFixed(1)}px`,

    // Touch targets are part of the shared accessibility contract, so this is a
    // floor rather than a branch-varying value.
    '--min-target': '44px',
  };

  for (let step = -2; step <= 6; step += 1) {
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
