import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Columns3,
  ExternalLink,
  FileStack,
  GitBranch,
  Laptop,
  Layers3,
  LayoutTemplate,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  Palette,
  Play,
  Rocket,
  RotateCcw,
  Ruler,
  ScanEye,
  SearchCode,
  Shapes,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  WandSparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  findCanvasGuardrails,
  findCanvasIntegrityIssues,
  summariseCanvasReadiness,
  type BranchRecord,
  type CanvasDoc,
  type ManifestDelta,
  type PatchInstruction,
  type Recommendation,
  type RegionCandidates,
  type RunEvent,
  type RunRecord,
  type ScreenSpec,
  type StateKind,
  type TraitGroup,
  type VariantManifest,
  PREVIEW_CHANNEL,
} from '@canvascraft/schema';
import { BranchPreview } from './components/BranchPreview';
import { CanvasStudio } from './components/CanvasStudio';
import { DesignChat } from './components/DesignChat';
import { LiveBranchFrame } from './components/LiveBranchFrame';
import { TemplatePicker } from './components/TemplatePicker';
import {
  DEMO_SPEC,
  EMPTY_CANVAS,
  INITIAL_MANIFESTS,
  INITIAL_RECOMMENDATIONS,
  RUN_STAGES,
  captureManifestDelta,
  createRemix,
  swapManifestPattern,
  updateManifest,
} from './lib/demo';
import {
  deleteWorkspace,
  isWorthSaving,
  listWorkspaces,
  saveRunWorkspace,
  saveWorkspace,
  type WorkspaceEntry,
} from './lib/workspaces';
import {
  createRun,
  deleteServerBranch,
  deleteServerPatch,
  deleteServerRun,
  createServerPatch,
  createServerRemix,
  getRun,
  orchestratorUrl,
  replayRunEvents,
  setChampion as setServerChampion,
  setRecommendation,
  streamRunEvents,
} from './lib/orchestrator';

type AppMode = 'studio' | 'generating' | 'review';
type Theme = 'dark' | 'light';
type DirectorTab = 'director' | 'provenance' | 'remix';
/**
 * Where the run on screen came from.
 *
 * `pending` means a real request is in flight and its outcome is not known yet.
 * It exists because defaulting to `fallback` made a slow-but-successful run
 * render the whole degraded story — "OpenAI visual ranking unavailable",
 * "Daytona unavailable" — while it was in fact succeeding, so users concluded
 * it had failed and paid for a second run.
 */
type RunSource = 'pending' | 'orchestrator' | 'fallback';
type GenerationStageId =
  | 'pending'
  | 'pre-pass'
  | 'interpreting'
  | 'visual-matching'
  | 'licence-gate'
  | 'proposing-directions'
  | 'layout-audit'
  | 'sandbox-launch';
type GenerationStep = {
  stage: GenerationStageId;
  actor: string;
  label: string;
  detail: string;
  outcome?: 'ok' | 'degraded' | 'failed';
};

/** One distinct mark per pipeline stage, so the trace reads at a glance instead of by label text alone. */
const STAGE_ICON: Record<GenerationStageId, LucideIcon> = {
  pending: LoaderCircle,
  'pre-pass': Shapes,
  interpreting: ScanEye,
  'visual-matching': SearchCode,
  'licence-gate': ShieldCheck,
  'proposing-directions': GitBranch,
  'layout-audit': Ruler,
  'sandbox-launch': Rocket,
};

/** The backend stage ids the trace list renders — excludes the client-only `pending` placeholder. */
const TRACE_STAGE_IDS = new Set<GenerationStageId>([
  'pre-pass',
  'interpreting',
  'visual-matching',
  'licence-gate',
  'proposing-directions',
  'layout-audit',
  'sandbox-launch',
]);

/** Shown only while the orchestrator request is unresolved. Claims nothing. */
const PENDING_STAGES: GenerationStep[] = [
  {
    stage: 'pending',
    actor: 'Orchestrator',
    label: 'Starting the run',
    detail: 'Compiling the canvas and launching branches. This can take a minute.',
  },
];

/**
 * The trace rows, shown as soon as the run reports its first real stage.
 * Each row's `outcome`/`detail` is filled in from its own `stage-finished`
 * event, so the list reads as done-so-far rather than appearing all at once.
 */
const TRACE_SCAFFOLD: GenerationStep[] = RUN_STAGES.map((stage) => ({
  stage: stage.stage as GenerationStageId,
  actor: stage.actor,
  label: stage.label,
  detail: stage.detail,
}));
const TRACE_STAGE_ORDER = TRACE_SCAFFOLD.map((step) => step.stage);

/** A run id in the orchestrator's own `run-<lowercase alnum>` shape, chosen
 *  client-side so the event stream can be opened before `POST /runs` answers. */
