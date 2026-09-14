import { createHash } from 'node:crypto';

import {
  type AiDirectionSet,
  type AiVariantDraft,
  type BackdropTreatment,
  BODY_CONTENT_ROLES,
  MOTION_PRESETS,
  type MotionLanguage,
  type MotionTraits,
  type PageArchetype,
  type PaletteTraits,
  ScreenSpec,
  type SurfaceTreatment,
  canonicalJson,
  findSpecIntegrityIssues,
  type CanvasDesignPreferences,
  type CanvasDoc,
  type CanvasElement,
  type InteractionKind,
  type LayoutRegion,
  type RegionCandidates,
  type RegistryRecord,
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
          // Reading order is what the user drew: top to bottom, then left to
          // right. `z` is a paint-order hint for overlapping stamps, not a
          // layout position, so it only breaks ties between coincident bounds.
          .sort(
            (left, right) =>
              left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x || left.z - right.z,
          )
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

type IntentTags = NonNullable<Parameters<typeof matchLocally>[0]['intentTags']>;

/**
 * Which compositions an archetype prefers, on top of the role's own tags.
 *
 * Role says *what a region is*; the archetype says *what it should be made of*.
 * Both are needed — a hero region on a dashboard and a hero region on a landing
 * page are the same role and should not resolve to the same pattern, which is
 * why the matcher used to hand every archetype the identical candidate list.
 */
const ARCHETYPE_INTENT: Record<PageArchetype, Partial<Record<SemanticRole, IntentTags>>> = {
  marketing: {
    'hero-statement': ['hero-section', 'marketing-hero'],
    'page-title': ['hero-section', 'marketing-hero'],
    'media-card': ['logo-marquee', 'media-gallery'],
    'insight-card': ['aurora-background', 'glass-panel'],
    'neutral-block': ['aurora-background', 'glass-panel'],
  },
  application: {
    'metric-tile': ['bento-grid', 'metric-tiles'],
    'insight-card': ['bento-grid', 'ai-recommendation'],
    'data-table': ['data-table', 'filter-control'],
    'app-bar': ['app-frame', 'dashboard-shell'],
  },
  portfolio: {
    'hero-statement': ['hero-section', 'marketing-hero'],
    'media-card': ['media-gallery', 'card-stack'],
    'insight-card': ['card-stack', 'media-gallery'],
    'neutral-block': ['logo-marquee', 'media-gallery'],
  },
  'ai-native': {
    'insight-card': ['streaming-output', 'ai-recommendation'],
    'neutral-block': ['aurora-background', 'glass-panel'],
    skeleton: ['streaming-output', 'ai-thinking'],
    'list-row': ['ai-task-list', 'timeline'],
  },
};

function roleIntentTags(role: SemanticRole): IntentTags {
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

/**
 * Archetype tags lead, because they are the more specific signal, and the role
 * tags follow so a region still resolves when the archetype has no opinion
 * about it. Duplicates are dropped rather than double-counted: the matcher
 * scores on tag overlap, and counting one tag twice would silently outrank a
 * genuinely better two-tag match.
 */
function intentTagsFor(role: SemanticRole, archetype: PageArchetype): IntentTags {
  return [...new Set([...(ARCHETYPE_INTENT[archetype][role] ?? []), ...roleIntentTags(role)])];
}

/**
 * Whether a role-compatible, gate-approved record is nonetheless the wrong
 * choice for this region's *context* (archetype + role).
 *
 * This is a selection-time guard, not a licence decision: the record stays a
 * valid component and the reason is recorded in `rejected` so it surfaces as a
 * `gate-decision` event and in provenance, rather than the matcher ranking it
 * and the renderer overflowing it. Returns the reason string, or null to allow.
 */
function contextMismatchReason(
  record: RegistryRecord,
  role: SemanticRole,
  archetype: PageArchetype,
): string | null {
  const expressive = record.motionIntensity === 'expressive';
  if (expressive && BODY_CONTENT_ROLES.has(role)) {
    return `"${record.name}" is an expressive-motion pattern; a "${role}" region is scanned content and needs a still treatment.`;
  }
  if (expressive && archetype === 'application' && role !== 'hero-statement') {
    return `An application surface carries expressive motion only in its hero; "${record.name}" would animate a "${role}" region.`;
  }
  if (record.mobileRisk === 'high' && record.fallbackId === null) {
    return `"${record.name}" is high mobile risk with no declared narrow-width fallback.`;
  }
  return null;
}

export function buildCandidates(
  spec: ScreenSpec,
  archetype: PageArchetype = 'application',
): RegionCandidates[] {
  return spec.regions.map((region) => {
    const matchingRecords = REGISTRY_RECORDS.filter((record) => record.roles.includes(region.role));
    const rejected = matchingRecords.flatMap((record) => {
      const verdict = assessRecord(record);
      if (!verdict.allowed) {
        return [{ recordId: record.id, reason: verdict.reason ?? 'Rejected by registry policy.' }];
      }
      const contextReason = contextMismatchReason(record, region.role, archetype);
      return contextReason ? [{ recordId: record.id, reason: contextReason }] : [];
    });
    const excluded = new Set(rejected.map((entry) => entry.recordId));
    const matches = matchLocally({
      role: region.role,
      intentTags: intentTagsFor(region.role, archetype),
      // A marketing or portfolio page wants movement in more places than a tool
      // does; a dashboard wants it in almost none.
      wantsMotion:
        archetype === 'application'
          ? region.role === 'hero-statement'
          : ['hero-statement', 'page-title', 'insight-card', 'media-card', 'neutral-block'].includes(region.role),
      limit: 5,
      // `matchLocally` already drops gate-rejected records; this also drops the
      // context-rejected ones, which are gate-approved and would otherwise rank.
    }).filter((match) => !excluded.has(match.recordId));
    return { regionId: region.id, matches, rejected };
  });
}

type DirectionStyle = Omit<VariantManifestType, 'version' | 'id' | 'selections' | 'lineage' | 'createdAt'>;

/**
 * A direction's motion personality, expressed as a *bend* of whatever preset the
 * toolbar locked rather than as absolute timings.
 *
 * The old code replaced each direction's motion wholesale with the toolbar
 * preset, so all three branches shipped the same duration, stagger, and travel
 * and the Motion Audition compared nothing. Storing the bend instead means the
 * user still steers the run's tempo while the three directions keep genuinely
 * different movement — which is the only reason to render three of them.
 */
interface MotionSignature {
  language: MotionLanguage;
  durationScale: number;
  staggerScale: number;
  travelScale: number;
  /** Overrides the preset's curve when the language demands a different one. */
  easing: string | null;
}

/** How hard an AI-proposed direction leans on its language. */
const MOTION_EMPHASIS: Record<
  AiVariantDraft['motionEmphasis'],
  Pick<MotionSignature, 'durationScale' | 'staggerScale' | 'travelScale'>
> = {
  restrained: { durationScale: 0.72, staggerScale: 0.55, travelScale: 0.5 },
  balanced: { durationScale: 1, staggerScale: 1, travelScale: 1 },
  amplified: { durationScale: 1.2, staggerScale: 1.5, travelScale: 1.35 },
};

/** The curve each language wants when the preset does not supply a better one. */
const LANGUAGE_EASING: Record<MotionLanguage, string> = {
  reveal: 'cubic-bezier(0.16, 1, 0.3, 1)',
  cascade: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  parallax: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  cut: 'cubic-bezier(0.2, 0, 0, 1)',
};

const DISPLAY_FONT_STACKS: Record<CanvasDesignPreferences['displayFont'], string> = {
  grotesk: '"Bricolage Grotesque Variable", "Avenir Next", Inter, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: '"Arial Rounded MT Bold", "Trebuchet MS", ui-rounded, system-ui, sans-serif',
  mono: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
};

const BODY_FONT_STACKS: Record<CanvasDesignPreferences['bodyFont'], string> = {
  clean: '"Geist Variable", Inter, system-ui, sans-serif',
  humanist: '"Segoe UI", "Avenir Next", Candara, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
};

const MOTION_INTENSITY: Record<
  CanvasDesignPreferences['motionIntensity'],
  { duration: number; stagger: number; travel: number; reducedMotion?: 'fade-only' | 'instant' }
> = {
  none: { duration: 0.4, stagger: 0, travel: 0, reducedMotion: 'instant' },
  subtle: { duration: 0.72, stagger: 0.55, travel: 0.45 },
  moderate: { duration: 1, stagger: 1, travel: 1 },
  expressive: { duration: 1.28, stagger: 1.35, travel: 1.3 },
};

/**
 * What the locked toolbar axes add to a direction's genome.
 *
 * Named and exported so the length budget can be measured at its source: this
 * suffix is the whole reason `GENOME_MAX_LENGTH` must exceed
 * `AI_GENOME_MAX_LENGTH`, and when the two were equal every AI-authored
 * direction failed manifest validation and fell back to the deterministic set.
 */
export function lockedAxisGenomeSuffix(preferences: CanvasDesignPreferences): string {
  return ` · ${preferences.archetype} page · ${preferences.buttonShape} buttons · ${preferences.motionPreset} ${preferences.motionIntensity} motion`;
}

/**
 * Applies the canvas design controls on top of a direction.
 *
 * Four axes are genuinely locked — archetype, display font, body font, and
 * button shape — because they are identity decisions the user made once and
 * expects to see honoured in all three previews. The fifth, motion, is
 * deliberately *not* locked any more: the toolbar sets the run's tempo
 * (`preset`) and how much of it to spend (`motionIntensity`), and each
 * direction's own {@link MotionSignature} bends that tempo into its own
 * mechanism. Overwriting motion outright was what made the three directions
 * ship identical `260ms / 0.25 travel / 40ms stagger` and turned Motion
 * Audition into a comparison of three copies of one thing.
 *
 * `preset` itself stays uniform, so "calm" still means the same tempo in every
 * branch and the audition compares mechanism rather than luck.
 */
function applyDesignPreferences(
  direction: DirectionStyle,
  signature: MotionSignature,
  preferences: CanvasDesignPreferences,
): DirectionStyle {
  const intensity = MOTION_INTENSITY[preferences.motionIntensity];
  const base = MOTION_PRESETS[preferences.motionPreset];

  // `none` intensity means the user asked for stillness; honouring the
  // direction's travel there would ignore an explicit accessibility-shaped
  // request, so the scale collapses to zero rather than merely shrinking.
  const motion: MotionTraits = {
    preset: base.preset,
    language: intensity.travel === 0 ? 'cut' : signature.language,
    easing: signature.easing ?? LANGUAGE_EASING[signature.language] ?? base.easing,
    durationMs: clampInt(base.durationMs * intensity.duration * signature.durationScale, 80, 900),
    staggerMs: clampInt(base.staggerMs * intensity.stagger * signature.staggerScale, 0, 240),
    travel: clamp(base.travel * intensity.travel * signature.travelScale, 0, 1),
    reducedMotion: intensity.reducedMotion ?? base.reducedMotion,
  };

  return {
    ...direction,
    archetype: preferences.archetype,
    genome: `${direction.genome}${lockedAxisGenomeSuffix(preferences)}`,
    typography: {
      ...direction.typography,
      displayFamily: DISPLAY_FONT_STACKS[preferences.displayFont],
      bodyFamily: BODY_FONT_STACKS[preferences.bodyFont],
    },
    controls: {
      ...direction.controls,
      buttonShape: preferences.buttonShape,
    },
    motion,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function clampInt(value: number, low: number, high: number): number {
  return Math.round(clamp(value, low, high));
}

/**
 * The three comparison slots.
 *
 * Held constant across archetypes on purpose: a user who switches from
 * `application` to `marketing` should still be comparing "the composed one",
 * "the energetic one", and "the severe one" — the vocabulary changes, the
 * question being asked does not.
 */
type DirectionSlot = 0 | 1 | 2;

interface DirectionPersonality {
  name: string;
  /** Genome fragment. The archetype's palette name and the locked axes are appended. */
  argument: string;
  rationale: string;
  typography: Pick<
    VariantManifestType['typography'],
    'scaleRatio' | 'baseSizePx' | 'displayWeight' | 'bodyWeight' | 'displayTrackingEm' | 'bodyLeading'
  >;
  form: Pick<
    VariantManifestType['form'],
    'spaceUnitPx' | 'density' | 'radiusOuterPx' | 'radiusStepPx' | 'borderWidthPx' | 'elevation'
  >;
  controls: VariantManifestType['controls'];
  motion: MotionSignature;
}

const DIRECTION_PERSONALITIES: readonly [DirectionPersonality, DirectionPersonality, DirectionPersonality] = [
  {
    name: 'Composed Depth',
    argument: 'layered surfaces · generous rhythm · sections that resolve as you reach them',
    rationale:
      'Argues that confidence comes from space and depth: large type, real elevation, and one thing arriving at a time.',
    typography: {
      scaleRatio: 1.28,
      baseSizePx: 16,
      displayWeight: 680,
      bodyWeight: 400,
      displayTrackingEm: -0.02,
      bodyLeading: 1.62,
    },
    form: {
      spaceUnitPx: 5,
      density: 'roomy',
      radiusOuterPx: 18,
      radiusStepPx: 4,
      borderWidthPx: 1,
      elevation: 'raised',
    },
    controls: {
      buttonShape: 'soft',
      buttonFill: 'solid',
      inputStyle: 'outlined',
      iconWeight: 'regular',
      iconSizePx: 18,
      focusRing: 'ring',
    },
    motion: { language: 'reveal', durationScale: 0.8, staggerScale: 0.85, travelScale: 0.9, easing: null },
  },
  {
    name: 'Kinetic Signal',
    argument: 'saturated accent · springy controls · groups that arrive in sequence',
    rationale:
      'Argues that a product should feel alive: every change overshoots slightly, and collections announce themselves as collections.',
    typography: {
      scaleRatio: 1.34,
      baseSizePx: 16,
      displayWeight: 780,
      bodyWeight: 450,
      displayTrackingEm: -0.03,
      bodyLeading: 1.55,
    },
    form: {
      spaceUnitPx: 4,
      density: 'regular',
      radiusOuterPx: 24,
      radiusStepPx: 6,
      borderWidthPx: 1,
      elevation: 'lifted',
    },
    controls: {
      buttonShape: 'pill',
      buttonFill: 'solid',
      inputStyle: 'filled',
      iconWeight: 'bold',
      iconSizePx: 20,
      focusRing: 'underglow',
    },
    motion: { language: 'spring', durationScale: 1.15, staggerScale: 1.6, travelScale: 1.3, easing: null },
  },
  {
    name: 'Editorial Precision',
    argument: 'high-contrast type · flat planes · movement that never delays a read',
    rationale:
      'Argues that density is a feature: sharp corners, tight rhythm, and changes that land instantly rather than animating.',
    typography: {
      scaleRatio: 1.42,
      baseSizePx: 15,
      displayWeight: 620,
      bodyWeight: 400,
      displayTrackingEm: -0.035,
      bodyLeading: 1.5,
    },
    form: {
      // Compact density multiplies the base unit by 0.75 for gaps but only
      // doubles it for control padding, so a 6px base is what keeps an
      // icon-only control on the 44px touch floor while the layout still reads
      // as dense. A 4px base here rendered 35px controls.
      spaceUnitPx: 6,
      density: 'compact',
      radiusOuterPx: 3,
      radiusStepPx: 1,
      borderWidthPx: 1,
      elevation: 'hairline',
    },
    controls: {
      buttonShape: 'sharp',
      buttonFill: 'outline',
      inputStyle: 'underlined',
      iconWeight: 'light',
      iconSizePx: 18,
      focusRing: 'outline',
    },
    motion: { language: 'cut', durationScale: 0.7, staggerScale: 0.45, travelScale: 0.35, easing: null },
  },
];

/**
 * The vocabulary one archetype makes available.
 *
 * Three palettes — one per comparison slot — plus the surface and backdrop
 * treatments that make the archetype recognisable. The palettes are hand-tuned
 * to clear the run's WCAG floors before the Design Director ever runs; the
 * compiler test measures them rather than trusting that claim.
 */
interface ArchetypeRecipe {
  palettes: readonly [PaletteTraits, PaletteTraits, PaletteTraits];
  surfaces: readonly [SurfaceTreatment, SurfaceTreatment, SurfaceTreatment];
  /**
   * Overrides a slot's default motion language where the archetype has a
   * stronger opinion than the personality does — a portfolio's composed slot
   * parallaxes rather than reveals, because that is what large media wants.
   */
  languages: readonly [MotionLanguage | null, MotionLanguage | null, MotionLanguage | null];
}

function palette(
  name: string,
  scheme: 'light' | 'dark',
  backdrop: BackdropTreatment,
  colors: Omit<PaletteTraits, 'name' | 'scheme' | 'backdrop'>,
): PaletteTraits {
  return { name, scheme, backdrop, ...colors };
}

const ARCHETYPE_RECIPES: Record<PageArchetype, ArchetypeRecipe> = {
  /* A landing page argues for something. Big ground, big type, big claims. */
  marketing: {
    palettes: [
      palette('Nightfall', 'dark', 'aurora', {
        background: '#07080f',
        surface: '#101324',
        surfaceRaised: '#171b31',
        border: '#2c3355',
        textPrimary: '#f3f5ff',
        textSecondary: '#a9b2d4',
        accent: '#8ea2ff',
        accentContrast: '#06080f',
        positive: '#5fd39a',
        critical: '#ff8b8b',
      }),
      palette('Solar', 'light', 'wash', {
        background: '#fff8f2',
        surface: '#ffffff',
        surfaceRaised: '#fff0e3',
        border: '#f0d3ba',
        textPrimary: '#1d1409',
        textSecondary: '#5d4a37',
        accent: '#c1400c',
        accentContrast: '#ffffff',
        positive: '#1f6b45',
        critical: '#a52f2f',
      }),
      palette('Newsprint', 'light', 'grain', {
        background: '#f4f2ec',
        surface: '#fbfaf6',
        surfaceRaised: '#eceae2',
        // This slot renders under a hairline elevation, so the border is the
        // only edge a component has. WCAG 1.4.11 puts the floor at 3:1 against
        // the surface; a warm grey rule clears it without losing the restraint.
        border: '#8d8878',
        textPrimary: '#15140f',
        textSecondary: '#55524a',
        accent: '#1a1a1a',
        accentContrast: '#f7f6f2',
        positive: '#2c6144',
        critical: '#9a2f28',
      }),
    ],
    surfaces: ['glass', 'gradient', 'outline'],
    languages: [null, null, null],
  },

  /* A tool is used for hours. Depth without noise; nothing cycles on its own. */
  application: {
    palettes: [
      palette('Slate Studio', 'dark', 'spotlight', {
        background: '#0b0d12',
        surface: '#13161d',
        surfaceRaised: '#1a1e28',
        border: '#2b313f',
        textPrimary: '#e9edf6',
        textSecondary: '#9aa4b8',
        accent: '#7fb2ff',
        accentContrast: '#05070c',
        positive: '#5cc79a',
        critical: '#ff8f85',
      }),
      palette('Aqueous', 'light', 'wash', {
        background: '#f3f7fb',
        surface: '#ffffff',
        surfaceRaised: '#e9f0f8',
        border: '#c6d5e5',
        textPrimary: '#0f1a24',
        textSecondary: '#4c5c6c',
        accent: '#0a5ec2',
        accentContrast: '#ffffff',
        positive: '#136e4c',
        critical: '#b02a37',
      }),
      palette('Graphite', 'light', 'flat', {
        background: '#f6f6f5',
        surface: '#ffffff',
        surfaceRaised: '#ededec',
        // Hairline elevation on this slot: the border carries the component
        // edge alone, so it holds the 3:1 WCAG 1.4.11 floor against the surface.
        border: '#898987',
        textPrimary: '#121312',
        textSecondary: '#4f514f',
        accent: '#1f4d3f',
        accentContrast: '#ffffff',
        positive: '#265f45',
        critical: '#9e2b25',
      }),
    ],
    surfaces: ['glass', 'gradient', 'solid'],
    languages: [null, null, null],
  },

  /* Work is the subject. The chrome gets out of the way of the media. */
  portfolio: {
    palettes: [
      palette('Bone', 'light', 'grain', {
        background: '#f2efe9',
        surface: '#faf8f4',
        surfaceRaised: '#e9e5dc',
        border: '#c6c0b3',
        textPrimary: '#141310',
        textSecondary: '#524e46',
        accent: '#3c3227',
        accentContrast: '#f7f4ee',
        positive: '#2f6146',
        critical: '#96302a',
      }),
      palette('Cinnabar', 'dark', 'spotlight', {
        background: '#0d0a0a',
        surface: '#171212',
        surfaceRaised: '#211919',
        border: '#3b2d2d',
        textPrimary: '#f7f1ee',
        textSecondary: '#b2a29c',
        accent: '#ff7a4d',
        accentContrast: '#160b06',
        positive: '#68c799',
        critical: '#ff8f85',
      }),
      palette('Blueprint', 'dark', 'flat', {
        background: '#0a1017',
        surface: '#111a24',
        surfaceRaised: '#17222f',
        // Hairline elevation on this slot: the border is the component's only
        // edge, so it is lifted to the 3:1 WCAG 1.4.11 floor against the surface.
        border: '#556d84',
        textPrimary: '#eaf1f7',
        textSecondary: '#9dadbc',
        accent: '#8fd8ff',
        accentContrast: '#04090f',
        positive: '#5fc9a3',
        critical: '#ff9089',
      }),
    ],
    surfaces: ['solid', 'glass', 'outline'],
    // Large media wants depth against the scroll, so the composed slot trades
    // its reveal for parallax. The other two keep their own mechanism: three
    // directions sharing a language would not be three directions.
    languages: ['parallax', null, null],
  },

  /* The product thinks out loud. Aurora ground, glass panels, streaming type. */
  'ai-native': {
    palettes: [
      palette('Nebula', 'dark', 'aurora', {
        background: '#08070f',
        surface: '#111024',
        surfaceRaised: '#191833',
        border: '#312f57',
        textPrimary: '#f2f0ff',
        textSecondary: '#aaa5cf',
        accent: '#b79bff',
        accentContrast: '#080614',
        positive: '#5fd0a8',
        critical: '#ff8ea1',
      }),
      palette('Iridescent', 'light', 'aurora', {
        background: '#f7f5ff',
        surface: '#ffffff',
        surfaceRaised: '#efecff',
        border: '#cfc9ee',
        textPrimary: '#140f24',
        textSecondary: '#4e4770',
        accent: '#5b2fc9',
        accentContrast: '#ffffff',
        positive: '#166b52',
        critical: '#ab2b46',
      }),
      palette('Terminal', 'dark', 'flat', {
        background: '#080a09',
        surface: '#101413',
        surfaceRaised: '#161c1a',
        // Hairline elevation on this slot: the border alone defines the
        // component edge, so it clears 3:1 (WCAG 1.4.11) against the surface.
        border: '#5d7068',
        textPrimary: '#e8f2ed',
        textSecondary: '#98a8a1',
        accent: '#6ee7a8',
        accentContrast: '#04100a',
        positive: '#6ee7a8',
        critical: '#ff8f85',
      }),
    ],
    surfaces: ['glass', 'glass', 'outline'],
    languages: [null, 'cascade', null],
  },
};

/**
 * The deterministic direction for one archetype and one comparison slot.
 *
 * Exported because both the local path and the AI path's fallback need it, and
 * because the compiler test measures its palettes against the run's own
 * accessibility floors rather than trusting the hand-tuning above.
 */
export function directionFor(archetype: PageArchetype, slot: DirectionSlot): {
  style: DirectionStyle;
  signature: MotionSignature;
} {
  const recipe = ARCHETYPE_RECIPES[archetype];
  const personality = DIRECTION_PERSONALITIES[slot];
  const chosenPalette = recipe.palettes[slot];
  const signature: MotionSignature = {
    ...personality.motion,
    language: recipe.languages[slot] ?? personality.motion.language,
  };

  return {
    signature,
    style: {
      name: personality.name,
      // Archetype and locked axes are appended by applyDesignPreferences, so
      // this half stays the part that genuinely differs between directions.
      genome: `${chosenPalette.name} · ${personality.argument}`,
      rationale: personality.rationale,
      // Overwritten by applyDesignPreferences; present so the type is complete.
      archetype,
      palette: chosenPalette,
      typography: {
        ...personality.typography,
        displayFamily: DISPLAY_FONT_STACKS.grotesk,
        bodyFamily: BODY_FONT_STACKS.clean,
        monoFamily: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
      },
      form: { ...personality.form, surface: recipe.surfaces[slot] },
      controls: personality.controls,
      motion: MOTION_PRESETS.calm,
    },
  };
}

const DIRECTION_SLOTS: readonly DirectionSlot[] = [0, 1, 2];

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
  designPreferences: CanvasDesignPreferences;
  createdAt: string;
}): VariantManifest[] {
  return DIRECTION_SLOTS.map((slot) => {
    const directionIndex = slot;
    const { style: base, signature } = directionFor(args.designPreferences.archetype, slot);
    const style = applyDesignPreferences(base, signature, args.designPreferences);
    const manifest = {
      version: 1 as const,
      id: `${args.runId}-direction-${directionIndex + 1}`,
      ...style,
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
  designPreferences: CanvasDesignPreferences;
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
      // The preset is locked by the toolbar, so two directions naming the same
      // one are not therefore the same. Language and emphasis are what survive
      // `applyDesignPreferences`, so they are what distinctness turns on.
      motionLanguage: direction.motionLanguage,
      motionEmphasis: direction.motionEmphasis,
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

    const style = applyDesignPreferences(
      {
        name: direction.name,
        archetype: args.designPreferences.archetype,
        genome: direction.genome,
        rationale: direction.rationale,
        palette: direction.palette,
        typography: direction.typography,
        form: direction.form,
        controls: direction.controls,
        motion: MOTION_PRESETS[direction.motionPreset],
      },
      { ...MOTION_EMPHASIS[direction.motionEmphasis], language: direction.motionLanguage, easing: null },
      args.designPreferences,
    );

    return VariantManifest.parse({
      version: 1,
      id: `${args.runId}-direction-${directionIndex + 1}`,
      ...style,
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
