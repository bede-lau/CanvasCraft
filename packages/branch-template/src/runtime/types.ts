/**
 * Local type mirrors of the CanvasCraft contracts.
 *
 * These are deliberately duplicated rather than imported from
 * `@canvascraft/schema`. A generated branch must have zero coupling to
 * CanvasCraft: it is copied into a sandbox and resolves dependencies from the
 * pre-baked snapshot, where the host workspace does not exist (ADR 0001).
 *
 * Keep in sync by hand. The materialiser validates against the real schema
 * before writing, so a drift here shows up as a type error at branch build
 * time rather than as a silently wrong screen.
 */

export type StateKind =
  | 'default'
  | 'loading'
  | 'empty'
  | 'filtered'
  | 'selected'
  | 'modal'
  | 'drawer'
  | 'success'
  | 'error'
  | 'narrow';

export type LayoutRegion =
  | 'header'
  | 'sidebar'
  | 'hero'
  | 'primary'
  | 'secondary'
  | 'aside'
  | 'footer'
  | 'overlay';

export type SemanticRole =
  | 'app-bar'
  | 'nav-primary'
  | 'nav-secondary'
  | 'page-title'
  | 'hero-statement'
  | 'metric-tile'
  | 'insight-card'
  | 'media-card'
  | 'list-row'
  | 'data-table'
  | 'search-control'
  | 'filter-control'
  | 'tab-strip'
  | 'primary-action'
  | 'secondary-action'
  | 'form-field'
  | 'dialog'
  | 'drawer'
  | 'toast'
  | 'empty-state'
  | 'skeleton'
  | 'neutral-block';

export type InteractionKind =
  | 'navigate-tab'
  | 'open-modal'
  | 'open-drawer'
  | 'show-filtered-state'
  | 'select-item'
  | 'advance-carousel'
  | 'next-step'
  | 'submit-with-validation'
  | 'show-toast'
  | 'reset-state';

export type ContentShape =
  | 'none'
  | 'text'
  | 'metric'
  | 'record-list'
  | 'record-table'
  | 'media-grid'
  | 'form-fields'
  | 'nav-items';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpecRegion {
  id: string;
  sourceElementId: string | null;
  role: SemanticRole;
  region: LayoutRegion;
  label: string;
  purpose: string;
  sourceBounds: Bounds | null;
  order: number;
  children: string[];
  visibleInStates: StateKind[];
  contentShape: ContentShape;
}

export interface SpecInteraction {
  id: string;
  sourceArrowId: string | null;
  kind: InteractionKind;
  fromRegion: string;
  toRegion: string;
  fromState: StateKind | null;
  toState: StateKind;
  description: string;
  auditionable: boolean;
}

export interface SpecState {
  id: StateKind;
  label: string;
  description: string;
  hiddenRegions: string[];
  placeholderRegions: string[];
}

export type FixtureRecord = Record<string, string | number | boolean | null>;

export interface SpecFixture {
  regionId: string;
  records: FixtureRecord[];
}

export interface SpecAmbiguity {
  id: string;
  question: string;
  impact: string;
  options: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  resolvedOptionId: string | null;
  defaultOptionId: string;
}

export interface ScreenSpec {
  version: 1;
  id: string;
  canvasId: string;
  name: string;
  intent: string;
  audience: string;
  regions: SpecRegion[];
  interactions: SpecInteraction[];
  states: SpecState[];
  fixtures: SpecFixture[];
  ambiguities: SpecAmbiguity[];
  accessibility: {
    minBodyContrast: number;
    minLargeTextContrast: number;
    minTouchTargetPx: number;
    requiresVisibleFocus: true;
    requiresKeyboardPath: true;
    requiresReducedMotionFallback: true;
    landmarks: string[];
  };
  responsive: {
    narrowBreakpointPx: number;
    wideBreakpointPx: number;
    stacksBelowNarrow: string[];
    collapsesBelowNarrow: string[];
  };
  createdAt: string;
}

