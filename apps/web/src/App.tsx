import {
  Activity,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleStop,
  Columns3,
  FileStack,
  Gauge,
  GitBranch,
  Laptop,
  Layers3,
  Lightbulb,
  LoaderCircle,
  Menu,
  Moon,
  Palette,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  WandSparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  findCanvasIntegrityIssues,
  summariseCanvasReadiness,
  type BranchRecord,
  type CanvasDoc,
  type ManifestDelta,
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
import {
  DEFAULT_CANVAS,
  DEMO_SPEC,
  INITIAL_MANIFESTS,
  INITIAL_RECOMMENDATIONS,
  RUN_STAGES,
  STATE_LABELS,
  captureManifestDelta,
  createRemix,
  swapManifestPattern,
  updateManifest,
} from './lib/demo';
import {
  createRun,
  createServerPatch,
  createServerRemix,
  getRun,
  orchestratorUrl,
  replayRunEvents,
  setChampion as setServerChampion,
  setRecommendation,
} from './lib/orchestrator';

type AppMode = 'studio' | 'generating' | 'review';
type Theme = 'dark' | 'light';
type DirectorTab = 'director' | 'provenance' | 'remix';
type RunSource = 'orchestrator' | 'fallback';
type GenerationStep = {
  actor: string;
  label: string;
  detail: string;
  outcome?: 'ok' | 'degraded' | 'failed';
};

const REVIEW_STATES: StateKind[] = ['default', 'loading', 'empty', 'filtered', 'modal', 'success', 'error', 'narrow'];

function sourceLabel(source: VariantManifest['selections'][number]['source']): string {
  return {
    'react-bits': 'React Bits',
    'beautiful-ui': 'Beautiful UI',
    'coss-ui': 'coss ui',
    reui: 'ReUI',
    canvascraft: 'CanvasCraft',
  }[source];
}

export function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mode, setMode] = useState<AppMode>('studio');
  const [canvas, setCanvas] = useState<CanvasDoc>(DEFAULT_CANVAS);
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>('insights');
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
  const [runSource, setRunSource] = useState<RunSource>('fallback');
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([...RUN_STAGES]);
  const [activeStage, setActiveStage] = useState(-1);
  const [generationDone, setGenerationDone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [patchText, setPatchText] = useState('');
  const [patchState, setPatchState] = useState<'idle' | 'applying' | 'applied' | 'error'>('idle');
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
  const recommendationReverts = useRef<Record<string, ManifestDelta>>({});
  const livePreviewRef = useRef<HTMLIFrameElement>(null);
  const [livePreviewLoad, setLivePreviewLoad] = useState(0);

  const selectedManifest = manifests.find((manifest) => manifest.id === selectedBranchId) ?? manifests[0]!;
  const selectedBranchRecord = branchRecords.find((branch) => branch.id === selectedBranchId) ?? null;
  const canvasReadiness = summariseCanvasReadiness(canvas);
  const canvasIssues = findCanvasIntegrityIssues(canvas);
  const selectedSpecRegion = activeSpec.regions.find((region) => region.id === selectedRegion) ?? null;
  const selectedProvenance = selectedManifest.selections.find((selection) => selection.regionId === selectedRegion) ?? null;
  const selectedPreviewRegion = DEMO_SPEC.regions.find(
    (region) => region.sourceElementId === selectedSpecRegion?.sourceElementId,
  )?.id ?? null;
  const livePreviewUrl =
    selectedBranchRecord?.status === 'serving' && selectedBranchRecord.previewUrl
      ? orchestratorUrl(selectedBranchRecord.previewUrl)
      : null;
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
    return () => timers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!selectedCanvasId) return;
    const region = activeSpec.regions.find((entry) => entry.sourceElementId === selectedCanvasId);
    if (region) setSelectedRegion(region.id);
  }, [activeSpec.regions, selectedCanvasId]);

  useEffect(() => {
    if (!livePreviewUrl) return;
    let targetOrigin: string;
    try {
      targetOrigin = new URL(livePreviewUrl).origin;
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
      .filter((event) => ['pre-pass', 'interpreting', 'visual-matching', 'licence-gate', 'proposing-directions', 'sandbox-launch'].includes(event.stage))
      .map((event) => ({
        actor: actors[event.stage] ?? 'CanvasCraft',
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
    setMode('generating');
    setGenerationDone(false);
    setActiveStage(-1);
    try {
      const run = await createRun({ canvas, canvasImage: null, branchCount: 3 });
      const events = await replayRunEvents(run.id);
      const steps = stepsFromEvents(events);
      setRunEvents(events);
      setGenerationSteps(steps);
      applyRunRecord(run, 'orchestrator');
      animateGeneration(steps);
    } catch (error) {
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
      setNotice(`Orchestrator unavailable. Using the honest local fallback. ${error instanceof Error ? error.message : ''}`.trim());
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

  const applyPatch = async () => {
    const request = patchText.trim();
    if (request.length < 8) {
      setPatchState('error');
      return;
    }
    if (
      /(entire|all|global|branch-wide|everywhere|whole (screen|app)|theme|palette|colour|color|typography|font|density|radius|spacing|motion preset)/i.test(
        request,
      )
    ) {
      setPatchText('');
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
        setManifests((entries) =>
          entries.map((manifest) =>
            manifest.id === selectedBranchId
              ? swapManifestPattern(manifest, selectedSpecRegion.id, alternate.recordId)
              : manifest,
          ),
        );
      }
      setPatchState('applied');
      setLockedState('success');
      setNotice(`Swapped only the ${selectedSpecRegion.label} pattern in ${selectedManifest.name}.`);
    } catch (error) {
      setPatchState('error');
      setNotice(error instanceof Error ? error.message : 'Pattern swap failed.');
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
        new URL(livePreviewUrl).origin,
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
          <CanvasStudio
            value={canvas}
            onChange={setCanvas}
            selectedId={selectedCanvasId}
            onSelect={setSelectedCanvasId}
          />
          {canvasReadiness.reasons.length > 0 ? (
            <div className="canvas-guidance" aria-label="Canvas readiness guidance">
              {canvasReadiness.reasons.map((reason) => (
                <span key={reason}><Lightbulb size={14} />{reason}</span>
              ))}
            </div>
          ) : null}
        </main>
      ) : null}

      {mode === 'generating' ? (
        <main className="generation-page">
          <section className="generation-visual">
            <div className="generation-canvas">
              <CanvasStudio value={canvas} onChange={setCanvas} selectedId={selectedCanvasId} onSelect={setSelectedCanvasId} compact />
              <div className="generation-scan" />
            </div>
            <div className="generation-copy">
              <p className="eyebrow">ONE CONTRACT · THREE DIRECTIONS</p>
              <h1>{generationDone ? 'Your light table is ready.' : 'Turning intent into live branches.'}</h1>
              <p>
                {generationDone
                  ? 'Every direction preserves the same regions, fixtures, states, interactions, and accessibility floor.'
                  : 'CanvasCraft is compiling the structured canvas, grounding component choices, and starting isolated previews.'}
              </p>
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
              <span>{Math.min(activeStage + 1, generationSteps.length)}/{generationSteps.length}</span>
            </div>
            <ol>
              {generationSteps.map((stage, index) => {
                const complete = index < activeStage || generationDone;
                const active = index === activeStage && !generationDone;
                return (
                  <li key={stage.label} className={complete ? 'is-complete' : active ? 'is-active' : ''}>
                    <span className="stage-icon">
                      {complete ? <Check size={15} /> : active ? <LoaderCircle size={15} className="spin" /> : <CircleDashed size={15} />}
                    </span>
                    <div>
                      <strong>{stage.label}</strong>
                      <span>{stage.actor} · {stage.detail}</span>
                    </div>
                    {complete ? <small>{stage.outcome === 'ok' || !stage.outcome ? 'done' : stage.outcome}</small> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        </main>
      ) : null}

      {mode === 'review' ? (
        <main className="review-page">
          <LineageRail
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

              <div className="state-lock">
                <span><CircleStop size={14} />STATE LOCK</span>
                <div>
                  {REVIEW_STATES.map((state) => (
                    <button
                      key={state}
                      type="button"
                      className={lockedState === state ? 'is-active' : ''}
                      aria-pressed={lockedState === state}
                      onClick={() => {
                        setLockedState(state);
                        if (state === 'narrow') setViewport('mobile');
                      }}
                    >
                      {STATE_LABELS[state]}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`preview-frame ${viewport === 'mobile' ? 'is-mobile' : ''}`}>
                <div className="preview-frame-bar">
                  <span className={`status-dot ${livePreviewUrl ? 'is-live' : 'is-warn'}`} />
                  <code>{livePreviewUrl ? `daytona://${selectedManifest.id}` : `local://${selectedManifest.id}`}</code>
                  <span>{livePreviewUrl ? 'isolated live branch preview' : 'offline preview simulation'}</span>
                </div>
                <div className="preview-frame-body">
                  {livePreviewUrl ? (
                    <iframe
                      ref={livePreviewRef}
                      src={livePreviewUrl}
                      title={`${selectedManifest.name} live branch preview`}
                      className="live-branch-preview"
                      onLoad={() => setLivePreviewLoad((value) => value + 1)}
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
                <div className="director-content">
                  <PanelHeading icon={Sparkles} eyebrow="AI DESIGN DIRECTOR" title={selectedSpecRegion?.label ?? 'Select a region'} meta={selectedManifest.motion.preset} />
                  <section className="director-summary">
                    <div className="director-score">
                      <Gauge size={18} />
                      <span><strong>92</strong><small>readiness</small></span>
                    </div>
                    <p>{selectedManifest.rationale}</p>
                  </section>

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
                            {recommendation.state === 'applied' ? <CircleCheck size={16} /> : null}
                          </div>
                          <h3>{recommendation.title}</h3>
                          <p>{recommendation.rationale}</p>
                          <small>{recommendation.evidence}</small>
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

                  <section className="inspector-section">
                    <div className="section-label"><WandSparkles size={14} />SCOPED PATCH</div>
                    <label className="patch-field">
                      <span>Change only {selectedSpecRegion?.label ?? 'this region'} in {selectedManifest.name}</span>
                      <textarea
                        value={patchText}
                        maxLength={500}
                        placeholder="Make this card calmer and give the content more breathing room."
                        onChange={(event) => {
                          setPatchText(event.target.value);
                          setPatchState('idle');
                        }}
                      />
                    </label>
                    {patchState === 'error' ? <p className="field-error">Describe the intended change in at least eight characters.</p> : null}
                    <button type="button" className="secondary-button full-width" disabled={patchState === 'applying'} onClick={applyPatch}>
                      {patchState === 'applying' ? <LoaderCircle size={15} className="spin" /> : <WandSparkles size={15} />}
                      {patchState === 'applying' ? 'Applying local patch' : patchState === 'applied' ? 'Patch applied' : 'Preview patch'}
                    </button>
                  </section>

                  <button type="button" className="champion-button" disabled={championId === selectedBranchId} onClick={selectChampion}>
                    <Sparkles size={16} />
                    {championId === selectedBranchId ? 'Selected champion' : `Choose ${selectedManifest.name}`}
                  </button>
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
          {champion ? <small><Sparkles size={11} />champion</small> : retired ? <small>archived</small> : <small><span className="status-dot is-warn" />local</small>}
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
}: {
  manifests: VariantManifest[];
  selectedId: string;
  championId: string | null;
  retiredIds: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <section className="lineage-rail" aria-label="Branch lineage">
      <div className="lineage-origin">
        <span><FileStack size={15} /></span>
        <div><small>CANVAS</small><strong>Portfolio pulse</strong></div>
      </div>
      <i />
      <div className="lineage-origin">
        <span><Layers3 size={15} /></span>
        <div><small>LOCKED SPEC</small><strong>7 regions · 8 states</strong></div>
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
            <em>{championId === manifest.id ? 'champion' : retiredIds.includes(manifest.id) ? 'archived' : 'local'}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
