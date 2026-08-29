import { createHash } from 'node:crypto';

import {
  type AiDirectionSet,
  MOTION_PRESETS,
  ScreenSpec,
  canonicalJson,
  findSpecIntegrityIssues,
  type CanvasDoc,
  type CanvasElement,
  type InteractionKind,
  type LayoutRegion,
  type RegionCandidates,
  type SemanticRole,
  type SpecFixture,
  type StateKind,
  VariantManifest,
  type VariantManifest as VariantManifestType,
} from '@canvascraft/schema';
import {
  REGISTRY_MANIFEST,
  REGISTRY_RECORDS,
  assessRecord,
  getRegistryRecord,
  matchLocally,
} from '@canvascraft/registry';

const INTERACTION_STATE: Record<InteractionKind, StateKind> = {
  'navigate-tab': 'selected',
  'open-modal': 'modal',
  'open-drawer': 'drawer',
  'show-filtered-state': 'filtered',
  'select-item': 'selected',
  'advance-carousel': 'selected',
  'next-step': 'selected',
  'submit-with-validation': 'success',
  'show-toast': 'success',
  'reset-state': 'default',
};

const ROLE_BY_STAMP: Record<CanvasElement['kind'], SemanticRole> = {
  navbar: 'app-bar',
  hero: 'hero-statement',
  card: 'insight-card',
  button: 'primary-action',
  input: 'search-control',
  table: 'data-table',
  tab: 'tab-strip',
  media: 'media-card',
  modal: 'dialog',
  sidebar: 'nav-primary',
};

const CONTENT_BY_ROLE: Record<SemanticRole, ScreenSpec['regions'][number]['contentShape']> = {
  'app-bar': 'nav-items',
  'nav-primary': 'nav-items',
  'nav-secondary': 'nav-items',
  'page-title': 'text',
  'hero-statement': 'text',
  'metric-tile': 'metric',
  'insight-card': 'record-list',
  'media-card': 'media-grid',
  'list-row': 'record-list',
  'data-table': 'record-table',
  'search-control': 'form-fields',
  'filter-control': 'form-fields',
  'tab-strip': 'nav-items',
  'primary-action': 'text',
  'secondary-action': 'text',
  'form-field': 'form-fields',
  dialog: 'text',
  drawer: 'text',
  toast: 'text',
  'empty-state': 'text',
  skeleton: 'none',
  'neutral-block': 'none',
};

function slug(value: string, fallback: string): string {
  const result = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54);
  return result || fallback;
}

