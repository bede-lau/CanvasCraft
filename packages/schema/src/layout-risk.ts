import type { VariantManifest } from './manifest.js';
import type { ScreenSpec } from './screen-spec.js';

/**
 * Static layout-risk analysis.
 *
 * jsdom has no layout engine and the orchestrator must not boot a browser in
 * the request path, so true overlap and overflow are measured out-of-tree by
 * the layout-audit package. What *is* cheap and deterministic is reading the
 * manifest and the spec for the choices that are known to produce a bad render
 * — a region left on the neutral fallback when a richer pattern was approved, a
 * roomy density on a working surface, a glass panel with nothing behind it.
 *
 * These are the signals the AI critic pass can actually act on: every one of
 * them is fixed by changing a manifest value, not by touching CSS.
 */

export type LayoutRiskKind =
  | 'neutral-fallback'
  | 'dead-space-risk'
  | 'surface-conflict'
  | 'long-page-roomy'
  | 'flat-landing';

export interface LayoutRiskIssue {
  id: string;
  kind: LayoutRiskKind;
  /** 'blocker' fails the acceptance bar; 'warn' is worth a revise but not fatal. */
  severity: 'blocker' | 'warn';
  /** Present when the issue is about one region. */
  regionId?: string;
  /** One sentence, in the terms the critic prompt and the run log both use. */
  detail: string;
}

/** A recordId the compiler falls back to when no richer pattern is chosen. */
function isNeutralFallback(recordId: string): boolean {
  return recordId.startsWith('canvascraft-neutral') || recordId === 'canvascraft-block';
}

function topLevelRegionCount(spec: ScreenSpec): number {
  const childIds = new Set(spec.regions.flatMap((region) => region.children));
  return spec.regions.filter(
    (region) => region.region !== 'overlay' && !childIds.has(region.id),
  ).length;
}

export function findLayoutRiskIssues(args: {
  manifest: VariantManifest;
  spec: ScreenSpec;
  /** Gate-approved candidate ids per region, as the direction generator saw them. */
  selectionOptions: ReadonlyArray<{ regionId: string; recordIds: readonly string[] }>;
}): LayoutRiskIssue[] {
  const { manifest, spec, selectionOptions } = args;
  const issues: LayoutRiskIssue[] = [];
  const optionsByRegion = new Map(
    selectionOptions.map((entry) => [entry.regionId, entry.recordIds] as const),
  );

  for (const selection of manifest.selections) {
    if (!isNeutralFallback(selection.recordId)) continue;
    const approved = optionsByRegion.get(selection.regionId) ?? [];
    const richer = approved.filter((recordId) => !isNeutralFallback(recordId));
    if (richer.length > 0) {
      issues.push({
        id: `neutral-fallback:${selection.regionId}`,
        kind: 'neutral-fallback',
        severity: 'warn',
        regionId: selection.regionId,
        detail: `Region "${selection.regionId}" is on the neutral fallback "${selection.recordId}" while gate-approved options ${richer
          .map((id) => `"${id}"`)
          .join(', ')} were available.`,
      });
    }
  }

  if (
    manifest.form.density === 'roomy' &&
    (manifest.archetype === 'application' || manifest.archetype === 'ai-native')
  ) {
    issues.push({
      id: 'dead-space-risk:density',
      kind: 'dead-space-risk',
      severity: 'warn',
      detail: `Roomy density on a ${manifest.archetype} surface spreads working content into empty bands; regular or compact reads as intentional.`,
    });
  }

  if (manifest.form.surface === 'glass' && manifest.palette.backdrop === 'flat') {
    issues.push({
      id: 'surface-conflict:glass-flat',
      kind: 'surface-conflict',
      severity: 'warn',
      detail:
        'A glass surface over a flat backdrop has nothing to blur, so the panels read as flat rectangles. Pair glass with aurora, wash, or spotlight.',
    });
  }

  if (manifest.archetype === 'marketing' && manifest.palette.backdrop === 'flat') {
    issues.push({
      id: 'flat-landing:backdrop',
      kind: 'flat-landing',
      severity: 'warn',
      detail:
        'A landing page on a flat backdrop reads as an internal tool. Reach for aurora, wash, or spotlight.',
    });
  }

  if (topLevelRegionCount(spec) >= 6 && manifest.form.density === 'roomy') {
    issues.push({
      id: 'long-page-roomy',
      kind: 'long-page-roomy',
      severity: 'warn',
      detail: `${topLevelRegionCount(spec)} top-level sections at roomy density make a very long page with a large gap between each; regular density keeps it scannable.`,
    });
  }

  return issues;
}