/** What kind of page this branch is. Selects the layout shell and vocabulary. */
export type PageArchetype = 'marketing' | 'application' | 'portfolio' | 'ai-native';

/** The mechanism a direction moves by, as opposed to how fast. */
export type MotionLanguage = 'reveal' | 'cascade' | 'spring' | 'parallax' | 'cut';

/** What a panel is made of. Orthogonal to how far it sits off the page. */
export type SurfaceTreatment = 'solid' | 'glass' | 'gradient' | 'outline';

/** What sits behind everything. */
export type BackdropTreatment = 'flat' | 'wash' | 'aurora' | 'grain' | 'spotlight';

export interface PaletteTraits {
  name: string;
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentContrast: string;
  positive: string;
  critical: string;
  scheme: 'light' | 'dark';
  backdrop: BackdropTreatment;
}

export interface TypographyTraits {
  displayFamily: string;
  bodyFamily: string;
  monoFamily: string;
  scaleRatio: number;
  baseSizePx: number;
  displayWeight: number;
  bodyWeight: number;
  displayTrackingEm: number;
  bodyLeading: number;
}

export interface FormTraits {
  spaceUnitPx: number;
  density: 'compact' | 'regular' | 'roomy';
  radiusOuterPx: number;
  radiusStepPx: number;
  borderWidthPx: number;
  elevation: 'flat' | 'hairline' | 'raised' | 'lifted';
  surface: SurfaceTreatment;
}

export interface ControlTraits {
  buttonShape: 'sharp' | 'soft' | 'pill';
  buttonFill: 'solid' | 'tonal' | 'outline' | 'ghost';
  inputStyle: 'outlined' | 'filled' | 'underlined';
  iconWeight: 'light' | 'regular' | 'bold';
  iconSizePx: number;
  focusRing: 'ring' | 'outline' | 'underglow';
}

export type MotionPreset = 'calm' | 'playful' | 'editorial';

export interface MotionTraits {
  preset: MotionPreset;
  language: MotionLanguage;
  durationMs: number;
  easing: string;
  staggerMs: number;
  travel: number;
  reducedMotion: 'fade-only' | 'instant';
}

export interface RegionSelection {
  regionId: string;
  recordId: string;
  source: string;
  sourceUrl: string;
  license: string;
  licenseNotice: string | null;
  matchScore: number;
  matchSource: 'openai' | 'local';
  whyItFits: string;
  fallbackReason: string | null;
}

export interface Lineage {
  specId: string;
  specHash: string;
  parentBranchIds: string[];
  traitOrigins: {
    palette: string | null;
    typography: string | null;
    form: string | null;
    controls: string | null;
    motion: string | null;
    selections: string | null;
  };
  registryVersion: string;
}

export interface VariantManifest {
  version: 1;
  id: string;
  name: string;
  /** Selects the layout shell, backdrop, and component vocabulary. */
  archetype: PageArchetype;
  genome: string;
  rationale: string;
  palette: PaletteTraits;
  typography: TypographyTraits;
  form: FormTraits;
  controls: ControlTraits;
  motion: MotionTraits;
  selections: RegionSelection[];
  lineage: Lineage;
  createdAt: string;
}

/** Commands the CanvasCraft host sends into this frame. */
export type PreviewCommand =
  | { type: 'set-state'; state: StateKind }
  | { type: 'replay-interaction'; interactionId: string }
  | { type: 'set-viewport'; width: 'desktop' | 'mobile' }
  | { type: 'highlight-region'; regionId: string | null }
  | { type: 'set-reduced-motion'; enabled: boolean }
  | { type: 'ping' };

/** Messages this frame sends back to the host. */
export type PreviewMessage =
  | { type: 'ready'; branchId: string }
  | { type: 'state-changed'; state: StateKind }
  | { type: 'interaction-complete'; interactionId: string }
  | { type: 'region-clicked'; regionId: string }
  | { type: 'error'; message: string };

export const PREVIEW_CHANNEL = 'canvascraft:preview';