function uniqueSlug(base: string, used: Set<string>): string {
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 58)}-${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function layoutRegion(element: CanvasElement, canvas: CanvasDoc): LayoutRegion {
  if (element.kind === 'navbar') return 'header';
  if (element.kind === 'sidebar') return 'sidebar';
  if (element.kind === 'hero') return 'hero';
  if (element.kind === 'modal') return 'overlay';

  const centreX = element.bounds.x + element.bounds.width / 2;
  const centreY = element.bounds.y + element.bounds.height / 2;
  if (centreY > canvas.size.height * 0.82) return 'footer';
  if (centreX > canvas.size.width * 0.72) return 'aside';
  return centreY < canvas.size.height * 0.48 ? 'primary' : 'secondary';
}

function inferRole(element: CanvasElement, notes: string): SemanticRole {
  const context = `${element.label} ${notes}`.toLowerCase();
  if (element.kind === 'card' && /(metric|revenue|total|score|kpi)/.test(context)) return 'metric-tile';
  if (element.kind === 'input' && /(filter|segment|category)/.test(context)) return 'filter-control';
  if (element.kind === 'button' && /(cancel|back|secondary)/.test(context)) return 'secondary-action';
  return ROLE_BY_STAMP[element.kind];
}

function fixtureFor(region: ScreenSpec['regions'][number]): SpecFixture | null {
  switch (region.contentShape) {
    case 'metric':
      return { regionId: region.id, records: [{ label: region.label, value: 128, trend: '+12%' }] };
    case 'record-list':
      return {
        regionId: region.id,
        records: [
          { title: `${region.label} item one`, status: 'Active' },
          { title: `${region.label} item two`, status: 'Review' },
        ],
      };
    case 'record-table':
      return {
        regionId: region.id,
        records: [
          { name: 'Northwind', owner: 'Avery', status: 'Active' },
          { name: 'Contoso', owner: 'Riley', status: 'Review' },
        ],
      };
    case 'media-grid':
      return {
        regionId: region.id,
        records: [
          { title: 'Featured collection', category: 'Primary' },
          { title: 'Recent collection', category: 'Secondary' },
        ],
      };
    case 'form-fields':
      return { regionId: region.id, records: [{ label: region.label, value: '' }] };
    case 'nav-items':
      return { regionId: region.id, records: [{ label: 'Overview' }, { label: 'Activity' }, { label: 'Settings' }] };
    case 'none':
    case 'text':
      return null;
  }
}

export function compileScreenSpec(canvas: CanvasDoc): ScreenSpec {
  const noteText = canvas.notes.map((note) => note.text).join(' ').trim();
  const usedIds = new Set<string>();
  const regions =
    canvas.elements.length > 0
      ? [...canvas.elements]
          .sort((left, right) => left.z - right.z || left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x)
          .map((element, order) => {
            const role = inferRole(
              element,
              canvas.notes
                .filter((note) => note.anchorElementId === element.id)
                .map((note) => note.text)
                .join(' '),
            );
            return {
              id: uniqueSlug(slug(element.label || `${element.kind}-${order + 1}`, `region-${order + 1}`), usedIds),
              sourceElementId: element.id,
              role,
              region: layoutRegion(element, canvas),
              label: element.label || element.kind.replace('-', ' '),
              purpose: `Render the ${element.label || element.kind} intent from the canvas as a local, interactive ${role}.`,
              sourceBounds: element.bounds,
              order,
              children: [],
              visibleInStates: element.intendedState ? [element.intendedState] : [],
              contentShape: CONTENT_BY_ROLE[role],
            };
          })
      : [
          {
            id: 'uploaded-wireframe',
            sourceElementId: null,
            role: 'neutral-block' as const,
            region: 'primary' as const,
            label: canvas.title || 'Uploaded wireframe',
            purpose: 'Preserve the uploaded wireframe intent with a neutral local layout.',
            sourceBounds: canvas.baseImage?.bounds ?? null,
            order: 0,
            children: [],
            visibleInStates: [],
            contentShape: 'none' as const,
          },
        ];

  const regionByElement = new Map(
    regions.flatMap((region) => (region.sourceElementId ? [[region.sourceElementId, region.id] as const] : [])),
  );
  const requiredStates = new Set<StateKind>(['default', 'narrow']);
  for (const element of canvas.elements) {
    if (element.intendedState) requiredStates.add(element.intendedState);
  }
  for (const arrow of canvas.arrows) requiredStates.add(INTERACTION_STATE[arrow.interaction]);

  const stateDescription: Record<StateKind, string> = {
    default: 'Populated local fixture content.',
    loading: 'A local simulated transition with skeleton placeholders.',
    empty: 'No matching local fixture records, with a clear recovery action.',
    filtered: 'Local fixture content filtered by the active control.',
    selected: 'The selected local item or step is visibly active.',
    modal: 'The drawn modal interaction is open and keyboard reachable.',
    drawer: 'The drawn drawer interaction is open and keyboard reachable.',
    success: 'A local success message confirms the interaction.',
    error: 'A local validation or error message explains recovery.',
    narrow: 'The same content and interactions reflow below the locked narrow breakpoint.',
  };

  const states = [...requiredStates].map((id) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    description: stateDescription[id],
    hiddenRegions: [],
    placeholderRegions: id === 'loading' ? regions.filter((region) => region.contentShape !== 'none').map((region) => region.id) : [],
  }));

  const interactions = canvas.arrows.flatMap((arrow, index) => {
    const fromRegion = regionByElement.get(arrow.from);
    const toRegion = regionByElement.get(arrow.to);
    if (!fromRegion || !toRegion) return [];
    return [
      {
        id: uniqueSlug(slug(arrow.label || `${arrow.interaction}-${index + 1}`, `interaction-${index + 1}`), usedIds),
        sourceArrowId: arrow.id,
        kind: arrow.interaction,
        fromRegion,
        toRegion,
        fromState: null,
        toState: INTERACTION_STATE[arrow.interaction],
        description: arrow.label || arrow.interaction.replaceAll('-', ' '),
        auditionable: true,
      },
    ];
  });

  const spec = ScreenSpec.parse({
    version: 1,
    id: `spec-${slug(canvas.id, 'canvas')}`,
    canvasId: canvas.id,
    name: canvas.title || 'Untitled wireframe',
    intent: noteText || `Turn ${canvas.title || 'this wireframe'} into a responsive local frontend prototype.`,
    audience: noteText ? 'Audience inferred from the canvas notes.' : '',
    regions,
    interactions,
    states,
    fixtures: regions.flatMap((region) => {
      const fixture = fixtureFor(region);
      return fixture ? [fixture] : [];
    }),
    ambiguities: [],
    accessibility: {
      minBodyContrast: 4.5,
      minLargeTextContrast: 3,
      minTouchTargetPx: 44,
      requiresVisibleFocus: true,
      requiresKeyboardPath: true,
      requiresReducedMotionFallback: true,
      landmarks: regions.some((region) => region.region === 'header') ? ['banner', 'navigation', 'main'] : ['main'],
    },
    responsive: {
      narrowBreakpointPx: 640,
      wideBreakpointPx: 1280,
      stacksBelowNarrow: regions
        .filter((region) => ['primary', 'secondary', 'aside'].includes(region.region))
        .map((region) => region.id),
      collapsesBelowNarrow: regions.filter((region) => region.region === 'sidebar').map((region) => region.id),
    },
    createdAt: canvas.updatedAt,
  });

  const issues = findSpecIntegrityIssues(spec);
  if (issues.length > 0) throw new Error(`Deterministic Screen Spec failed integrity checks: ${issues.join(' ')}`);
  return spec;
}

