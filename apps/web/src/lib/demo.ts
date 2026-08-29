import {
  CanvasDoc,
  Recommendation,
  ScreenSpec,
  VariantManifest,
  composeRemix,
  type MotionPreset,
  type ManifestDelta,
  type StateKind,
  type TraitGroup,
} from '@canvascraft/schema';
import { assessRecord, getRegistryRecord, matchLocally } from '@canvascraft/registry';

const now = '2026-08-29T09:00:00.000+08:00';
const specHash = '4df1e2c7b29e0c3de9801527c36562e9c52ce49b0ad2ffae421ce78fbcdd78d0';

export const DEFAULT_CANVAS = CanvasDoc.parse({
  version: 1,
  id: 'canvas-demo',
  title: 'Portfolio intelligence dashboard',
  size: { width: 1120, height: 720 },
  baseImage: null,
  elements: [
    { id: 'nav', kind: 'navbar', bounds: { x: 90, y: 70, width: 930, height: 64 }, label: 'Northstar', z: 1 },
    { id: 'hero', kind: 'hero', bounds: { x: 90, y: 154, width: 590, height: 112 }, label: 'Portfolio pulse', z: 2 },
    { id: 'search', kind: 'input', bounds: { x: 710, y: 176, width: 310, height: 48 }, label: 'Search signals', z: 3 },
    { id: 'metrics', kind: 'card', bounds: { x: 90, y: 292, width: 930, height: 126 }, label: 'Key metrics', z: 4 },
    { id: 'insights', kind: 'card', bounds: { x: 90, y: 442, width: 570, height: 202 }, label: 'Priority insights', z: 5 },
    { id: 'table', kind: 'table', bounds: { x: 686, y: 442, width: 334, height: 202 }, label: 'Recent activity', z: 6 },
    { id: 'details', kind: 'modal', bounds: { x: 790, y: 280, width: 210, height: 130 }, label: 'Insight details', z: 7 },
  ],
  arrows: [
    {
      id: 'arrow-insight-details',
      from: 'insights',
      to: 'details',
      interaction: 'open-modal',
      label: 'open modal',
      points: [{ x: 610, y: 500 }, { x: 736, y: 420 }, { x: 824, y: 354 }],
    },
    {
      id: 'arrow-search-filter',
      from: 'search',
      to: 'insights',
      interaction: 'show-filtered-state',
      label: 'filter insights',
      points: [{ x: 860, y: 224 }, { x: 734, y: 334 }, { x: 560, y: 472 }],
    },
  ],
  notes: [
    {
      id: 'note-tone',
      text: 'Premium, calm, and credible. Keep the same dashboard flow in every direction.',
      bounds: { x: 742, y: 78, width: 260, height: 78 },
      anchorElementId: 'hero',
      tone: 'amber',
    },
  ],
  strokes: [],
  createdAt: now,
  updatedAt: now,
});