function newRunId(): string {
  return `run-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/** Minimum time the workspace-transition overlay stays up, so opening a
 *  cached draft doesn't instant-cut (reads as a glitch) while a slower
 *  orchestrator round trip doesn't feel unbounded either. */
const WORKSPACE_TRANSITION_MS = 420;

function withMinDelay<T>(promise: Promise<T>, ms: number = WORKSPACE_TRANSITION_MS): Promise<T> {
  return Promise.all([promise, new Promise<void>((resolve) => window.setTimeout(resolve, ms))]).then(
    ([value]) => value,
  );
}

function sourceLabel(source: VariantManifest['selections'][number]['source']): string {
  return {
    'react-bits': 'React Bits',
    'beautiful-ui': 'Beautiful UI',
    'coss-ui': 'coss ui',
    reui: 'ReUI',
    canvascraft: 'CanvasCraft',
  }[source];
}

/** Registry ids are `<source>-<slug>`; the catalogue is small and fixed enough that this holds without importing the registry package into the host bundle. */
function recordSource(recordId: string): VariantManifest['selections'][number]['source'] {
  if (recordId.startsWith('canvascraft-')) return 'canvascraft';
  if (recordId.startsWith('reui-')) return 'reui';
  if (recordId.startsWith('coss-ui-')) return 'coss-ui';
  if (recordId.startsWith('beautiful-ui-')) return 'beautiful-ui';
  return 'react-bits';
}

function recordLabel(recordId: string): string {
  return recordId
    .replace(/^(canvascraft|reui|coss-ui|beautiful-ui|react-bits)-/, '')
    .replace(/-/g, ' ')
    .replace(/^\w/, (character) => character.toUpperCase());
}

function humaniseTokenKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (character) => character.toUpperCase());
}

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Shows the actual change a recommendation proposes, not a description of it.
 *
 * A selection swap renders as the pattern it hands the region; a token change
 * renders as its own before/after — colour swatches for a hex value, raw
 * values otherwise. Approving something you can see is the point: a paragraph
 * arguing that a change is an improvement is not evidence that it happened.
 */
function RecommendationPreview({
  recommendation,
  manifest,
}: {
  recommendation: Recommendation;
  manifest: VariantManifest;
}) {
  const swap = recommendation.delta.selectionSwaps[0];
  if (swap) {
    return (
      <div className="rec-preview rec-preview--swap">
        <span className="rec-preview__swatch" style={{ background: manifest.palette.accent }} aria-hidden="true" />
        <div className="rec-preview__body">
          <strong>{recordLabel(swap.recordId)}</strong>
          <small>{sourceLabel(recordSource(swap.recordId))} · for "{swap.regionId}"</small>
        </div>
      </div>
    );
  }

  const groups = (['palette', 'typography', 'form', 'controls', 'motion'] as const)
    .map((group) => ({ group, entries: Object.entries(recommendation.delta[group] ?? {}) }))
    .find((entry) => entry.entries.length > 0);
  if (!groups) return null;

  return (
    <div className="rec-preview rec-preview--tokens">
      {groups.entries.slice(0, 2).map(([key, value]) => {
        const current = (manifest[groups.group] as Record<string, unknown>)[key];
        const isColor = typeof value === 'string' && HEX_COLOR_RE.test(value);
        return (
          <div key={key} className="rec-preview__token">
            {isColor ? (
              <span className="rec-preview__pair">
                <span className="rec-preview__swatch" style={{ background: String(current) }} aria-hidden="true" />
                <ArrowRight size={12} aria-hidden="true" />
                <span className="rec-preview__swatch" style={{ background: String(value) }} aria-hidden="true" />
              </span>
            ) : (
              <span className="rec-preview__pair rec-preview__pair--value">
                <code>{String(current)}</code>
                <ArrowRight size={12} aria-hidden="true" />
                <code>{String(value)}</code>
              </span>
            )}
            <small>{humaniseTokenKey(key)}</small>
          </div>
        );
      })}
    </div>
  );
}

export function App() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mode, setMode] = useState<AppMode>('studio');
  const [canvas, setCanvas] = useState<CanvasDoc>(EMPTY_CANVAS);
  const [showTemplatePicker, setShowTemplatePicker] = useState(true);
  // Set for the mandatory beat between picking a workspace card and landing
  // on its destination screen — covers both the sketch-page and the
  // branches-workspace route so the swap reads as a deliberate transition,
  // not a jump cut (or, on a slow orchestrator round trip, a stall).
  const [workspaceTransition, setWorkspaceTransition] = useState<{ label: string } | null>(null);
  // Identifies the in-progress draft for local recall — independent of
  // `canvas.id`, which a blank board or a freshly-picked template can share
  // across sessions. Replaced with the opened entry's id on `openDraft`; reset
  // to a fresh id when a generated run is reopened.
  const [workspaceId, setWorkspaceId] = useState<string>(() => crypto.randomUUID());
  const [savedWorkspaces, setSavedWorkspaces] = useState<WorkspaceEntry[]>(() => listWorkspaces());
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>('insight-deck');
  const [manifests, setManifests] = useState<VariantManifest[]>(INITIAL_MANIFESTS);
  const [selectedBranchId, setSelectedBranchId] = useState(INITIAL_MANIFESTS[0]!.id);
  const [lockedState, setLockedState] = useState<StateKind>('default');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [auditionKey, setAuditionKey] = useState(0);
  const [directorTab, setDirectorTab] = useState<DirectorTab>('director');
  const [recommendations, setRecommendations] = useState<Recommendation[]>(INITIAL_RECOMMENDATIONS);
  const [activeSpec, setActiveSpec] = useState<ScreenSpec>(DEMO_SPEC);
  const [branchRecords, setBranchRecords] = useState<BranchRecord[]>([]);
  const [runCandidates, setRunCandidates] = useState<RegionCandidates[]>([]);
  const [runEvents, setRunEvents] = useState<RunEvent[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runSource, setRunSource] = useState<RunSource>('pending');
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([...RUN_STAGES]);
  const [activeStage, setActiveStage] = useState(-1);
  const [generationDone, setGenerationDone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [branchPendingDeletionId, setBranchPendingDeletionId] = useState<string | null>(null);
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);
  const [patchState, setPatchState] = useState<'idle' | 'applying' | 'applied' | 'error'>('idle');
  const [patches, setPatches] = useState<PatchInstruction[]>([]);
  const [championId, setChampionId] = useState<string | null>(null);
  const [retiredIds, setRetiredIds] = useState<string[]>([]);
  const [mobilePanel, setMobilePanel] = useState<'canvas' | 'preview' | 'director'>('preview');
  const [remixName, setRemixName] = useState('Calm Momentum');
  const [remixSources, setRemixSources] = useState<Record<TraitGroup, string>>({
    palette: 'branch-calm',
    typography: 'branch-editorial',
    form: 'branch-calm',
    controls: 'branch-editorial',
    motion: 'branch-playful',
    selections: 'branch-calm',
  });
  const timers = useRef<number[]>([]);
  const eventStream = useRef<() => void>(() => {});
  const recommendationReverts = useRef<Record<string, ManifestDelta>>({});
  const livePreviewRef = useRef<HTMLIFrameElement>(null);
  const [livePreviewLoad, setLivePreviewLoad] = useState(0);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

  const selectedManifest = manifests.find((manifest) => manifest.id === selectedBranchId) ?? manifests[0]!;
  const selectedBranchRecord = branchRecords.find((branch) => branch.id === selectedBranchId) ?? null;
  const selectedBranchDependents = manifests.filter(
    (manifest) =>
      manifest.id !== selectedBranchId && manifest.lineage.parentBranchIds.includes(selectedBranchId),
  );
  const branchDeleteBlockedReason =
    manifests.length <= 1
      ? 'Keep at least one branch in the active run.'
      : championId === selectedBranchId
        ? 'Choose another champion before deleting this branch.'
        : selectedBranchDependents.length > 0
          ? `${selectedManifest.name} is a source for ${selectedBranchDependents.map((manifest) => manifest.name).join(', ')}.`
          : null;
  const branchPendingDeletion = manifests.find((manifest) => manifest.id === branchPendingDeletionId) ?? null;
  const canvasReadiness = summariseCanvasReadiness(canvas);
  const canvasIssues = findCanvasIntegrityIssues(canvas);
  // Soft, geometry-only nudges about stamp placement — never blocks
  // startGeneration below, unlike canvasIssues. See findCanvasGuardrails.
  const canvasGuardrails = findCanvasGuardrails(canvas);
  // The "draw something" / "add a note" starter reasons are redundant as a
  // persistent pill once the page itself (and, when there's prior work, the
  // workspace picker) already explains what to do here — kept only in
  // canvasReadiness.reasons for the blocking notice in startGeneration.
  const guidanceReasons = canvasReadiness.reasons.filter(
    (reason) => reason !== 'Draw at least one element, or upload a wireframe to mark up.' && reason !== 'Add a note to say what this screen is for.',
  );
  const selectedSpecRegion = activeSpec.regions.find((region) => region.id === selectedRegion) ?? null;
  const selectedProvenance = selectedManifest.selections.find((selection) => selection.regionId === selectedRegion) ?? null;
  const selectedPreviewRegion = DEMO_SPEC.regions.find(
    (region) => region.sourceElementId === selectedSpecRegion?.sourceElementId,
  )?.id ?? null;
  const livePreviewUrl =
    selectedBranchRecord?.status === 'serving' && selectedBranchRecord.previewUrl
      ? orchestratorUrl(selectedBranchRecord.previewUrl)
      : null;
  // The sandbox rebuilds `dist/` in place on Apply, so the URL is unchanged and
  // the iframe would keep the pre-patch document. Tying the src to the branch
  // revision is what actually reloads it.
  const livePreviewSrc =
    livePreviewUrl && selectedBranchRecord
      ? `${livePreviewUrl}${livePreviewUrl.includes('?') ? '&' : '?'}rev=${encodeURIComponent(selectedBranchRecord.updatedAt)}`
      : null;
  // Any branch with a live sandbox: the review pane keeps one iframe per serving
  // branch mounted so switching between them is instant, and only genuine loads
  // (first paint, post-patch reload) show the transitional page.
  const anyBranchServing = branchRecords.some(
    (branch) => branch.status === 'serving' && branch.previewUrl,
  );
  const bumpLivePreviewLoad = useCallback(() => setLivePreviewLoad((value) => value + 1), []);
  const manifestFor = useCallback(
    (id: string) => manifests.find((manifest) => manifest.id === id),
    [manifests],
  );
  // Overall progress for the trace's bottom bar: finished stages over total.
  // `pending` has no known stage count yet, so the bar runs indeterminate.
  const generationProgress = (() => {
    const total = generationSteps.length || 1;
    const done = generationDone ? total : Math.max(0, Math.min(activeStage, total));
    return {
      done,
      total,
      pct: Math.round((done / total) * 100),
      indeterminate: runSource === 'pending',
    };
  })();
  const auditionInteraction =
    activeSpec.interactions.find(
      (interaction) =>
        interaction.auditionable &&
        (interaction.fromState === null || interaction.fromState === lockedState),
    ) ?? activeSpec.interactions.find((interaction) => interaction.auditionable) ?? null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      eventStream.current();
    };
  }, []);

  useEffect(() => {
    if (!selectedCanvasId) return;
    const region = activeSpec.regions.find((entry) => entry.sourceElementId === selectedCanvasId);
    if (region) setSelectedRegion(region.id);
  }, [activeSpec.regions, selectedCanvasId]);

  // Debounced local recall: once the draft carries real intent, persist it
  // under this session's workspace id so the next visit can offer it back.
  useEffect(() => {
    if (mode !== 'studio' || !isWorthSaving(canvas)) return;
    const timer = window.setTimeout(() => {
      saveWorkspace(workspaceId, canvas);
      setSavedWorkspaces(listWorkspaces());
    }, 800);
    return () => window.clearTimeout(timer);
  }, [canvas, mode, workspaceId]);

  // Keep the locked state within what this run's spec can actually render.
  useEffect(() => {
    if (activeSpec.states.some((state) => state.id === lockedState)) return;
    setLockedState(activeSpec.states[0]?.id ?? 'default');
  }, [activeSpec, lockedState]);

  // Tracks browser Fullscreen state directly rather than trusting the click
  // that requested it — Esc, F11, or the browser's own chrome can exit
  // fullscreen without going through `toggleFullscreen` below.
  useEffect(() => {
    const handle = () => setIsPreviewFullscreen(document.fullscreenElement === previewFrameRef.current);
    document.addEventListener('fullscreenchange', handle);
    return () => document.removeEventListener('fullscreenchange', handle);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void previewFrameRef.current?.requestFullscreen();
    }
  };

  useEffect(() => {
    if (!livePreviewUrl) return;
    let targetOrigin: string;
    try {
      // Resolved against the page: under the dev proxy the preview URL is the
      // relative "/api/..." path, and parsing that as absolute throws — which
      // silently swallowed every state, viewport, and highlight command.
      targetOrigin = new URL(livePreviewUrl, window.location.href).origin;
    } catch {
      return;
    }
    const send = (payload: object) =>
      livePreviewRef.current?.contentWindow?.postMessage(
        { channel: PREVIEW_CHANNEL, branchId: selectedBranchId, payload },
        targetOrigin,
      );
    const timer = window.setTimeout(() => {
      send({ type: 'set-state', state: lockedState });
      send({ type: 'set-viewport', width: viewport });
      send({ type: 'set-reduced-motion', enabled: reducedMotion });
      send({ type: 'highlight-region', regionId: selectedRegion });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [
    livePreviewLoad,
    livePreviewUrl,
    lockedState,
    reducedMotion,
    selectedBranchId,
    selectedRegion,
    viewport,
  ]);

  const animateGeneration = (steps: GenerationStep[]) => {
    steps.forEach((_, index) => {
      const timer = window.setTimeout(() => {
        setActiveStage(index);
        if (index === steps.length - 1) {
          const doneTimer = window.setTimeout(() => setGenerationDone(true), 650);
          timers.current.push(doneTimer);
        }
      }, index * 520);
      timers.current.push(timer);
    });
  };

  const applyRunRecord = (run: RunRecord, source: RunSource) => {
    const nextSpec = run.spec ?? DEMO_SPEC;
    const directionIds = run.branches
      .filter((branch) => branch.origin === 'direction')
      .map((branch) => branch.id);
    const primaryDirectionId = directionIds[0] ?? run.branches[0]?.id ?? selectedBranchId;
    const secondaryDirectionId = directionIds[1] ?? primaryDirectionId;
    const tertiaryDirectionId = directionIds[2] ?? secondaryDirectionId;

    setRunId(run.id);
    setRunSource(source);
    setActiveSpec(nextSpec);
    setRunCandidates(run.candidates);
    setBranchRecords(run.branches);
    setManifests(run.branches.map((branch) => branch.manifest));
    setRecommendations(run.recommendations);
    setPatches(run.patches);
    setChampionId(run.championBranchId);
    setRetiredIds(run.branches.filter((branch) => branch.status === 'archived').map((branch) => branch.id));
    setRemixSources({
      palette: primaryDirectionId,
      typography: tertiaryDirectionId,
      form: primaryDirectionId,
      controls: tertiaryDirectionId,
      motion: secondaryDirectionId,
      selections: primaryDirectionId,
    });
    if (!run.branches.some((branch) => branch.id === selectedBranchId) && primaryDirectionId) {
      setSelectedBranchId(primaryDirectionId);
    }
    const traced = nextSpec.regions.find((region) => region.sourceElementId === selectedCanvasId) ?? nextSpec.regions[0];
    setSelectedRegion(traced?.id ?? null);
  };

  const stepsFromEvents = (events: RunEvent[]): GenerationStep[] => {
    const actors: Record<string, string> = {
      'pre-pass': 'CanvasCraft',
      interpreting: 'Local compiler',
      'visual-matching': 'Local matcher',
      'licence-gate': 'CanvasCraft',
      'proposing-directions': 'Local compiler',
      'sandbox-launch': 'Orchestrator',
    };
    const labels = new Map(
      events
        .filter((event): event is Extract<RunEvent, { type: 'stage-started' }> => event.type === 'stage-started')
        .map((event) => [event.stage, event.label]),
    );
    return events
      .filter((event): event is Extract<RunEvent, { type: 'stage-finished' }> => event.type === 'stage-finished')
      .filter((event): event is Extract<RunEvent, { type: 'stage-finished' }> & { stage: GenerationStageId } =>
        TRACE_STAGE_IDS.has(event.stage as GenerationStageId),
      )
      .map((event) => ({
        stage: event.stage,
        actor:
          event.stage === 'visual-matching' && event.outcome === 'ok'
            ? 'OpenAI vision'
            : actors[event.stage] ?? 'CanvasCraft',
        label: labels.get(event.stage) ?? event.stage.replaceAll('-', ' '),
        detail: event.detail,
        outcome: event.outcome,
      }));
  };

  const startGeneration = async () => {
    if (!canvasReadiness.ready || canvasIssues.length > 0) {
      setNotice(canvasIssues[0] ?? canvasReadiness.reasons[0] ?? 'Add at least one canvas element.');
      return;
    }
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    eventStream.current();
    setMode('generating');
    setGenerationDone(false);
    // Neither "live" nor "offline" is known yet, and saying "offline" here is
    // what made a slow success read as a failure.
    setRunSource('pending');
    setGenerationSteps(PENDING_STAGES);
    setActiveStage(0);

    // `POST /runs` runs the whole pipeline before it answers, so the trace used
    // to sit on stage 1 for the entire wait and then flip every row to done at
    // once. Choosing the id here lets the browser tail the event log while the
    // run is still in flight, marking each stage done as its own
    // `stage-finished` arrives — real sequence, not one burst at the end.
    const runId = newRunId();
    let firstTraceSeen = false;
    let finishedCount = 0;
    eventStream.current = streamRunEvents(runId, (event) => {
      if (event.type === 'stage-started' && TRACE_STAGE_ORDER.includes(event.stage as GenerationStageId)) {
        if (!firstTraceSeen) {
          firstTraceSeen = true;
          setRunSource('orchestrator');
          setGenerationSteps([...TRACE_SCAFFOLD]);
        }
        const stage = event.stage as GenerationStageId;
        const index = TRACE_STAGE_ORDER.indexOf(stage);
        // Forward only: nested stages (licence-gate runs inside visual-matching)
        // start and finish out of order.
        setActiveStage((current) => Math.max(current, Math.min(index, finishedCount)));
        setGenerationSteps((steps) =>
          steps.map((step) => (step.stage === stage ? { ...step, label: event.label } : step)),
        );
      }
      if (event.type === 'stage-finished' && TRACE_STAGE_ORDER.includes(event.stage as GenerationStageId)) {
        const stage = event.stage as GenerationStageId;
        finishedCount = Math.max(finishedCount, TRACE_STAGE_ORDER.indexOf(stage) + 1);
        setActiveStage((current) => Math.max(current, finishedCount));
        setGenerationSteps((steps) =>
          steps.map((step) =>
            step.stage === stage ? { ...step, outcome: event.outcome, detail: event.detail } : step,
          ),
        );
      }
      if (event.type === 'run-finished') {
        setActiveStage(TRACE_STAGE_ORDER.length);
        setGenerationDone(true);
      }
    });

    try {
      const run = await createRun({ canvas, canvasImage: null, branchCount: 3, runId });
      // The request has returned the whole record; the live tail has nothing
      // left to add. The replayed log stays the authoritative source for the
      // final per-stage outcomes, exactly as before.
      eventStream.current();
      eventStream.current = () => {};
      const events = await replayRunEvents(run.id);
      const steps = stepsFromEvents(events);
      setRunEvents(events);
      setGenerationSteps(steps);
      setActiveStage(steps.length);
      setGenerationDone(true);
      applyRunRecord(run, 'orchestrator');
      // The generated directions are the thing worth recalling — persist the
      // run so "Continue" reopens the review page, not the drawing board.
      saveRunWorkspace(run);
      setSavedWorkspaces(listWorkspaces());
    } catch (error) {
      eventStream.current();
      eventStream.current = () => {};
      setRunId(null);
      setRunSource('fallback');
      setRunEvents([]);
      setActiveSpec(DEMO_SPEC);
      setRunCandidates([]);
      setBranchRecords([]);
      setManifests(INITIAL_MANIFESTS);
      setRecommendations(INITIAL_RECOMMENDATIONS);
      setSelectedBranchId(INITIAL_MANIFESTS[0]!.id);
      setGenerationSteps([...RUN_STAGES]);
      animateGeneration([...RUN_STAGES]);
      // The cause now arrives already phrased as something the reader can act
      // on, so it is the sentence that matters — the fallback is the aside.
      setNotice(
        `Using the honest local fallback. ${error instanceof Error ? error.message : 'The orchestrator did not answer.'}`.trim(),
      );
    }
  };

  const openDraft = (entry: WorkspaceEntry) => {
    setCanvas(entry.canvas);
    setWorkspaceId(entry.id);
    setSelectedCanvasId(null);
    setShowTemplatePicker(false);
    setMode('studio');
  };

  // Routes a workspace card to its actual destination — the sketch page for
  // an ungenerated draft, straight to the branches workspace for a
  // generated one — behind a mandatory-minimum-duration loading overlay. The
  // overlay is what makes the swap read as a deliberate transition instead of
  // a jump cut: without it, dismissing the picker exposes whatever stale
  // canvas is still mounted underneath for however long the orchestrator
  // round trip takes.
  const openWorkspace = async (entry: WorkspaceEntry) => {
    setWorkspaceTransition({ label: entry.run ? 'Opening your directions…' : 'Opening your canvas…' });
    try {
      if (!entry.run) {
        await withMinDelay(Promise.resolve());
        openDraft(entry);
        return;
      }
      setNotice('Reopening the generated directions…');
      try {
        const run = await withMinDelay(getRun(entry.run.runId));
        applyRunRecord(run, 'orchestrator');
        setCanvas(run.canvas);
        // A fresh draft id, so editing the canvas from here starts its own
        // recall lineage rather than writing over the saved run entry.
        setWorkspaceId(crypto.randomUUID());
        setSelectedCanvasId(null);
        setShowTemplatePicker(false);
        setMode('review');
        setNotice(
          run.branches.some((branch) => branch.status === 'serving')
            ? 'Reopened — three directions serving under one locked Screen Spec.'
            : 'Reopened the saved directions. Their sandboxes are no longer serving; previews render locally.',
        );
      } catch (error) {
        // The localStorage card outlives the orchestrator's run store, so a
        // missing run is expected, not exceptional — fall back to its canvas.
        openDraft(entry);
        setNotice(
          `That run could not be reopened (${error instanceof Error ? error.message : 'orchestrator unavailable'}). Opened its canvas instead.`,
        );
      }
    } finally {
      setWorkspaceTransition(null);
    }
  };

  // Deleting a workspace means deleting its branches too, so the generated
  // one (if any) is cleared server-side first — sandboxes and all — before
  // the local card disappears. Best-effort: the card is this browser's only
  // handle on the draft, so it comes off the list regardless; a failed
  // server cleanup is surfaced instead of silently leaving a sandbox billing.
  const removeWorkspace = async (id: string) => {
    const entry = savedWorkspaces.find((candidate) => candidate.id === id);
    deleteWorkspace(id);
    setSavedWorkspaces(listWorkspaces());
    if (!entry?.run) return;
    try {
      await deleteServerRun(entry.run.runId);
    } catch (error) {
      setNotice(
        `Removed from your workspaces, but its live sandboxes may still be running: ${
          error instanceof Error ? error.message : 'the orchestrator did not answer.'
        }`,
      );
    }
  };

  const enterReview = () => {
    setMode('review');
    setNotice(
      branchRecords.some((branch) => branch.status === 'serving')
        ? 'Three directions are serving under one locked Screen Spec.'
        : 'Three validated directions are ready under one locked Screen Spec.',
    );
  };

  const applyRecommendation = async (recommendation: Recommendation) => {
    const nextState = recommendation.state === 'applied' ? 'reverted' : 'applied';
    try {
      if (runSource === 'orchestrator' && runId) {
        const run = await setRecommendation(runId, {
          recommendationId: recommendation.id,
          apply: nextState === 'applied',
        });
        applyRunRecord(run, 'orchestrator');
      } else if (nextState === 'applied') {
        const current = manifests.find((manifest) => manifest.id === recommendation.branchId);
        if (current) recommendationReverts.current[recommendation.id] = captureManifestDelta(current, recommendation.delta);
        setManifests((entries) =>
          entries.map((manifest) =>
            manifest.id === recommendation.branchId ? updateManifest(manifest, recommendation.delta) : manifest,
          ),
        );
        setRecommendations((entries) =>
          entries.map((entry) => (entry.id === recommendation.id ? { ...entry, state: nextState } : entry)),
        );
      } else {
        const revert = recommendationReverts.current[recommendation.id];
        if (!revert) throw new Error('No captured recommendation values are available to revert.');
        setManifests((entries) =>
          entries.map((manifest) =>
            manifest.id === recommendation.branchId ? updateManifest(manifest, revert) : manifest,
          ),
        );
        setRecommendations((entries) =>
          entries.map((entry) => (entry.id === recommendation.id ? { ...entry, state: nextState } : entry)),
        );
      }
      setNotice(nextState === 'applied' ? 'Recommendation applied to this branch only.' : 'Only this recommendation was reverted.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Recommendation update failed.');
    }
  };

  const applyPatch = async (rawRequest: string) => {
    const request = rawRequest.trim();
    if (request.length < 8) {
      setPatchState('error');
      return;
    }
    if (
      /(entire|all|global|branch-wide|everywhere|whole (screen|app)|theme|palette|colour|color|typography|font|density|radius|spacing|motion preset)/i.test(
        request,
      )
    ) {
      setPatchState('error');
      setNotice('That request changes branch-wide tokens. Use Trait Remix or a recommendation; scoped patches may only swap this region pattern.');
      return;
    }
    if (!selectedSpecRegion) {
      setPatchState('error');
      return;
    }
    setPatchState('applying');
    try {
      if (runSource === 'orchestrator' && runId) {
        await createServerPatch(runId, { branchId: selectedBranchId, regionId: selectedSpecRegion.id, request });
        const refreshed = await getRun(runId);
        applyRunRecord(refreshed, 'orchestrator');
      } else {
        const candidates = runCandidates.find((entry) => entry.regionId === selectedSpecRegion.id)?.matches ?? [];
        const current = selectedManifest.selections.find((selection) => selection.regionId === selectedSpecRegion.id);
        const alternate = candidates.find((candidate) => candidate.recordId !== current?.recordId);
        if (!alternate) throw new Error('No alternate gate-approved local pattern is available for this region.');
        const delta: ManifestDelta = { selectionSwaps: [{ regionId: selectedSpecRegion.id, recordId: alternate.recordId }] };
        const revertTo = captureManifestDelta(selectedManifest, delta);
        setManifests((entries) =>
          entries.map((manifest) =>
            manifest.id === selectedBranchId
              ? swapManifestPattern(manifest, selectedSpecRegion.id, alternate.recordId)
              : manifest,
          ),
        );
        setPatches((entries) => [
          ...entries,
          {
            id: `local-patch-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            branchId: selectedBranchId,
            regionId: selectedSpecRegion.id,
            request,
            interpretation: `Swapped only the ${selectedSpecRegion.label} pattern to a locally available alternate.`,
            delta,
            revertTo,
            state: 'applied',
            error: null,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      setPatchState('applied');
      if (activeSpec.states.some((state) => state.id === 'success')) setLockedState('success');
      setNotice(`Swapped only the ${selectedSpecRegion.label} pattern in ${selectedManifest.name}.`);
    } catch (error) {
      setPatchState('error');
      setNotice(error instanceof Error ? error.message : 'Pattern swap failed.');
    }
  };

  const deletePatch = async (patchId: string) => {
    const patch = patches.find((entry) => entry.id === patchId);
    if (!patch) return;
    try {
      if (runSource === 'orchestrator' && runId) {
        const refreshed = await deleteServerPatch(runId, patchId);
        applyRunRecord(refreshed, 'orchestrator');
      } else {
        const revertRecordId = patch.revertTo.selectionSwaps.find((swap) => swap.regionId === patch.regionId)?.recordId;
        if (revertRecordId) {
          setManifests((entries) =>
            entries.map((manifest) =>
              manifest.id === patch.branchId ? swapManifestPattern(manifest, patch.regionId, revertRecordId) : manifest,
            ),
          );
        }
        setPatches((entries) => entries.filter((entry) => entry.id !== patchId));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not delete that message.');
    }
  };

  const audition = () => {
    if (!auditionInteraction) {
      setNotice('There is no auditionable interaction in this Screen Spec.');
      return;
    }
    setAuditionKey((value) => value + 1);
    if (!livePreviewUrl) {
      setNotice(`Replaying ${auditionInteraction.description} in the local preview.`);
      return;
    }
    try {
      livePreviewRef.current?.contentWindow?.postMessage(
        {
          channel: PREVIEW_CHANNEL,
          branchId: selectedBranchId,
          payload: { type: 'replay-interaction', interactionId: auditionInteraction.id },
        },
        new URL(livePreviewUrl, window.location.href).origin,
      );
      setNotice(`Replaying ${auditionInteraction.description} in the live branch.`);
    } catch {
      setNotice('The live preview could not receive the audition command.');
    }
  };

  const buildRemix = async () => {
    if (runSource === 'orchestrator' && runId) {
      try {
        const branch = await createServerRemix(runId, { name: remixName.trim() || 'Untitled Remix', sources: remixSources });
        setBranchRecords((entries) => [...entries, branch]);
        setManifests((entries) => [...entries, branch.manifest]);
        setSelectedBranchId(branch.id);
        setDirectorTab('director');
        setNotice(`${branch.name} persisted as a manifest-only remix.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Remix creation failed.');
      }
      return;
    }
    const sourceMap = Object.fromEntries(
      Object.entries(remixSources).map(([group, id]) => [
        group,
        manifests.find((manifest) => manifest.id === id) ?? selectedManifest,
      ]),
    ) as Record<TraitGroup, VariantManifest>;
    const remix = createRemix(remixName.trim() || 'Untitled Remix', sourceMap);
    setManifests((entries) => [...entries, remix]);
    setSelectedBranchId(remix.id);
    setDirectorTab('director');
    setNotice(`${remix.name} created from validated manifest traits.`);
  };

  const selectChampion = async () => {
    if (runSource === 'orchestrator' && runId) {
      try {
        const run = await setServerChampion(runId, { branchId: selectedBranchId, retireOthers: true });
        applyRunRecord(run, 'orchestrator');
        setNotice(`${selectedManifest.name} retained as champion; other branches were archived by the orchestrator.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Champion selection failed.');
      }
      return;
    }
    setChampionId(selectedBranchId);
    setRetiredIds(manifests.filter((manifest) => manifest.id !== selectedBranchId).map((manifest) => manifest.id));
    setNotice(`${selectedManifest.name} retained as local champion. Other previews marked archived.`);
  };

  const requestBranchDeletion = () => {
    if (branchDeleteBlockedReason) {
      setNotice(branchDeleteBlockedReason);
      return;
    }
    setBranchPendingDeletionId(selectedBranchId);
  };

  const deleteBranch = async () => {
    const branch = branchPendingDeletion;
    if (!branch) {
      setBranchPendingDeletionId(null);
      return;
    }

    setIsDeletingBranch(true);
    try {
      if (runSource === 'orchestrator' && runId) {
        const run = await deleteServerBranch(runId, branch.id);
        applyRunRecord(run, 'orchestrator');
      } else {
        const nextManifests = manifests.filter((manifest) => manifest.id !== branch.id);
        if (nextManifests.length === 0) throw new Error('Keep at least one branch in the active run.');
        const fallbackBranchId =
          nextManifests.find((manifest) => manifest.lineage.parentBranchIds.length === 0)?.id ??
          nextManifests[0]!.id;
        setManifests(nextManifests);
        setBranchRecords((entries) => entries.filter((entry) => entry.id !== branch.id));
        setRecommendations((entries) => entries.filter((entry) => entry.branchId !== branch.id));
        setRetiredIds((entries) => entries.filter((id) => id !== branch.id));
        setRemixSources((current) =>
          Object.fromEntries(
            Object.entries(current).map(([group, sourceId]) => [
              group,
              sourceId === branch.id ? fallbackBranchId : sourceId,
            ]),
          ) as Record<TraitGroup, string>,
        );
        if (selectedBranchId === branch.id) {
          setSelectedBranchId(fallbackBranchId);
          setMobilePanel('preview');
        }
      }
      setBranchPendingDeletionId(null);
      setNotice(`${branch.name} removed from this run.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Branch deletion failed.');
    } finally {
      setIsDeletingBranch(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="brand"
          onClick={() => setMode('studio')}
          aria-label="CanvasCraft home"
        >
          <img className="brand-mark" src="/brand/canvascraft-mark-180.png" alt="" width={32} height={32} />
          <span>CanvasCraft</span>
          <small>studio</small>
        </button>
        <div className="header-run">
          <span className={`status-dot ${livePreviewUrl ? 'is-live' : 'is-warn'}`} />
          <span>
            {mode === 'studio'
              ? 'Draft canvas'
              : mode === 'generating'
                ? runSource === 'orchestrator'
                  ? 'Live generation'
                  : runSource === 'pending'
                    ? 'Contacting orchestrator'
                    : 'Offline generation demo'
                : runSource === 'orchestrator'
                  ? 'Persisted run'
                  : 'Local review demo'}
          </span>
          {mode === 'review' ? <code>{activeSpec.id}</code> : null}
        </div>
        <div className="header-actions">
          {mode === 'review' ? (
            <button type="button" className="header-button" onClick={() => setMode('studio')}>
              <ArrowLeft size={15} />
              <span>Edit canvas</span>
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" className="icon-button mobile-menu" aria-label="Open workspace menu">
            <Menu size={18} />
          </button>
        </div>
      </header>

      {mode === 'studio' ? (
        <main className="studio-page">
          <section className="studio-intro">
            <div>
              <h1>Shape the product intent.</h1>
              <p>Draw the screen, connect its actions, and leave the judgement to three deliberate design directions.</p>
            </div>
            <div className="studio-actions">
              <button type="button" className="header-button" onClick={() => setShowTemplatePicker(true)}>
                <LayoutTemplate size={15} />
                <span>Templates</span>
              </button>
              <div className="readiness-card">
                <span>{canvasReadiness.stampKinds}/6 stamp types</span>
                <div className="readiness-bar"><i style={{ width: `${Math.min(100, (canvasReadiness.stampKinds / 6) * 100)}%` }} /></div>
              </div>
              <button type="button" className="primary-button" onClick={startGeneration}>
                <WandSparkles size={17} />
                Generate directions
              </button>
            </div>
          </section>
          <div className="studio-canvas-wrap">
            <CanvasStudio
              value={canvas}
              onChange={setCanvas}
              selectedId={selectedCanvasId}
              onSelect={setSelectedCanvasId}
              theme={theme}
            />
            {showTemplatePicker ? (
              <TemplatePicker
                workspaces={savedWorkspaces.filter((entry) => entry.id !== workspaceId)}
                onPick={(doc) => {
                  setCanvas(doc);
                  setSelectedCanvasId(null);
                  setShowTemplatePicker(false);
                }}
                onSkip={() => setShowTemplatePicker(false)}
                onOpenWorkspace={(entry) => void openWorkspace(entry)}
                onDeleteWorkspace={(entryId) => void removeWorkspace(entryId)}
              />
            ) : null}
          </div>
          {guidanceReasons.length > 0 || canvasGuardrails.length > 0 ? (
            <div className="canvas-guidance" aria-label="Canvas readiness guidance">
              {guidanceReasons.map((reason) => (
                <span key={reason}><Lightbulb size={14} />{reason}</span>
              ))}
              {canvasGuardrails.map((guardrail) => (
                <span key={guardrail.id} className="canvas-guidance-item--guardrail">
                  <CircleAlert size={14} />{guardrail.message}
                </span>
              ))}
            </div>
          ) : null}
        </main>
      ) : null}

      {mode === 'generating' ? (
        <main className="generation-page">
          <section className="generation-visual">
            <div className="generation-canvas">
              <CanvasStudio value={canvas} onChange={setCanvas} selectedId={selectedCanvasId} onSelect={setSelectedCanvasId} theme={theme} compact />
              <div className="generation-scan" />
            </div>
            <div className="generation-copy">
              <p className="eyebrow">ONE CONTRACT · THREE DIRECTIONS</p>
              <h1>{generationDone ? 'Your light table is ready.' : 'Turning intent into live branches.'}</h1>
              {!generationDone ? (
                <p>CanvasCraft is compiling the structured canvas, grounding component choices, and starting isolated previews.</p>
              ) : null}
              {generationDone ? (
                <button type="button" className="primary-button" onClick={enterReview}>
                  Open review workspace
                  <ChevronRight size={17} />
                </button>
              ) : null}
            </div>
          </section>
          <section className="generation-log" aria-live="polite">
            <div className="generation-log-heading">
              <div>
                <p className="eyebrow">LIVE GENERATION TRACE</p>
                <h2>From sketch to sandboxes</h2>
              </div>
              <span>
                {runSource === 'pending'
                  ? 'waiting'
                  : `${Math.min(activeStage + 1, generationSteps.length)}/${generationSteps.length}`}
              </span>
            </div>
            <ol>
              {generationSteps.map((stage, index) => {
                const complete = index < activeStage || generationDone;
                const active = index === activeStage && !generationDone;
                const StageIcon = STAGE_ICON[stage.stage] ?? CircleDashed;
                const outcome = stage.outcome ?? 'ok';
                return (
                  <li key={stage.label} className={complete ? 'is-complete' : active ? 'is-active' : ''}>
                    <span className="stage-icon">
                      {active ? <LoaderCircle size={16} className="spin" /> : <StageIcon size={16} />}
                    </span>
                    <div>
                      <strong>{stage.label}</strong>
                    </div>
                    {complete ? (
                      <span
                        className="stage-check"
                        data-outcome={outcome}
                        role="img"
                        aria-label={outcome === 'ok' ? 'done' : outcome}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
                          <path
                            className="stage-check__mark"
                            d="M4.5 12.5 10 18 19.5 6.5"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div
              className="generation-progress"
              role="progressbar"
              aria-label="Overall generation progress"
              aria-valuemin={0}
              aria-valuemax={generationProgress.total}
              aria-valuenow={generationProgress.indeterminate ? undefined : generationProgress.done}
              aria-valuetext={
                generationProgress.indeterminate
                  ? 'Starting the run'
                  : `${generationProgress.done} of ${generationProgress.total} stages`
              }
              data-indeterminate={generationProgress.indeterminate || undefined}
            >
              <div className="generation-progress__track">
                <div
                  className="generation-progress__fill"
                  style={
                    generationProgress.indeterminate
                      ? undefined
                      : { transform: `scaleX(${generationProgress.pct / 100})` }
                  }
                />
              </div>
              <span className="generation-progress__output">
                {generationProgress.indeterminate ? 'Working' : `${generationProgress.pct}%`}
              </span>
            </div>
          </section>
        </main>
      ) : null}

      {mode === 'review' ? (
        <main className="review-page">
          <LineageRail
            canvasName={canvas.title}
            regionCount={activeSpec.regions.length}
            stateCount={activeSpec.states.length}
            manifests={manifests}
            selectedId={selectedBranchId}
            championId={championId}
            retiredIds={retiredIds}
            onSelect={(id) => {
              setSelectedBranchId(id);
              setMobilePanel('preview');
            }}
          />

          <div className="mobile-panel-tabs" role="tablist" aria-label="Workspace panels">
            {([
              ['canvas', FileStack, 'Canvas'],
              ['preview', Columns3, 'Preview'],
              ['director', Sparkles, 'Director'],
            ] as const).map(([id, Icon, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mobilePanel === id} onClick={() => setMobilePanel(id)}>
                <Icon size={15} />{label}
              </button>
            ))}
          </div>

          <div className="review-grid">
            <aside className={`canvas-panel ${mobilePanel !== 'canvas' ? 'mobile-hidden' : ''}`}>
              <PanelHeading icon={FileStack} eyebrow="SOURCE" title="Canvas" meta={`${canvas.elements.length} elements`} />
              <div className="canvas-panel-stage">
                <CanvasStudio
                  value={canvas}
                  onChange={setCanvas}
                  selectedId={selectedCanvasId}
                  onSelect={(id) => {
                    setSelectedCanvasId(id);
                    const region = DEMO_SPEC.regions.find((entry) => entry.sourceElementId === id);
                    if (region) setSelectedRegion(region.id);
                  }}
                  theme={theme}
                  compact
                />
              </div>
              <div className="element-list">
                <p>TRACEABLE REGIONS</p>
                {activeSpec.regions.filter((region) => region.sourceElementId).map((region) => (
                  <button
                    key={region.id}
                    type="button"
                    className={selectedRegion === region.id ? 'is-active' : ''}
                    onClick={() => {
                      setSelectedRegion(region.id);
                      setSelectedCanvasId(region.sourceElementId);
                    }}
                  >
                    <span className="element-kind">{region.role.slice(0, 2).toUpperCase()}</span>
                    <span><strong>{region.label}</strong><small>{region.role}</small></span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </aside>

            <section className={`preview-panel ${mobilePanel !== 'preview' ? 'mobile-hidden' : ''}`}>
              <div className="preview-toolbar">
                <div>
                  <p className="eyebrow">{livePreviewUrl ? 'LIVE BRANCH' : 'LOCAL BRANCH'}</p>
                  <h2>{selectedManifest.name}</h2>
                </div>
                <div className="preview-controls">
                  <div className="segmented-control" aria-label="Preview viewport">
                    <button type="button" className={viewport === 'desktop' ? 'is-active' : ''} aria-label="Desktop preview" onClick={() => setViewport('desktop')}>
                      <Laptop size={16} />
                    </button>
                    <button type="button" className={viewport === 'mobile' ? 'is-active' : ''} aria-label="Mobile preview" onClick={() => setViewport('mobile')}>
                      <Smartphone size={16} />
                    </button>
                  </div>
                  <label className="motion-toggle">
                    <input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} />
                    <span>Reduce motion</span>
                  </label>
                  <button type="button" className="secondary-button" onClick={audition} disabled={!auditionInteraction}>
                    <Play size={15} />Audition
                  </button>
                </div>
              </div>

              <div className={`preview-frame ${viewport === 'mobile' ? 'is-mobile' : ''} ${isPreviewFullscreen ? 'is-fullscreen' : ''}`} ref={previewFrameRef}>
                <div className="preview-frame-bar">
                  <span className={`status-dot ${livePreviewUrl ? 'is-live' : 'is-warn'}`} />
                  <code>{livePreviewUrl ? `daytona://${selectedManifest.id}` : `local://${selectedManifest.id}`}</code>
                  <span>{livePreviewUrl ? 'isolated live branch preview' : 'offline preview simulation'}</span>
                  {livePreviewSrc ? (
                    <a
                      className="preview-frame-action"
                      href={livePreviewSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open live preview in a new tab"
                      aria-label="Open live preview in a new tab"
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="preview-frame-action"
                    onClick={toggleFullscreen}
                    title={isPreviewFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
                    aria-label={isPreviewFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
                  >
                    {isPreviewFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
                <div className="preview-frame-body">
                  {anyBranchServing ? (
                    <LiveBranchFrame
                      branches={branchRecords}
                      selectedId={selectedBranchId}
                      manifestFor={manifestFor}
                      selectedFrameRef={livePreviewRef}
                      onSelectedReady={bumpLivePreviewLoad}
                      reducedMotion={reducedMotion}
                    />
                  ) : (
                    <BranchPreview
                      manifest={selectedManifest}
                      state={lockedState}
                      selectedRegion={selectedRegion}
                      onSelectRegion={setSelectedRegion}
                      viewport={viewport}
                      auditionKey={auditionKey}
                      auditionState={auditionInteraction?.toState ?? null}
                      reducedMotion={reducedMotion}
                    />
                  )}
                </div>
              </div>

              <div className="branch-strip" aria-label="Design branches">
                {manifests.map((manifest) => (
                  <BranchCard
                    key={manifest.id}
                    manifest={manifest}
                    selected={selectedBranchId === manifest.id}
                    champion={championId === manifest.id}
                    retired={retiredIds.includes(manifest.id)}
                    onClick={() => setSelectedBranchId(manifest.id)}
                  />
                ))}
              </div>
            </section>

            <aside className={`director-panel ${mobilePanel !== 'director' ? 'mobile-hidden' : ''}`}>
              <div className="director-tabs" role="tablist" aria-label="Design Director views">
                {([
                  ['director', Sparkles, 'Director'],
                  ['provenance', ShieldCheck, 'Sources'],
                  ['remix', GitBranch, 'Remix'],
                ] as const).map(([id, Icon, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={directorTab === id} className={directorTab === id ? 'is-active' : ''} onClick={() => setDirectorTab(id)}>
                    <Icon size={15} />{label}
                  </button>
                ))}
              </div>

              {directorTab === 'director' ? (
                <div className="director-content is-director">
                  <PanelHeading icon={Sparkles} eyebrow="AI DESIGN DIRECTOR" title={selectedSpecRegion?.label ?? 'Select a region'} meta={selectedManifest.motion.preset} />

                  <div className="director-stack">
                  <section className="inspector-section">
                    <div className="section-label"><Palette size={14} />CURRENT TREATMENT</div>
                    <dl className="token-grid">
                      <div><dt>Palette</dt><dd><i style={{ background: selectedManifest.palette.accent }} />{selectedManifest.palette.name}</dd></div>
                      <div><dt>Controls</dt><dd>{selectedManifest.controls.buttonShape}</dd></div>
                      <div><dt>Motion</dt><dd>{selectedManifest.motion.preset}</dd></div>
                      <div><dt>Density</dt><dd>{selectedManifest.form.density}</dd></div>
                    </dl>
                  </section>

                  <section className="inspector-section">
                    <div className="section-label"><Lightbulb size={14} />RECOMMENDATIONS</div>
                    <div className="recommendation-list">
                      {recommendations.filter((entry) => entry.branchId === selectedBranchId).map((recommendation) => (
                        <article key={recommendation.id} className={`recommendation-card severity-${recommendation.severity}`}>
                          <div className="recommendation-heading">
                            <span>{recommendation.surface}</span>
                            <span
                              className={`recommendation-source source-${recommendation.source}`}
                              title={
                                recommendation.source === 'ai'
                                  ? 'Proposed by the AI design director from this branch’s manifest.'
                                  : 'Measured from this branch’s manifest against the run’s locked floors.'
                              }
                            >
                              {recommendation.source === 'ai' ? 'AI' : 'Measured'}
                            </span>
                            {recommendation.state === 'applied' ? <CircleCheck size={16} /> : null}
                          </div>
                          <h3>{recommendation.title}</h3>
                          <RecommendationPreview recommendation={recommendation} manifest={selectedManifest} />
                          <button type="button" onClick={() => applyRecommendation(recommendation)}>
                            {recommendation.state === 'applied' ? <RotateCcw size={14} /> : <Check size={14} />}
                            {recommendation.state === 'applied' ? 'Revert' : 'Apply'}
                          </button>
                        </article>
                      ))}
                      {recommendations.every((entry) => entry.branchId !== selectedBranchId) ? (
                        <div className="compact-empty"><CircleCheck size={20} /><strong>No open recommendations</strong><span>This direction passes the current guardrails.</span></div>
                      ) : null}
                    </div>
                  </section>

                  <button type="button" className="champion-button" disabled={championId === selectedBranchId} onClick={selectChampion}>
                    <Sparkles size={16} />
                    {championId === selectedBranchId ? 'Selected champion' : `Choose ${selectedManifest.name}`}
                  </button>
                  <button
                    type="button"
                    className="danger-button branch-delete-button"
                    disabled={Boolean(branchDeleteBlockedReason)}
                    title={branchDeleteBlockedReason ?? `Delete ${selectedManifest.name}`}
                    onClick={requestBranchDeletion}
                  >
                    <Trash2 size={15} />
                    Delete branch
                  </button>
                  </div>

                  <DesignChat
                    branchId={selectedBranchId}
                    branchName={selectedManifest.name}
                    regionId={selectedSpecRegion?.id ?? null}
                    regionLabel={selectedSpecRegion?.label ?? null}
                    spec={activeSpec}
                    patches={patches}
                    status={patchState}
                    onSend={applyPatch}
                    onDelete={deletePatch}
                    onDraftChange={() => patchState !== 'idle' && setPatchState('idle')}
                  />
                </div>
              ) : null}

              {directorTab === 'provenance' ? (
                <div className="director-content">
                  <PanelHeading icon={ShieldCheck} eyebrow="COMPONENT INTELLIGENCE" title="Provenance" meta={selectedProvenance?.matchSource ?? 'local'} />
                  {selectedProvenance ? (
                    <>
                      <section className="source-hero">
                        <div className="source-score">{Math.round(selectedProvenance.matchScore * 100)}<small>% match</small></div>
                        <div><span>{sourceLabel(selectedProvenance.source)}</span><h3>{selectedProvenance.recordId}</h3></div>
                      </section>
                      <dl className="provenance-list">
                        <div><dt>Region</dt><dd>{selectedSpecRegion?.label}</dd></div>
                        <div><dt>Licence</dt><dd>{selectedProvenance.license}</dd></div>
                        <div><dt>Match source</dt><dd>{selectedProvenance.matchSource}</dd></div>
                        <div><dt>Export</dt><dd>Preview only</dd></div>
                      </dl>
                      <section className="why-card">
                        <span>WHY IT FITS</span>
                        <p>{selectedProvenance.whyItFits}</p>
                      </section>
                      <section className="guardrail-card">
                        <ShieldCheck size={18} />
                        <div><strong>Compatibility gate passed</strong><span>Base UI compatible · notice preserved · responsive fallback available</span></div>
                      </section>
                    </>
                  ) : (
                    <div className="compact-empty"><Layers3 size={20} /><strong>Select a traced region</strong><span>Its source and gate decision will appear here.</span></div>
                  )}
                </div>
              ) : null}

              {directorTab === 'remix' ? (
                <div className="director-content">
                  <PanelHeading icon={GitBranch} eyebrow="MANIFEST COMPOSITION" title="Trait Remix" meta="no code merge" />
                  <p className="remix-intro">Compose approved trait groups into a fresh child manifest. The shared Screen Spec stays locked.</p>
                  <label className="field">
                    <span>Branch name</span>
                    <input value={remixName} maxLength={60} onChange={(event) => setRemixName(event.target.value)} />
                  </label>
                  <div className="remix-grid">
                    {(['palette', 'typography', 'form', 'controls', 'motion', 'selections'] as TraitGroup[]).map((group) => (
                      <label key={group}>
                        <span>{group === 'selections' ? 'patterns' : group}</span>
                        <select
                          value={remixSources[group]}
                          onChange={(event) => setRemixSources((current) => ({ ...current, [group]: event.target.value }))}
                        >
                          {manifests.filter((manifest) => manifest.lineage.parentBranchIds.length === 0).map((manifest) => (
                            <option key={manifest.id} value={manifest.id}>{manifest.name}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="remix-preview">
                    <span>RESULTING GENOME</span>
                    <strong>
                      {manifests.find((entry) => entry.id === remixSources.palette)?.palette.name} palette ·{' '}
                      {manifests.find((entry) => entry.id === remixSources.controls)?.controls.buttonShape} controls ·{' '}
                      {manifests.find((entry) => entry.id === remixSources.motion)?.motion.preset} motion
                    </strong>
                  </div>
                  <button type="button" className="primary-button full-width" onClick={buildRemix}>
                    <GitBranch size={16} />Create remix branch
                  </button>
                </div>
              ) : null}
            </aside>
          </div>
        </main>
      ) : null}

      <AnimatePresence>
        {branchPendingDeletion ? (
          <motion.div
            className="branch-delete-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!isDeletingBranch) setBranchPendingDeletionId(null);
            }}
          >
            <motion.section
              className="branch-delete-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="branch-delete-title"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
            >
              <span className="branch-delete-modal-icon"><Trash2 size={18} /></span>
              <p className="eyebrow">REMOVE BRANCH</p>
              <h2 id="branch-delete-title">Delete {branchPendingDeletion.name}?</h2>
              <p>It will no longer appear in the active run. Historical snapshots are retained.</p>
              <div className="branch-delete-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isDeletingBranch}
                  onClick={() => setBranchPendingDeletionId(null)}
                >
                  Cancel
                </button>
                <button type="button" className="danger-button is-solid" disabled={isDeletingBranch} onClick={deleteBranch}>
                  {isDeletingBranch ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}
                  {isDeletingBranch ? 'Deleting' : 'Delete branch'}
                </button>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {workspaceTransition ? (
          <motion.div
            className="workspace-transition-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="workspace-transition-card"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <LoaderCircle size={20} className="spin" />
              <span>{workspaceTransition.label}</span>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {notice ? (
          <motion.div
            className="app-toast"
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <CircleCheck size={17} />
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PanelHeading({
  icon: Icon,
  eyebrow,
  title,
  meta,
}: {
  icon: typeof Activity;
  eyebrow: string;
  title: string;
  meta: string;
}) {
  return (
    <div className="panel-heading">
      <span className="panel-icon"><Icon size={16} /></span>
      <div><p>{eyebrow}</p><h2>{title}</h2></div>
      <code>{meta}</code>
    </div>
  );
}

function BranchCard({
  manifest,
  selected,
  champion,
  retired,
  onClick,
}: {
  manifest: VariantManifest;
  selected: boolean;
  champion: boolean;
  retired: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`branch-card ${selected ? 'is-selected' : ''} ${retired ? 'is-retired' : ''}`} onClick={onClick}>
      <span className="branch-swatch" style={{ background: manifest.palette.accent }} />
      <span className="branch-copy">
        <span className="branch-title">
          <strong>{manifest.name}</strong>
          {champion ? <small><Sparkles size={11} />champion</small> : retired ? <small>archived</small> : null}
        </span>
        <code>{manifest.genome}</code>
      </span>
      <ChevronRight size={15} />
    </button>
  );
}

function LineageRail({
  manifests,
  selectedId,
  championId,
  retiredIds,
  onSelect,
  canvasName,
  regionCount,
  stateCount,
}: {
  manifests: VariantManifest[];
  selectedId: string;
  championId: string | null;
  retiredIds: string[];
  onSelect: (id: string) => void;
  canvasName: string;
  regionCount: number;
  stateCount: number;
}) {
  return (
    <section className="lineage-rail" aria-label="Branch lineage">
      <div className="lineage-origin">
        <span><FileStack size={15} /></span>
        <div><small>CANVAS</small><strong>{canvasName}</strong></div>
      </div>
      <i />
      <div className="lineage-origin">
        <span><Layers3 size={15} /></span>
        <div>
          <small>LOCKED SPEC</small>
          <strong>
            {regionCount} {regionCount === 1 ? 'region' : 'regions'} · {stateCount}{' '}
            {stateCount === 1 ? 'state' : 'states'}
          </strong>
        </div>
      </div>
      <i />
      <div className="lineage-branches">
        {manifests.map((manifest) => (
          <button
            key={manifest.id}
            type="button"
            className={`${selectedId === manifest.id ? 'is-active' : ''} ${retiredIds.includes(manifest.id) ? 'is-retired' : ''}`}
            onClick={() => onSelect(manifest.id)}
          >
            <span style={{ '--branch-ink': manifest.palette.accent } as React.CSSProperties} />
            <small>{manifest.lineage.parentBranchIds.length > 0 ? 'REMIX' : 'DIRECTION'}</small>
            <strong>{manifest.name}</strong>
            {championId === manifest.id ? <em>champion</em> : retiredIds.includes(manifest.id) ? <em>archived</em> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