export function hashSpec(spec: ScreenSpec): string {
  return createHash('sha256').update(canonicalJson(spec)).digest('hex');
}

function intentTagsFor(role: SemanticRole): Parameters<typeof matchLocally>[0]['intentTags'] {
  switch (role) {
    case 'app-bar':
    case 'nav-primary':
    case 'nav-secondary':
      return ['app-frame', 'dashboard-shell'];
    case 'dialog':
      return ['modal'];
    case 'tab-strip':
      return ['tabbed-view'];
    case 'filter-control':
    case 'search-control':
      return ['filter-control'];
    case 'data-table':
      return ['data-table'];
    case 'empty-state':
      return ['empty-state'];
    case 'skeleton':
      return ['loading-state'];
    case 'metric-tile':
      return ['metric-tiles'];
    case 'media-card':
      return ['media-gallery'];
    case 'insight-card':
      return ['ai-recommendation'];
    default:
      return ['dashboard-shell'];
  }
}

export function buildCandidates(spec: ScreenSpec): RegionCandidates[] {
  return spec.regions.map((region) => {
    const matchingRecords = REGISTRY_RECORDS.filter((record) => record.roles.includes(region.role));
    const rejected = matchingRecords.flatMap((record) => {
      const verdict = assessRecord(record);
      return verdict.allowed ? [] : [{ recordId: record.id, reason: verdict.reason ?? 'Rejected by registry policy.' }];
    });
    const matches = matchLocally({
      role: region.role,
      intentTags: intentTagsFor(region.role),
      wantsMotion: ['hero-statement', 'insight-card', 'media-card'].includes(region.role),
      limit: 5,
    });
    return { regionId: region.id, matches, rejected };
  });
}

type DirectionStyle = Omit<VariantManifestType, 'version' | 'id' | 'selections' | 'lineage' | 'createdAt'>;