export const DEMO_SPEC = ScreenSpec.parse({
  version: 1,
  id: 'spec-portfolio-pulse',
  canvasId: DEFAULT_CANVAS.id,
  name: 'Portfolio pulse',
  intent: 'Help a strategy lead scan portfolio health, filter signals, and inspect one priority insight.',
  audience: 'Product and investment leads reviewing active initiatives.',
  regions: [
    {
      id: 'app-bar',
      sourceElementId: 'nav',
      role: 'app-bar',
      region: 'header',
      label: 'Northstar',
      purpose: 'Orient the user and expose the primary workspace sections.',
      sourceBounds: DEFAULT_CANVAS.elements[0]!.bounds,
      order: 0,
      children: [],
      visibleInStates: [],
      contentShape: 'nav-items',
    },
    {
      id: 'page-intro',
      sourceElementId: 'hero',
      role: 'hero-statement',
      region: 'hero',
      label: 'Portfolio pulse',
      purpose: 'Frame the current review and clarify what needs attention.',
      sourceBounds: DEFAULT_CANVAS.elements[1]!.bounds,
      order: 1,
      children: [],
      visibleInStates: [],
      contentShape: 'text',
    },
    {
      id: 'search-control',
      sourceElementId: 'search',
      role: 'search-control',
      region: 'primary',
      label: 'Search signals',
      purpose: 'Filter priority insights using local fixture content.',
      sourceBounds: DEFAULT_CANVAS.elements[2]!.bounds,
      order: 2,
      children: [],
      visibleInStates: [],
      contentShape: 'none',
    },
    {
      id: 'metric-shelf',
      sourceElementId: 'metrics',
      role: 'metric-tile',
      region: 'primary',
      label: 'Portfolio health',
      purpose: 'Summarise the most important portfolio measures.',
      sourceBounds: DEFAULT_CANVAS.elements[3]!.bounds,
      order: 3,
      children: [],
      visibleInStates: [],
      contentShape: 'metric',
    },
    {
      id: 'insight-deck',
      sourceElementId: 'insights',
      role: 'insight-card',
      region: 'primary',
      label: 'Priority insights',
      purpose: 'Rank the signals that deserve a closer look.',
      sourceBounds: DEFAULT_CANVAS.elements[4]!.bounds,
      order: 4,
      children: [],
      visibleInStates: [],
      contentShape: 'record-list',
    },
    {
      id: 'activity-table',
      sourceElementId: 'table',
      role: 'data-table',
      region: 'secondary',
      label: 'Recent activity',
      purpose: 'Show recent portfolio changes using the same fixtures in every branch.',
      sourceBounds: DEFAULT_CANVAS.elements[5]!.bounds,
      order: 5,
      children: [],
      visibleInStates: [],
      contentShape: 'record-table',
    },
    {
      id: 'insight-dialog',
      sourceElementId: 'details',
      role: 'dialog',
      region: 'overlay',
      label: 'Insight details',
      purpose: 'Explain one selected signal without leaving the dashboard.',
      sourceBounds: DEFAULT_CANVAS.elements[6]!.bounds,
      order: 6,
      children: [],
      visibleInStates: ['modal'],
      contentShape: 'text',
    },
  ],
  interactions: [
    {
      id: 'inspect-insight',
      sourceArrowId: 'arrow-insight-details',
      kind: 'open-modal',
      fromRegion: 'insight-deck',
      toRegion: 'insight-dialog',
      fromState: null,
      toState: 'modal',
      description: 'Open the same priority insight in a detail modal.',
      auditionable: true,
    },
    {
      id: 'filter-insights',
      sourceArrowId: 'arrow-search-filter',
      kind: 'show-filtered-state',
      fromRegion: 'search-control',
      toRegion: 'insight-deck',
      fromState: null,
      toState: 'filtered',
      description: 'Filter the same insight fixtures from the search control.',
      auditionable: true,
    },
  ],
  states: [
    { id: 'default', label: 'Default', description: 'Populated portfolio dashboard.', hiddenRegions: [], placeholderRegions: [] },
    { id: 'loading', label: 'Loading', description: 'Metrics and insights show skeletons.', hiddenRegions: [], placeholderRegions: ['metric-shelf', 'insight-deck', 'activity-table'] },
    { id: 'empty', label: 'Empty', description: 'No insights match the current view.', hiddenRegions: [], placeholderRegions: [] },
    { id: 'filtered', label: 'Filtered', description: 'Only matching portfolio signals remain.', hiddenRegions: [], placeholderRegions: [] },
    { id: 'modal', label: 'Detail modal', description: 'The selected insight opens over the dashboard.', hiddenRegions: [], placeholderRegions: [] },
    { id: 'success', label: 'Success', description: 'A local update is confirmed.', hiddenRegions: [], placeholderRegions: [] },
    { id: 'error', label: 'Error', description: 'A local action reports a recoverable failure.', hiddenRegions: [], placeholderRegions: [] },
    { id: 'narrow', label: 'Narrow', description: 'The dashboard stacks for a compact viewport.', hiddenRegions: [], placeholderRegions: [] },
  ],
  fixtures: [
    {
      regionId: 'metric-shelf',
      records: [
        { title: 'Active bets', value: '18', delta: '+2 this month' },
        { title: 'On track', value: '72%', delta: '+4.8%' },
        { title: 'At risk', value: '3', delta: '-1 this week' },
      ],
    },
    {
      regionId: 'insight-deck',
      records: [
        { title: 'Activation is accelerating', status: 'High confidence', detail: 'Onboarding completion rose 18%.' },
        { title: 'Expansion needs attention', status: 'Watch', detail: 'Two enterprise pilots slowed.' },
        { title: 'Mobile retention improved', status: 'Positive', detail: 'Week-four retention is up 7%.' },
      ],
    },
    {
      regionId: 'activity-table',
      records: [
        { initiative: 'Atlas', owner: 'Maya', status: 'On track' },
        { initiative: 'Relay', owner: 'Noah', status: 'Review' },
        { initiative: 'Orbit', owner: 'Iris', status: 'On track' },
      ],
    },
  ],
  ambiguities: [],
  accessibility: {
    minBodyContrast: 4.5,
    minLargeTextContrast: 3,
    minTouchTargetPx: 44,
    requiresVisibleFocus: true,
    requiresKeyboardPath: true,
    requiresReducedMotionFallback: true,
    landmarks: ['banner', 'navigation', 'main'],
  },
  responsive: {
    narrowBreakpointPx: 640,
    wideBreakpointPx: 1280,
    stacksBelowNarrow: ['metric-shelf', 'insight-deck', 'activity-table'],
    collapsesBelowNarrow: [],
  },
  createdAt: now,
});

