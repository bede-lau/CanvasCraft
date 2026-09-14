import {
  ManifestDelta,
  contrastRatio,
  controlHeightPx,
  measureBranch,
  measurementMargin,
  relativeLuminance,
  unreachableRegions,
  type AiRecommendationDraft,
  type Measurement,
  type PageArchetype,
  type Recommendation,
  type RegionCandidates,
  type RunRecord,
  type ScreenSpec,
  type VariantManifest,
} from '@canvascraft/schema';
import { getRegistryRecord } from '@canvascraft/registry';

/**
 * The Design Director's findings.
 *
 * Every recommendation here is reconstructible: its evidence is a number
 * measured from the branch's own manifest, and its delta is the change that
 * moves that number past its floor. Nothing is written to fill the panel — a
 * branch that clears every check produces an empty list, and the UI says so.
 */

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function mix(from: string, to: string, amount: number): string {
  const parse = (hex: string, offset: number) => Number.parseInt(hex.replace('#', '').slice(offset, offset + 2), 16);
  const channel = (offset: number) =>
    Math.round(parse(from, offset) + (parse(to, offset) - parse(from, offset)) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/**
 * The nearest colour to `foreground` that clears `floor` against `background`.
 *
 * Walks toward whichever extreme the background is furthest from, so the hue
 * survives as far as it can before legibility wins.
 */
function adjustForContrast(foreground: string, background: string, floor: number): string {
  if (contrastRatio(foreground, background) >= floor) return foreground;
  const target = relativeLuminance(background) < 0.5 ? '#ffffff' : '#000000';
  let candidate = foreground;
  for (let step = 1; step <= 20; step += 1) {
    candidate = mix(foreground, target, step / 20);
    if (contrastRatio(candidate, background) >= floor) return candidate;
  }
  return candidate;
}

/**
 * Smallest icon and spacing increase that genuinely reaches the touch floor.
 *
 * Guessing a bump and hoping is what produced advice that did not work, so this
 * searches the bounded token ranges and returns nothing when the floor is
 * unreachable rather than proposing a change that falls short.
 */
function resolveTouchTarget(
  manifest: VariantManifest,
  floor: number,
): { iconSizePx: number; spaceUnitPx: number } | null {
  let best: { iconSizePx: number; spaceUnitPx: number; cost: number } | null = null;
  for (let iconSizePx = manifest.controls.iconSizePx; iconSizePx <= 24; iconSizePx += 1) {
    for (let spaceUnitPx = manifest.form.spaceUnitPx; spaceUnitPx <= 10; spaceUnitPx += 1) {
      const candidate = {
        ...manifest,
        controls: { ...manifest.controls, iconSizePx },
        form: { ...manifest.form, spaceUnitPx },
      };
      if (controlHeightPx(candidate) < floor) continue;
      const cost =
        iconSizePx - manifest.controls.iconSizePx + (spaceUnitPx - manifest.form.spaceUnitPx) * 2;
      if (!best || cost < best.cost) best = { iconSizePx, spaceUnitPx, cost };
    }
  }
  return best ? { iconSizePx: best.iconSizePx, spaceUnitPx: best.spaceUnitPx } : null;
}

/**
 * Restores label contrast on the primary action.
 *
 * The label is tried first because moving it leaves the brand accent intact.
 * When the label is already black or white there is nowhere left for it to go,
 * so the accent itself has to move instead.
 */
function resolveAccentContrast(
  palette: VariantManifest['palette'],
  floor: number,
): { accentContrast: string } | { accent: string } | null {
  const label = adjustForContrast(palette.accentContrast, palette.accent, floor);
  if (contrastRatio(label, palette.accent) >= floor) return { accentContrast: label };
  const accent = adjustForContrast(palette.accent, palette.accentContrast, floor);
  if (contrastRatio(palette.accentContrast, accent) >= floor) return { accent };
  return null;
}

interface Finding {
  surface: Recommendation['surface'];
  severity: Recommendation['severity'];
  title: string;
  rationale: string;
  delta: Recommendation['delta'];
  measurement: Measurement;
}

function findingFor(measurement: Measurement, manifest: VariantManifest): Finding | null {
  const { palette, typography, form, controls, motion } = manifest;

  switch (measurement.id) {
    case 'body-contrast':
      return {
        surface: 'contrast',
        severity: 'blocker',
        title: 'Raise body text contrast against the page background',
        rationale: `Body copy sits at ${measurement.value.toFixed(2)}:1 against ${palette.background}, below the ${measurement.floor}:1 floor this run locked. Darkening the text colour clears it without touching layout or content.`,
        delta: {
          palette: { textPrimary: adjustForContrast(palette.textPrimary, palette.background, measurement.floor) },
          selectionSwaps: [],
        },
        measurement,
      };

    case 'secondary-contrast':
      return {
        surface: 'contrast',
        severity: 'blocker',
        title: 'Raise secondary text contrast on raised surfaces',
        rationale: `Supporting copy measures ${measurement.value.toFixed(2)}:1 on ${palette.surfaceRaised}, so metadata and captions fall below the shared ${measurement.floor}:1 floor. This adjusts only the secondary text colour.`,
        delta: {
          palette: {
            textSecondary: adjustForContrast(palette.textSecondary, palette.surfaceRaised, measurement.floor),
          },
          selectionSwaps: [],
        },
        measurement,
      };

    case 'accent-contrast': {
      const resolved = resolveAccentContrast(palette, measurement.floor);
      if (!resolved) return null;
      const movesLabel = 'accentContrast' in resolved;
      return {
        surface: 'contrast',
        severity: 'blocker',
        title: movesLabel
          ? 'Fix the label contrast on the primary action'
          : 'Deepen the accent so its label becomes legible',
        rationale: movesLabel
          ? `The primary action's label reads at ${measurement.value.toFixed(2)}:1 on ${palette.accent}, under the ${measurement.floor}:1 floor. The accent itself is kept; only the label colour on top of it moves.`
          : `The primary action's label reads at ${measurement.value.toFixed(2)}:1 on ${palette.accent}, and the label is already as light or dark as it goes. The accent has to deepen instead to carry ${measurement.floor}:1.`,
        delta: { palette: resolved, selectionSwaps: [] },
        measurement,
      };
    }

    case 'critical-contrast':
      return {
        surface: 'accessibility',
        severity: 'improvement',
        title: 'Strengthen the error colour against the surface',
        rationale: `Validation text measures ${measurement.value.toFixed(2)}:1 on ${palette.surface}. Error states are the one place a user cannot afford to squint, so this lifts the critical colour to the ${measurement.floor}:1 floor.`,
        delta: {
          palette: { critical: adjustForContrast(palette.critical, palette.surface, measurement.floor) },
          selectionSwaps: [],
        },
        measurement,
      };

    case 'touch-target': {
      const resolved = resolveTouchTarget(manifest, measurement.floor);
      if (!resolved) return null;
      return {
        surface: 'touch-target',
        severity: 'blocker',
        title: 'Grow icon controls to the touch-target floor',
        rationale: `A ${controls.iconSizePx}px icon at ${form.density} density renders a ${measurement.value}px control, short of the ${measurement.floor}px floor. A ${resolved.iconSizePx}px icon on a ${resolved.spaceUnitPx}px base unit reaches it while keeping the same interaction contract.`,
        delta: {
          controls: { iconSizePx: resolved.iconSizePx },
          form: { spaceUnitPx: resolved.spaceUnitPx },
          selectionSwaps: [],
        },
        measurement,
      };
    }

    case 'focus-visibility': {
      // Moving the accent is the only fix available: the ring is drawn in it,
      // and the page background is shared with everything else on the screen.
      const accent = adjustForContrast(palette.accent, palette.background, measurement.floor);
      if (accent === palette.accent) return null;
      return {
        surface: 'accessibility',
        severity: 'blocker',
        title: 'Make the focus ring visible against the page',
        rationale: `The accent reads at ${measurement.value.toFixed(2)}:1 on ${palette.background}, so the focus ring drawn in it is under the ${measurement.floor}:1 boundary floor and a keyboard user cannot see where they are. Deepening the accent fixes the ring, the primary action, and every accent line at once.`,
        delta: { palette: { accent }, selectionSwaps: [] },
        measurement,
      };
    }

    case 'boundary-definition': {
      const border = adjustForContrast(palette.border, palette.surface, measurement.floor);
      if (border === palette.border) return null;
      return {
        surface: 'contrast',
        severity: 'improvement',
        title: 'Define the component edge this direction depends on',
        rationale: `This direction uses ${form.elevation === 'hairline' ? 'a hairline elevation' : 'outline surfaces'}, so the border is the only thing separating a component from the page — and it measures ${measurement.value.toFixed(2)}:1 against ${palette.surface}, under the ${measurement.floor}:1 WCAG 1.4.11 floor. Only the border colour moves.`,
        delta: { palette: { border }, selectionSwaps: [] },
        measurement,
      };
    }

    case 'type-scale-step':
      return {
        surface: 'hierarchy',
        severity: 'improvement',
        title: 'Open the type scale so sizes read as different sizes',
        rationale: `Adjacent steps sit ${Math.round((typography.scaleRatio - 1) * 100)}% apart, under the ${measurement.floor} major-second ratio where a size change stops being legible as one. Widening the ratio re-separates every heading level from the body at once; nothing else about the type changes.`,
        delta: {
          typography: { scaleRatio: Number(clamp(Math.max(measurement.floor, typography.scaleRatio + 0.075), 1.05, 1.7).toFixed(3)) },
          selectionSwaps: [],
        },
        measurement,
      };

    case 'stagger-cohesion':
      return {
        surface: 'motion',
        severity: 'improvement',
        title: 'Tighten the stagger so a group arrives as a group',
        rationale: `${motion.staggerMs}ms between siblings makes a six-item group take ${motion.durationMs + motion.staggerMs * 5}ms to finish arriving, and the eye tracks the arrivals one at a time instead of reading the group. This shortens the gap while keeping the ${motion.language} language and the branch's own tempo.`,
        delta: {
          motion: { staggerMs: Math.round(clamp(measurement.floor * 0.7, 0, 240)) },
          selectionSwaps: [],
        },
        measurement,
      };

    case 'body-leading':
      return {
        surface: 'readability',
        severity: 'improvement',
        title: 'Open up body line height for sustained reading',
        rationale: `Body copy runs at ${typography.bodyLeading} line height, under the 1.5 WCAG floor for paragraphs. Loosening it improves scanning without changing content, layout, or type size.`,
        delta: {
          typography: { bodyLeading: clamp(Math.max(1.5, typography.bodyLeading + 0.1), 1.2, 1.9) },
          selectionSwaps: [],
        },
        measurement,
      };

    case 'heading-separation':
      return {
        surface: 'hierarchy',
        severity: 'improvement',
        title: 'Separate heading weight from body weight',
        rationale: `Display weight ${typography.displayWeight} sits only ${measurement.value} above body weight ${typography.bodyWeight}, so headings stop reading as headings at a glance. This raises the display weight alone.`,
        delta: {
          typography: { displayWeight: clamp(typography.bodyWeight + 200, 300, 900) },
          selectionSwaps: [],
        },
        measurement,
      };

    case 'motion-duration':
      return {
        surface: 'motion',
        severity: 'polish',
        title: 'Shorten the transition so repeat use stays comfortable',
        rationale: `Transitions run ${motion.durationMs}ms at ${motion.travel.toFixed(2)} travel, which is long enough to feel like waiting on the tenth repetition. This trims duration and travel while keeping the ${motion.preset} character.`,
        delta: {
          motion: {
            durationMs: clamp(Math.round(motion.durationMs * 0.75), 80, 600),
            travel: clamp(motion.travel * 0.6, 0, 1),
          },
          selectionSwaps: [],
        },
        measurement,
      };

    default:
      return null;
  }
}

/**
 * The measurement closest to failing, expressed as a polish note.
 *
 * Used only when a branch clears everything, so the panel can say what the
 * tightest margin is instead of inventing a problem.
 */
function tightestMargin(measurements: Measurement[], manifest: VariantManifest): Finding | null {
  const scored = measurements
    .filter((measurement) => measurement.floor > 0 && measurement.passes)
    .map((measurement) => ({ measurement, margin: measurementMargin(measurement) }))
    .filter(({ margin }) => Number.isFinite(margin))
    .sort((left, right) => left.margin - right.margin);
  const closest = scored[0];
  if (!closest || closest.margin > 0.35) return null;

  // Resolve against a tightened floor, otherwise the fix for a measurement that
  // already passes is the value it already has. A ceiling tightens downward:
  // raising it would make an already-comfortable timing pass by even more.
  const stricterFloor =
    closest.measurement.direction === 'ceiling'
      ? closest.measurement.floor * 0.85
      : closest.measurement.floor * 1.15;
  const finding = findingFor({ ...closest.measurement, floor: stricterFloor }, manifest);
  if (!finding) return null;
  return {
    ...finding,
    measurement: closest.measurement,
    severity: 'polish',
    title: `Add headroom to ${closest.measurement.label.toLowerCase()}`,
    rationale: `${closest.measurement.label} clears its floor with little to spare: ${closest.measurement.evidence} Applying this leaves room for the palette or density to change later without dropping below it.`,
  };
}

/** Archetypes whose recipe assumes movement on the way down the page. */
const SCROLL_ARCHETYPES = new Set<PageArchetype>(['marketing', 'portfolio', 'ai-native']);

const NEUTRAL_PREFIX = 'canvascraft-neutral-';

/**
 * Deterministic treatment upgrades, independent of accessibility measurement.
 *
 * `findingFor` only fires when a WCAG floor is missed, and the deterministic
 * directions are hand-tuned to clear those floors — so a branch that passes
 * everything produced, at best, a 0.1 line-height nudge. That nudge was real
 * but invisible, which is what "I approved a recommendation and nothing
 * changed" actually meant. These findings fire on the *treatment*, not the
 * measurement: a region still showing CanvasCraft's neutral fallback when a
 * richer archetype-matched pattern is gate-approved for it, a panel with no
 * elevation on an archetype whose recipe assumes depth, motion that never
 * moves on a page built for scroll choreography. Every one changes something
 * a screenshot would show.
 */
function styleUpgradeFindings(
  manifest: VariantManifest,
  candidates: RegionCandidates[],
): Array<{ id: string; surface: Recommendation['surface']; title: string; rationale: string; evidence: string; delta: Recommendation['delta'] }> {
  const findings: ReturnType<typeof styleUpgradeFindings> = [];

  // A generic fallback is not wrong, but it is never the best available answer
  // once a real candidate has cleared the gate for this archetype's vocabulary.
  const swaps = manifest.selections
    .filter((selection) => selection.recordId.startsWith(NEUTRAL_PREFIX))
    .flatMap((selection) => {
      const best = candidates
        .find((entry) => entry.regionId === selection.regionId)
        ?.matches.find((match) => !match.recordId.startsWith(NEUTRAL_PREFIX) && match.score >= 0.45);
      if (!best) return [];
      const record = getRegistryRecord(best.recordId);
      return record ? [{ regionId: selection.regionId, record, score: best.score }] : [];
    })
    .slice(0, 2); // Two per branch: enough to matter, not enough to flood the panel.

  for (const { regionId, record, score } of swaps) {
    findings.push({
      id: `${regionId}-fallback-upgrade`,
      surface: 'hierarchy',
      title: `Use "${record.name}" instead of the neutral fallback`,
      rationale: `"${regionId}" is rendering CanvasCraft's neutral fallback even though "${record.name}" is gate-approved for this region at a ${Math.round(score * 100)}% match on the ${manifest.archetype} vocabulary. ${record.usagePattern}`,
      evidence: `Currently ${NEUTRAL_PREFIX}*; matched candidate ${record.id} at ${Math.round(score * 100)}%.`,
      delta: { selectionSwaps: [{ regionId, recordId: record.id }] },
    });
  }

  // A flat panel argues nothing about hierarchy. That is a legitimate choice
  // for a dashboard someone stares at all day; it reads as unfinished on every
  // other archetype's own recipe.
  if (manifest.form.elevation === 'flat' && manifest.archetype !== 'application') {
    findings.push({
      id: 'elevation-upgrade',
      surface: 'hierarchy',
      title: 'Give panels real depth',
      rationale: `Every panel sits flush with the page. Raising elevation is what makes a ${manifest.archetype} surface read as composed rather than sketched, and it touches nothing else this direction decided.`,
      evidence: 'form.elevation: flat.',
      delta: { form: { elevation: 'raised' }, selectionSwaps: [] },
    });
  }

  // "cut" is a real argument on a tool: nothing should delay a read. It is not
  // an argument on a page whose whole recipe assumes scroll-driven reveals.
  if (manifest.motion.language === 'cut' && SCROLL_ARCHETYPES.has(manifest.archetype)) {
    findings.push({
      id: 'motion-language-upgrade',
      surface: 'motion',
      title: 'Let sections resolve as the reader scrolls',
      rationale: `This direction never animates, which reads as unfinished on a ${manifest.archetype} page built for scroll choreography. Switching to "reveal" is the smallest change that turns movement back on.`,
      evidence: 'motion.language: cut.',
      delta: { motion: { language: 'reveal' }, selectionSwaps: [] },
    });
  }

  return findings;
}

/**
 * Recommendations derived from what the branch actually is.
 *
 * This is the deterministic path, and also the floor under the AI path: an AI
 * proposal never replaces a measured failure, it only adds argument on top.
 */
export function measuredRecommendations(args: {
  branch: RunRecord['branches'][number];
  spec: ScreenSpec;
  candidates: RegionCandidates[];
  createdAt: string;
}): Recommendation[] {
  const { branch, spec, candidates, createdAt } = args;
  const measurements = measureBranch(branch.manifest, spec.accessibility);
  const failures = measurements
    .filter((measurement) => !measurement.passes)
    .flatMap((measurement) => {
      const finding = findingFor(measurement, branch.manifest);
      return finding ? [finding] : [];
    });

  const findings = failures.length > 0 ? failures : [tightestMargin(measurements, branch.manifest)].flatMap((entry) => (entry ? [entry] : []));

  const recommendations: Recommendation[] = findings.flatMap((finding) => {
    const delta = ManifestDelta.parse(finding.delta);
    if (!deltaChangesManifest(branch.manifest, delta)) return [];
    return [
      {
        id: `${branch.id}-${finding.measurement.id}`,
        branchId: branch.id,
        surface: finding.surface,
        severity: finding.severity,
        title: finding.title,
        rationale: finding.rationale.slice(0, 500),
        regionId: null,
        delta,
        evidence: finding.measurement.evidence.slice(0, 240),
        source: 'measured' as const,
        state: 'proposed' as const,
        createdAt,
      },
    ];
  });

  // Style upgrades run regardless of whether the branch passed every measured
  // floor: a branch with zero accessibility failures is exactly the case where
  // "no significant visible change" was happening before, because the only
  // fallback available was a headroom nudge on a measurement that already
  // passed.
  const upgrades = styleUpgradeFindings(branch.manifest, candidates).flatMap((finding) => {
    const delta = ManifestDelta.parse(finding.delta);
    if (!deltaChangesManifest(branch.manifest, delta)) return [];
    return [
      {
        id: `${branch.id}-${finding.id}`,
        branchId: branch.id,
        surface: finding.surface,
        severity: 'polish' as const,
        title: finding.title,
        rationale: finding.rationale.slice(0, 500),
        regionId: null,
        delta,
        evidence: finding.evidence.slice(0, 240),
        source: 'measured' as const,
        state: 'proposed' as const,
        createdAt,
      },
    ];
  });
  recommendations.push(...upgrades);

  // A region the spec declares but no state can reach is a structural gap, not
  // a treatment one, so it is reported without a delta that pretends to fix it.
  const stranded = unreachableRegions(spec);
  if (stranded.length > 0) {
    recommendations.push({
      id: `${branch.id}-state-completeness`,
      branchId: branch.id,
      surface: 'state-completeness',
      severity: 'blocker',
      title: 'Some drawn regions are never reachable',
      rationale: `${stranded.length} region(s) are scoped to states this screen does not declare, so nothing on the canvas ever shows them. Draw an arrow into that state, or clear the state variant so the region appears everywhere.`,
      regionId: stranded[0] ?? null,
      delta: ManifestDelta.parse({ selectionSwaps: [] }),
      evidence: `Unreachable: ${stranded.join(', ')}.`.slice(0, 240),
      source: 'measured',
      state: 'proposed',
      createdAt,
    });
  }

  return recommendations;
}

/** Maps the flat AI delta contract onto the internal partial-manifest delta. */
export function aiDeltaToManifestDelta(delta: AiRecommendationDraft['delta']): Recommendation['delta'] {
  const palette = {
    ...(delta.paletteAccent ? { accent: delta.paletteAccent } : {}),
    ...(delta.paletteTextPrimary ? { textPrimary: delta.paletteTextPrimary } : {}),
    ...(delta.paletteTextSecondary ? { textSecondary: delta.paletteTextSecondary } : {}),
    ...(delta.paletteSurface ? { surface: delta.paletteSurface } : {}),
    ...(delta.paletteBackdrop ? { backdrop: delta.paletteBackdrop } : {}),
  };
  const typography = {
    ...(delta.typographyBaseSizePx !== null ? { baseSizePx: delta.typographyBaseSizePx } : {}),
    ...(delta.typographyBodyLeading !== null ? { bodyLeading: delta.typographyBodyLeading } : {}),
    ...(delta.typographyScaleRatio !== null ? { scaleRatio: delta.typographyScaleRatio } : {}),
    ...(delta.typographyDisplayWeight !== null ? { displayWeight: Math.round(delta.typographyDisplayWeight) } : {}),
    ...(delta.typographyDisplayTrackingEm !== null ? { displayTrackingEm: delta.typographyDisplayTrackingEm } : {}),
  };
  const form = {
    ...(delta.formSpaceUnitPx !== null ? { spaceUnitPx: delta.formSpaceUnitPx } : {}),
    ...(delta.formDensity ? { density: delta.formDensity } : {}),
    ...(delta.formRadiusOuterPx !== null ? { radiusOuterPx: delta.formRadiusOuterPx } : {}),
    ...(delta.formElevation ? { elevation: delta.formElevation } : {}),
    ...(delta.formSurface ? { surface: delta.formSurface } : {}),
  };
  const controls = {
    ...(delta.controlsButtonShape ? { buttonShape: delta.controlsButtonShape } : {}),
    ...(delta.controlsButtonFill ? { buttonFill: delta.controlsButtonFill } : {}),
    ...(delta.controlsFocusRing ? { focusRing: delta.controlsFocusRing } : {}),
    ...(delta.controlsIconSizePx !== null ? { iconSizePx: delta.controlsIconSizePx } : {}),
  };
  const motion = {
    ...(delta.motionPreset ? { preset: delta.motionPreset } : {}),
    ...(delta.motionLanguage ? { language: delta.motionLanguage } : {}),
    ...(delta.motionDurationMs !== null ? { durationMs: Math.round(delta.motionDurationMs) } : {}),
    ...(delta.motionStaggerMs !== null ? { staggerMs: Math.round(delta.motionStaggerMs) } : {}),
    ...(delta.motionTravel !== null ? { travel: delta.motionTravel } : {}),
  };

  return ManifestDelta.parse({
    ...(Object.keys(palette).length > 0 ? { palette } : {}),
    ...(Object.keys(typography).length > 0 ? { typography } : {}),
    ...(Object.keys(form).length > 0 ? { form } : {}),
    ...(Object.keys(controls).length > 0 ? { controls } : {}),
    ...(Object.keys(motion).length > 0 ? { motion } : {}),
    selectionSwaps: delta.selectionSwaps,
  });
}

/**
 * True when applying this delta would actually change the branch.
 *
 * A recommendation whose delta restates the current values is worse than no
 * recommendation: the Apply button appears to work and nothing moves.
 */
export function deltaChangesManifest(
  manifest: VariantManifest,
  delta: Recommendation['delta'],
): boolean {
  const groups = ['palette', 'typography', 'form', 'controls', 'motion'] as const;
  for (const group of groups) {
    const patch = delta[group];
    if (!patch) continue;
    const current = manifest[group] as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined && current[key] !== value) return true;
    }
  }
  return delta.selectionSwaps.some(
    (swap) =>
      manifest.selections.find((selection) => selection.regionId === swap.regionId)?.recordId !==
      swap.recordId,
  );
}