const DIRECTIONS: readonly DirectionStyle[] = [
  {
    name: 'Calm Trust',
    genome: 'Porcelain palette · soft controls · calm motion',
    rationale: 'Prioritises steady hierarchy, readable density, and restrained feedback.',
    palette: {
      name: 'Porcelain',
      background: '#f5f7f8',
      surface: '#ffffff',
      surfaceRaised: '#eef2f3',
      border: '#cbd5d8',
      textPrimary: '#172126',
      textSecondary: '#54636a',
      accent: '#176b63',
      accentContrast: '#ffffff',
      positive: '#267a4a',
      critical: '#b33a3a',
      scheme: 'light',
    },
    typography: {
      displayFamily: 'Inter, system-ui, sans-serif',
      bodyFamily: 'Inter, system-ui, sans-serif',
      monoFamily: 'ui-monospace, monospace',
      scaleRatio: 1.2,
      baseSizePx: 16,
      displayWeight: 650,
      bodyWeight: 400,
      displayTrackingEm: 0,
      bodyLeading: 1.55,
    },
    form: {
      spaceUnitPx: 4,
      density: 'regular',
      radiusOuterPx: 8,
      radiusStepPx: 2,
      borderWidthPx: 1,
      elevation: 'hairline',
    },
    controls: {
      buttonShape: 'soft',
      buttonFill: 'solid',
      inputStyle: 'outlined',
      iconWeight: 'regular',
      iconSizePx: 18,
      focusRing: 'ring',
    },
    motion: MOTION_PRESETS.calm,
  },
  {
    name: 'Playful Momentum',
    genome: 'Citrus palette · pill controls · playful motion',
    rationale: 'Makes state changes energetic and obvious while preserving the shared interaction contract.',
    palette: {
      name: 'Citrus',
      background: '#fff8ed',
      surface: '#ffffff',
      surfaceRaised: '#fff0d6',
      border: '#e2c795',
      textPrimary: '#241b12',
      textSecondary: '#6d5842',
      accent: '#d85622',
      accentContrast: '#ffffff',
      positive: '#287a4b',
      critical: '#b83248',
      scheme: 'light',
    },
    typography: {
      displayFamily: 'Arial Rounded MT Bold, Inter, system-ui, sans-serif',
      bodyFamily: 'Inter, system-ui, sans-serif',
      monoFamily: 'ui-monospace, monospace',
      scaleRatio: 1.28,
      baseSizePx: 16,
      displayWeight: 700,
      bodyWeight: 450,
      displayTrackingEm: 0,
      bodyLeading: 1.5,
    },
    form: {
      spaceUnitPx: 5,
      density: 'roomy',
      radiusOuterPx: 16,
      radiusStepPx: 4,
      borderWidthPx: 1.5,
      elevation: 'raised',
    },
    controls: {
      buttonShape: 'pill',
      buttonFill: 'tonal',
      inputStyle: 'filled',
      iconWeight: 'bold',
      iconSizePx: 20,
      focusRing: 'outline',
    },
    motion: MOTION_PRESETS.playful,
  },
  {
    name: 'Editorial Precision',
    genome: 'Ink palette · sharp controls · editorial motion',
    rationale: 'Uses compact rhythm and decisive contrast for fast scanning and comparison.',
    palette: {
      name: 'Ink',
      background: '#111214',
      surface: '#1a1c1f',
      surfaceRaised: '#23262a',
      border: '#3a3e44',
      textPrimary: '#f4f1ea',
      textSecondary: '#aaa69d',
      accent: '#d7b95b',
      accentContrast: '#111214',
      positive: '#66a878',
      critical: '#d06f67',
      scheme: 'dark',
    },
    typography: {
      displayFamily: 'Georgia, Times New Roman, serif',
      bodyFamily: 'Inter, system-ui, sans-serif',
      monoFamily: 'ui-monospace, monospace',
      scaleRatio: 1.32,
      baseSizePx: 15,
      displayWeight: 600,
      bodyWeight: 400,
      displayTrackingEm: 0,
      bodyLeading: 1.45,
    },
    form: {
      spaceUnitPx: 3,
      density: 'compact',
      radiusOuterPx: 2,
      radiusStepPx: 1,
      borderWidthPx: 1,
      elevation: 'flat',
    },
    controls: {
      buttonShape: 'sharp',
      buttonFill: 'outline',
      inputStyle: 'underlined',
      iconWeight: 'light',
      iconSizePx: 16,
      focusRing: 'outline',
    },
    motion: MOTION_PRESETS.editorial,
  },
];

function neutralRecord(role: SemanticRole) {
  return (
    getRegistryRecord(role === 'metric-tile' || role === 'insight-card' || role === 'media-card' ? 'canvascraft-neutral-card-grid' : 'canvascraft-neutral-shell') ??
    REGISTRY_MANIFEST.records[0]!
  );
}

export function buildDirections(args: {
  runId: string;
  spec: ScreenSpec;
  specHash: string;
  candidates: RegionCandidates[];
  createdAt: string;
}): VariantManifest[] {
  return DIRECTIONS.map((direction, directionIndex) => {
    const manifest = {
      version: 1 as const,
      id: `${args.runId}-direction-${directionIndex + 1}`,
      ...direction,
      selections: args.spec.regions.map((region) => {
        const candidateSet = args.candidates.find((entry) => entry.regionId === region.id);
        const match = candidateSet?.matches[directionIndex % Math.max(candidateSet.matches.length, 1)];
        const record = (match && getRegistryRecord(match.recordId)) || neutralRecord(region.role);
        const verdict = assessRecord(record);
        if (!verdict.allowed) throw new Error(`Registry gate rejected selected pattern ${record.id}: ${verdict.reason}`);
        return {
          regionId: region.id,
          recordId: record.id,
          source: record.source,
          sourceUrl: record.sourceUrl,
          license: record.license,
          licenseNotice: record.licenseNotice,
          matchScore: match?.score ?? 0.35,
          matchSource: 'local' as const,
          whyItFits: match?.rationale ?? 'CanvasCraft neutral fallback preserves the shared region contract.',
          fallbackReason: match ? null : 'No role-compatible registry candidate was available.',
        };
      }),
      lineage: {
        specId: args.spec.id,
        specHash: args.specHash,
        parentBranchIds: [],
        traitOrigins: {
          palette: null,
          typography: null,
          form: null,
          controls: null,
          motion: null,
          selections: null,
        },
        registryVersion: REGISTRY_MANIFEST.version,
      },
      createdAt: args.createdAt,
    };
    return VariantManifest.parse(manifest);
  });
}