function manifest(
  id: string,
  name: string,
  genome: string,
  rationale: string,
  preset: MotionPreset,
  palette: VariantManifest['palette'],
  form: VariantManifest['form'],
  controls: VariantManifest['controls'],
  selections: VariantManifest['selections'],
): VariantManifest {
  return VariantManifest.parse({
    version: 1,
    id,
    name,
    genome,
    rationale,
    palette,
    typography: {
      displayFamily: name === 'Editorial Precision' ? '"Bricolage Grotesque Variable", sans-serif' : '"Geist Variable", sans-serif',
      bodyFamily: '"Geist Variable", sans-serif',
      monoFamily: '"Geist Mono Variable", monospace',
      scaleRatio: name === 'Editorial Precision' ? 1.28 : 1.2,
      baseSizePx: 15,
      displayWeight: name === 'Playful Momentum' ? 720 : 640,
      bodyWeight: 430,
      displayTrackingEm: 0,
      bodyLeading: 1.5,
    },
    form,
    controls,
    motion:
      preset === 'calm'
        ? { preset, durationMs: 260, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', staggerMs: 40, travel: 0.25, reducedMotion: 'fade-only' }
        : preset === 'playful'
          ? { preset, durationMs: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', staggerMs: 70, travel: 0.7, reducedMotion: 'fade-only' }
          : { preset, durationMs: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)', staggerMs: 20, travel: 0.1, reducedMotion: 'instant' },
    selections,
    lineage: {
      specId: DEMO_SPEC.id,
      specHash,
      parentBranchIds: [],
      traitOrigins: { palette: null, typography: null, form: null, controls: null, motion: null, selections: null },
      registryVersion: '0.1.0',
    },
    createdAt: now,
  });
}

const RECORD_BY_REGION: Record<string, string> = {
  'app-bar': 'reui-app-frame',
  'page-intro': 'react-bits-card-swap',
  'search-control': 'canvascraft-neutral-shell',
  'metric-shelf': 'canvascraft-neutral-card-grid',
  'insight-deck': 'react-bits-card-swap',
  'activity-table': 'reui-data-table',
  'insight-dialog': 'coss-ui-dialog',
};

const baseSelections: VariantManifest['selections'] = DEMO_SPEC.regions.map((region) => {
  const requestedId = RECORD_BY_REGION[region.id] ?? 'canvascraft-neutral-shell';
  const record = getRegistryRecord(requestedId);
  if (!record) throw new Error(`Missing registry record ${requestedId}`);
  const verdict = assessRecord(record);
  if (!verdict.allowed) throw new Error(`Registry gate rejected ${requestedId}: ${verdict.reason ?? 'unknown reason'}`);
  const localMatch = matchLocally({ role: region.role, wantsMotion: region.id === 'insight-deck' })
    .find((match) => match.recordId === record.id);
  return {
    regionId: region.id,
    recordId: record.id,
    source: record.source,
    sourceUrl: record.sourceUrl,
    license: record.license,
    licenseNotice: record.licenseNotice,
    matchScore: localMatch?.score ?? 0.58,
    matchSource: 'local',
    whyItFits: localMatch?.rationale ?? `Gate-approved local fallback for the shared ${region.role} contract.`,
    fallbackReason: localMatch ? null : 'Nosana is unavailable; the reviewed local catalogue supplied a compatible fallback.',
  };
});

export const INITIAL_MANIFESTS: VariantManifest[] = [
  manifest(
    'branch-calm',
    'Calm Trust',
    'Mineral palette · soft controls · calm motion',
    'Reduces cognitive noise so portfolio risk reads as measured and credible.',
    'calm',
    {
      name: 'Mineral',
      background: '#f4f6f3',
      surface: '#ffffff',
      surfaceRaised: '#f9faf8',
      border: '#d9dfd8',
      textPrimary: '#16201a',
      textSecondary: '#637067',
      accent: '#27634a',
      accentContrast: '#ffffff',
      positive: '#347856',
      critical: '#9b4f49',
      scheme: 'light',
    },
    { spaceUnitPx: 4, density: 'roomy', radiusOuterPx: 16, radiusStepPx: 4, borderWidthPx: 1, elevation: 'hairline' },
    { buttonShape: 'soft', buttonFill: 'solid', inputStyle: 'outlined', iconWeight: 'regular', iconSizePx: 18, focusRing: 'ring' },
    baseSelections,
  ),
  manifest(
    'branch-playful',
    'Playful Momentum',
    'Electric palette · pill controls · playful motion',
    'Makes positive movement feel tangible while keeping the data contract intact.',
    'playful',
    {
      name: 'Electric',
      background: '#10131a',
      surface: '#171c26',
      surfaceRaised: '#202838',
      border: '#364158',
      textPrimary: '#f4f7fb',
      textSecondary: '#a4afc2',
      accent: '#d9f36b',
      accentContrast: '#12160a',
      positive: '#69c38c',
      critical: '#e78279',
      scheme: 'dark',
    },
    { spaceUnitPx: 4, density: 'regular', radiusOuterPx: 20, radiusStepPx: 5, borderWidthPx: 1, elevation: 'lifted' },
    { buttonShape: 'pill', buttonFill: 'solid', inputStyle: 'filled', iconWeight: 'bold', iconSizePx: 18, focusRing: 'underglow' },
    baseSelections,
  ),
  manifest(
    'branch-editorial',
    'Editorial Precision',
    'Paper palette · sharp controls · editorial motion',
    'Prioritises hierarchy and scanning speed for dense, repeated review work.',
    'editorial',
    {
      name: 'Paper',
      background: '#f5f1e9',
      surface: '#fffdf8',
      surfaceRaised: '#f0ebe1',
      border: '#c8c0b2',
      textPrimary: '#1e1b17',
      textSecondary: '#6b6258',
      accent: '#9b3f2d',
      accentContrast: '#ffffff',
      positive: '#497253',
      critical: '#a34037',
      scheme: 'light',
    },
    { spaceUnitPx: 4, density: 'compact', radiusOuterPx: 4, radiusStepPx: 2, borderWidthPx: 1.5, elevation: 'flat' },
    { buttonShape: 'sharp', buttonFill: 'outline', inputStyle: 'underlined', iconWeight: 'light', iconSizePx: 17, focusRing: 'outline' },
    baseSelections,
  ),
];

export const INITIAL_RECOMMENDATIONS: Recommendation[] = [
  Recommendation.parse({
    id: 'rec-hierarchy',
    branchId: 'branch-calm',
    surface: 'hierarchy',
    severity: 'improvement',
    title: 'Give the priority deck more weight',
    rationale: 'The metric shelf and insight deck currently compete. A slightly raised insight surface makes the next action clearer.',
    regionId: 'insight-deck',
    delta: { form: { elevation: 'raised' }, selectionSwaps: [] },
    evidence: 'Primary action region is visually equal to summary metrics.',
    state: 'proposed',
    createdAt: now,
  }),
  Recommendation.parse({
    id: 'rec-motion',
    branchId: 'branch-calm',
    surface: 'motion',
    severity: 'polish',
    title: 'Tighten the modal response',
    rationale: 'The calm preset can stay restrained while responding sooner to an explicit inspection action.',
    regionId: 'insight-dialog',
    delta: { motion: { durationMs: 210 }, selectionSwaps: [] },
    evidence: 'Current modal transition is 260ms.',
    state: 'proposed',
    createdAt: now,
  }),
  Recommendation.parse({
    id: 'rec-touch',
    branchId: 'branch-calm',
    surface: 'touch-target',
    severity: 'improvement',
    title: 'Increase compact control breathing room',
    rationale: 'A small density adjustment preserves scan speed while protecting the 44px touch-target floor.',
    regionId: 'search-control',
    delta: { form: { density: 'regular' }, selectionSwaps: [] },
    evidence: 'Search clear control is close to its minimum target.',
    state: 'proposed',
    createdAt: now,
  }),
];

export const RUN_STAGES = [
  { actor: 'CanvasCraft', label: 'Mapping stamps and arrows', detail: '7 regions · 2 interactions' },
  { actor: 'Local demo', label: 'Interpreting wireframe', detail: 'Deterministic Screen Spec fallback' },
  { actor: 'Local matcher', label: 'Matching visual UI patterns', detail: 'Nosana unavailable · metadata fallback' },
  { actor: 'CanvasCraft', label: 'Checking licences and compatibility', detail: 'Base UI stack approved' },
  { actor: 'Local demo', label: 'Proposing three directions', detail: 'Schema-valid manifests from fixtures' },
  { actor: 'Local preview', label: 'Preparing comparable branches', detail: 'Daytona unavailable · in-browser simulation' },
] as const;

export function updateManifest(
  manifest: VariantManifest,
  delta: Recommendation['delta'],
): VariantManifest {
  return VariantManifest.parse({
    ...manifest,
    palette: { ...manifest.palette, ...delta.palette },
    typography: { ...manifest.typography, ...delta.typography },
    form: { ...manifest.form, ...delta.form },
    controls: { ...manifest.controls, ...delta.controls },
    motion: { ...manifest.motion, ...delta.motion },
    selections: manifest.selections.map((selection) => {
      const swap = delta.selectionSwaps.find((entry) => entry.regionId === selection.regionId);
      return swap ? { ...selection, recordId: swap.recordId } : selection;
    }),
  });
}

export function captureManifestDelta(
  manifest: VariantManifest,
  delta: ManifestDelta,
): ManifestDelta {
  const captured: ManifestDelta = { selectionSwaps: [] };
  if (delta.palette) captured.palette = Object.fromEntries(
    Object.keys(delta.palette).map((key) => [key, manifest.palette[key as keyof typeof manifest.palette]]),
  );
  if (delta.typography) captured.typography = Object.fromEntries(
    Object.keys(delta.typography).map((key) => [key, manifest.typography[key as keyof typeof manifest.typography]]),
  );
  if (delta.form) captured.form = Object.fromEntries(
    Object.keys(delta.form).map((key) => [key, manifest.form[key as keyof typeof manifest.form]]),
  );
  if (delta.controls) captured.controls = Object.fromEntries(
    Object.keys(delta.controls).map((key) => [key, manifest.controls[key as keyof typeof manifest.controls]]),
  );
  if (delta.motion) captured.motion = Object.fromEntries(
    Object.keys(delta.motion).map((key) => [key, manifest.motion[key as keyof typeof manifest.motion]]),
  );
  captured.selectionSwaps = delta.selectionSwaps.flatMap((swap) => {
    const current = manifest.selections.find((selection) => selection.regionId === swap.regionId);
    return current ? [{ regionId: swap.regionId, recordId: current.recordId }] : [];
  });
  return captured;
}

export function swapManifestPattern(
  manifest: VariantManifest,
  regionId: string,
  recordId: string,
): VariantManifest {
  const record = getRegistryRecord(recordId);
  if (!record) throw new Error(`Unknown registry record "${recordId}".`);
  const verdict = assessRecord(record);
  if (!verdict.allowed) throw new Error(verdict.reason ?? `Pattern "${recordId}" failed the registry gate.`);
  return VariantManifest.parse({
    ...manifest,
    selections: manifest.selections.map((selection) =>
      selection.regionId === regionId
        ? {
            ...selection,
            recordId: record.id,
            source: record.source,
            sourceUrl: record.sourceUrl,
            license: record.license,
            licenseNotice: record.licenseNotice,
            matchSource: 'local',
            whyItFits: `Locally selected compatible ${record.name} pattern.`,
            fallbackReason: null,
          }
        : selection,
    ),
  });
}

export function createRemix(
  name: string,
  sources: Record<TraitGroup, VariantManifest>,
): VariantManifest {
  return composeRemix({
    id: `branch-remix-${Date.now()}`,
    name,
    genome: `${sources.palette.palette.name} palette · ${sources.controls.controls.buttonShape} controls · ${sources.motion.motion.preset} motion`,
    rationale: 'A validated trait composition assembled from approved parent manifests.',
    createdAt: new Date().toISOString(),
    sources,
  });
}

export const STATE_LABELS: Record<StateKind, string> = {
  default: 'Default',
  loading: 'Loading',
  empty: 'Empty',
  filtered: 'Filtered',
  selected: 'Selected',
  modal: 'Modal',
  drawer: 'Drawer',
  success: 'Success',
  error: 'Error',
  narrow: 'Narrow',
};
