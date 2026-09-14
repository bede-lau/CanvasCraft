import { PageArchetype, type CanvasDoc, type ScreenSpec, type VariantManifest } from '@canvascraft/schema';
// The orchestrator publishes no build output, so its pure compiler functions
// are reached by source path — the same way this package reaches the template.
import {
  buildCandidates,
  buildDirections,
  compileScreenSpec,
  hashSpec,
} from '../../../apps/orchestrator/src/compiler.ts';

/**
 * One deliberately broad brief.
 *
 * The audit is only as good as the surface it renders, so this canvas draws
 * every stamp the compiler resolves to a distinct semantic role: a shell, a
 * hero, a metric shelf, a clustered insight deck, a media wall, a dense table,
 * a search control, and a primary action. Every registry pattern that can be
 * selected has a region here to be selected for.
 */
const AUDIT_CANVAS: CanvasDoc = {
  version: 1,
  id: 'qa-audit-canvas',
  title: 'Portfolio pulse',
  size: { width: 1280, height: 1600 },
  baseImage: null,
  elements: [
    { id: 'nav', kind: 'navbar', bounds: { x: 0, y: 0, width: 1280, height: 72 }, rotation: 0, z: 0, label: 'Northstar', children: [] },
    { id: 'hero', kind: 'hero', bounds: { x: 40, y: 100, width: 1200, height: 240 }, rotation: 0, z: 1, label: 'Portfolio pulse', children: [] },
    { id: 'search', kind: 'input', bounds: { x: 40, y: 372, width: 900, height: 48 }, rotation: 0, z: 2, label: 'Search signals', children: [] },
    { id: 'cta', kind: 'button', bounds: { x: 980, y: 372, width: 220, height: 48 }, rotation: 0, z: 3, label: 'Add initiative', children: [] },
    { id: 'metric-a', kind: 'card', bounds: { x: 40, y: 452, width: 280, height: 150 }, rotation: 0, z: 4, label: 'Active bets', children: [] },
    { id: 'metric-b', kind: 'card', bounds: { x: 340, y: 452, width: 280, height: 150 }, rotation: 0, z: 5, label: 'On track', children: [] },
    { id: 'metric-c', kind: 'card', bounds: { x: 640, y: 452, width: 280, height: 150 }, rotation: 0, z: 6, label: 'At risk', children: [] },
    { id: 'insight-a', kind: 'card', bounds: { x: 40, y: 640, width: 380, height: 220 }, rotation: 0, z: 7, label: 'Priority insights', children: [] },
    { id: 'insight-b', kind: 'card', bounds: { x: 440, y: 640, width: 380, height: 220 }, rotation: 0, z: 8, label: 'Expansion needs attention', children: [] },
    { id: 'insight-c', kind: 'card', bounds: { x: 840, y: 640, width: 380, height: 220 }, rotation: 0, z: 9, label: 'Retention is holding', children: [] },
    { id: 'media', kind: 'media', bounds: { x: 40, y: 900, width: 1200, height: 320 }, rotation: 0, z: 10, label: 'Selected work', children: [] },
    { id: 'table', kind: 'table', bounds: { x: 40, y: 1260, width: 1200, height: 300 }, rotation: 0, z: 11, label: 'Recent activity', children: [] },
  ],
  arrows: [],
  notes: [
    {
      id: 'n1',
      text: 'Dashboard for a product portfolio review. Insights are three proof points read together.',
      bounds: { x: 40, y: 1580, width: 400, height: 40 },
      tone: 'slate',
    },
  ],
  strokes: [],
  designPreferences: {
    archetype: 'application',
    displayFont: 'grotesk',
    bodyFont: 'clean',
    buttonShape: 'soft',
    motionPreset: 'calm',
    motionIntensity: 'moderate',
  },
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-10T00:00:00.000Z',
};

export interface AuditBranch {
  archetype: PageArchetype;
  /** e.g. "application / Composed Depth" */
  label: string;
  spec: ScreenSpec;
  manifest: VariantManifest;
}

/**
 * Every deterministic branch a run can produce: the four page archetypes, three
 * directions each. These are the manifests `buildDirections` ships when no live
 * AI generator is configured, and the ones a person is most likely to be
 * looking at when a component overflows.
 */
export function auditBranches(): AuditBranch[] {
  const branches: AuditBranch[] = [];

  for (const archetype of PageArchetype.options) {
    const spec = compileScreenSpec({
      ...AUDIT_CANVAS,
      designPreferences: { ...AUDIT_CANVAS.designPreferences, archetype },
    });
    const candidates = buildCandidates(spec, archetype);
    const manifests = buildDirections({
      runId: `qa-${archetype}`,
      spec,
      specHash: hashSpec(spec),
      candidates,
      designPreferences: { ...AUDIT_CANVAS.designPreferences, archetype },
      createdAt: AUDIT_CANVAS.createdAt,
    });

    for (const manifest of manifests) {
      branches.push({ archetype, label: `${archetype} / ${manifest.name}`, spec, manifest });
    }
  }

  return branches;
}

/**
 * One probe branch per third-party adapter (`src/patterns/adapters.tsx`).
 *
 * The adapters are already gate-approved registry records, so the AI can select
 * them, but the deterministic `buildDirections` output almost never does — which
 * is how three of them shipped as dead records that fell back to the neutral
 * shell. This forces each adapter onto every region whose role it serves and
 * runs it through the same render audit as everything else.
 */
export function adapterProbeBranches(): Array<AuditBranch & { recordId: string }> {
  const archetype: PageArchetype = 'ai-native';
  const spec = compileScreenSpec({
    ...AUDIT_CANVAS,
    designPreferences: { ...AUDIT_CANVAS.designPreferences, archetype },
  });
  const candidates = buildCandidates(spec, archetype);
  const baseManifest = buildDirections({
    runId: 'qa-adapter',
    spec,
    specHash: hashSpec(spec),
    candidates,
    designPreferences: { ...AUDIT_CANVAS.designPreferences, archetype },
    createdAt: AUDIT_CANVAS.createdAt,
  })[0]!;

  // recordId -> the semantic roles that adapter's registry record serves.
  const adapters: Record<string, ReadonlySet<string>> = {
    'beautiful-ui-thinking': new Set(['neutral-block', 'skeleton', 'insight-card']),
    'beautiful-ui-recommendation': new Set(['insight-card', 'neutral-block']),
    'beautiful-ui-task-list': new Set(['list-row', 'neutral-block']),
    'coss-ui-dialog': new Set(['dialog']),
    'coss-ui-empty-state': new Set(['empty-state', 'skeleton', 'neutral-block']),
    // No `neutral-block` region in the audit canvas, so this forces onto the
    // first region — an `app-bar`, which renders the composer branch, not the
    // one-line search branch, so `.cc-composer` proves the adapter resolved.
    'reui-textarea': new Set(['neutral-block']),
  };

  return Object.entries(adapters).map(([recordId, roles]) => {
    const targetRegionIds = new Set(
      spec.regions.filter((region) => roles.has(region.role)).map((region) => region.id),
    );
    // Nothing in the audit canvas has a `dialog` region, so `coss-ui-dialog`
    // gets forced onto the first region regardless — the point is to render it.
    const selections = baseManifest.selections.map((selection, index) =>
      targetRegionIds.has(selection.regionId) || (targetRegionIds.size === 0 && index === 0)
        ? { ...selection, recordId }
        : selection,
    );
    return {
      archetype,
      recordId,
      label: `adapter / ${recordId}`,
      spec,
      manifest: { ...baseManifest, id: `qa-adapter-${recordId}`, selections },
    };
  });
}