export function directionSelectionOptions(args: {
  spec: ScreenSpec;
  candidates: RegionCandidates[];
}): Array<{ regionId: string; recordIds: string[] }> {
  return args.spec.regions.map((region) => {
    const candidates = args.candidates.find((entry) => entry.regionId === region.id)?.matches ?? [];
    const neutral = neutralRecord(region.role);
    return {
      regionId: region.id,
      recordIds: [...new Set([...candidates.map((candidate) => candidate.recordId), neutral.id])],
    };
  });
}

export function buildDirectionsFromAi(args: {
  runId: string;
  spec: ScreenSpec;
  specHash: string;
  candidates: RegionCandidates[];
  directionSet: AiDirectionSet;
  createdAt: string;
}): VariantManifest[] {
  const names = new Set<string>();
  const styleSignatures = new Set<string>();

  return args.directionSet.variants.map((direction, directionIndex) => {
    const nameKey = direction.name.trim().toLowerCase();
    if (!nameKey || names.has(nameKey)) {
      throw new Error('AI directions must use three distinct non-empty names.');
    }
    names.add(nameKey);

    const selectionsByRegion = new Map(direction.selections.map((selection) => [selection.regionId, selection]));
    if (
      direction.selections.length !== args.spec.regions.length ||
      selectionsByRegion.size !== direction.selections.length ||
      selectionsByRegion.size !== args.spec.regions.length
    ) {
      throw new Error(`AI direction "${direction.name}" must select one pattern for every Screen Spec region.`);
    }
    const styleSignature = canonicalJson({
      palette: direction.palette,
      typography: direction.typography,
      form: direction.form,
      controls: direction.controls,
      motionPreset: direction.motionPreset,
      selections: [...direction.selections]
        .map((selection) => ({ regionId: selection.regionId, recordId: selection.recordId }))
        .sort((left, right) => left.regionId.localeCompare(right.regionId)),
    });
    if (styleSignatures.has(styleSignature)) {
      throw new Error('AI directions must be materially distinct, not merely differently named.');
    }
    styleSignatures.add(styleSignature);

    const selections = args.spec.regions.map((region) => {
      const selection = selectionsByRegion.get(region.id);
      if (!selection) {
        throw new Error(`AI direction "${direction.name}" omitted region "${region.id}".`);
      }

      const regionCandidates = args.candidates.find((entry) => entry.regionId === region.id)?.matches ?? [];
      const match = regionCandidates.find((candidate) => candidate.recordId === selection.recordId);
      const neutral = neutralRecord(region.role);
      const record =
        match
          ? getRegistryRecord(match.recordId)
          : selection.recordId === neutral.id
            ? neutral
            : null;
      if (!record) {
        throw new Error(
          `AI direction "${direction.name}" selected "${selection.recordId}" for "${region.id}", which is not gate-approved for that region.`,
        );
      }

      const verdict = assessRecord(record);
      if (!verdict.allowed) {
        throw new Error(`Registry gate rejected AI selection "${record.id}": ${verdict.reason ?? 'unknown reason'}`);
      }

      return {
        regionId: region.id,
        recordId: record.id,
        source: record.source,
        sourceUrl: record.sourceUrl,
        license: record.license,
        licenseNotice: record.licenseNotice,
        matchScore: match?.score ?? 0.35,
        matchSource: match?.matchSource ?? 'local',
        whyItFits: selection.whyItFits,
        fallbackReason: match ? null : 'No role-compatible registry candidate was available.',
      };
    });

    return VariantManifest.parse({
      version: 1,
      id: `${args.runId}-direction-${directionIndex + 1}`,
      name: direction.name,
      genome: direction.genome,
      rationale: direction.rationale,
      palette: direction.palette,
      typography: direction.typography,
      form: direction.form,
      controls: direction.controls,
      motion: MOTION_PRESETS[direction.motionPreset],
      selections,
      lineage: {
        specId: args.spec.id,
        specHash: args.specHash,
        parentBranchIds: [],
        traitOrigins: {
          palette: null,
          typography: null,
          form: null,
          controls: null,
          motion: null,
          selections: null,
        },
        registryVersion: REGISTRY_MANIFEST.version,
      },
      createdAt: args.createdAt,
    });
  });
}
