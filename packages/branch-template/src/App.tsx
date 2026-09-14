import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { SCREEN_SPEC } from './generated/screen-spec';
import { VARIANT_MANIFEST } from './generated/variant-manifest';
import { ADAPTER_PATTERNS } from './patterns/adapters';
import { ARCHETYPE_PATTERNS } from './patterns/archetype';
import { EXPRESSIVE_PATTERNS } from './patterns/expressive';
import { NEUTRAL_PATTERNS } from './patterns/neutral';
import { Backdrop } from './patterns/backdrop';
import { BranchProvider, useBranch } from './runtime/branch-context';
import { createBridge, reportErrors, send } from './runtime/bridge';
import { ScreenProvider, useScreen } from './runtime/screen-store';
import { cssVariableStyle } from './runtime/tokens';
import { useScrollRefresh, useScrollReveal, useSmoothScroll } from './runtime/scroll';
import { WEIGHT_DISTANCE, WEIGHT_SPAN, weightFor } from './runtime/archetype';
import type {
  LayoutRegion,
  PreviewCommand,
  RegionSelection,
  SemanticRole,
  SpecRegion,
  StateKind,
} from './runtime/types';
import type { PatternComponent } from './patterns/kit';

const ROLE_FALLBACKS: Record<SemanticRole, keyof typeof NEUTRAL_PATTERNS> = {
  'app-bar': 'canvascraft-app-bar',
  'nav-primary': 'canvascraft-nav',
  'nav-secondary': 'canvascraft-nav',
  'page-title': 'canvascraft-hero',
  'hero-statement': 'canvascraft-hero',
  'metric-tile': 'canvascraft-metric-shelf',
  'insight-card': 'canvascraft-card-grid',
  'media-card': 'canvascraft-media-grid',
  'list-row': 'canvascraft-record-list',
  'data-table': 'canvascraft-record-table',
  'search-control': 'canvascraft-search',
  'filter-control': 'canvascraft-filters',
  'tab-strip': 'canvascraft-nav',
  'primary-action': 'canvascraft-primary-action',
  'secondary-action': 'canvascraft-secondary-action',
  'form-field': 'canvascraft-form',
  dialog: 'canvascraft-text',
  drawer: 'canvascraft-form',
  toast: 'canvascraft-text',
  'empty-state': 'canvascraft-block',
  skeleton: 'canvascraft-block',
  'neutral-block': 'canvascraft-block',
};

const REGION_ORDER: LayoutRegion[] = [
  'header',
  'sidebar',
  'hero',
  'primary',
  'secondary',
  'aside',
  'footer',
];

type PatternSelection = RegionSelection;

/**
 * Roles that compile to one region per drawn element but read as a single
 * set to a visitor — three proof-point cards, not three sections that each
 * happen to contain one card. Kept narrow (just `insight-card` today):
 * clustering discards each member's own heading, so it is only safe for
 * roles whose whole point is being seen together.
 */
const CLUSTERABLE_ROLES: ReadonlySet<SemanticRole> = new Set<SemanticRole>(['insight-card']);

/**
 * Groups consecutive clusterable regions in one area into single render
 * units, but only when they'd resolve to the *same* pattern component —
 * a registry match that gave three proof points three different
 * treatments (bento/stream/grid) is a deliberate per-region choice, and
 * merging it away would erase that instead of fixing the stacking bug.
 */
function groupRegions(
  regions: SpecRegion[],
  selections: readonly PatternSelection[],
): Array<SpecRegion | SpecRegion[]> {
  const selectionFor = (region: SpecRegion) =>
    selections.find((candidate) => candidate.regionId === region.id) ?? null;

  const groups: Array<SpecRegion | SpecRegion[]> = [];
  let index = 0;
  while (index < regions.length) {
    const region = regions[index]!;
    if (!CLUSTERABLE_ROLES.has(region.role)) {
      groups.push(region);
      index += 1;
      continue;
    }
    const pattern = resolvePattern(region, selectionFor(region));
    const run = [region];
    let next = index + 1;
    while (
      next < regions.length &&
      CLUSTERABLE_ROLES.has(regions[next]!.role) &&
      resolvePattern(regions[next]!, selectionFor(regions[next]!)) === pattern
    ) {
      run.push(regions[next]!);
      next += 1;
    }
    groups.push(run.length > 1 ? run : region);
    index = next;
  }
  return groups;
}

export function App() {
  const onStateChange = useCallback((state: StateKind) => {
    send(VARIANT_MANIFEST.id, { type: 'state-changed', state });
  }, []);

  const onInteractionComplete = useCallback((interactionId: string) => {
    send(VARIANT_MANIFEST.id, { type: 'interaction-complete', interactionId });
  }, []);

  useEffect(() => reportErrors(VARIANT_MANIFEST.id), []);

  return (
    <ScreenProvider
      spec={SCREEN_SPEC}
      motionPreset={VARIANT_MANIFEST.motion.preset}
      onStateChange={onStateChange}
      onInteractionComplete={onInteractionComplete}
    >
      <BranchProvider manifest={VARIANT_MANIFEST} branchId={VARIANT_MANIFEST.id}>
        <PreviewRuntime />
      </BranchProvider>
    </ScreenProvider>
  );
}

/**
 * The layout renderer, one level below {@link App}.
 *
 * Exported so an out-of-tree QA harness can mount it against an arbitrary
 * manifest and Screen Spec (via its own `ScreenProvider` / `BranchProvider`)
 * without going through the two generated modules `App` imports statically.
 * Nothing in the running sandbox imports it by this name.
 */
export function PreviewRuntime() {
  const { spec, screen, dispatch, runInteraction, reducedMotion } = useScreen();
  const { manifest, branchId, layout } = useBranch();
  const previewRef = useRef<HTMLDivElement>(null);
  const [containerNarrow, setContainerNarrow] = useState(false);

  // Scroll choreography is opt-in per archetype and off entirely under reduced
  // motion, so a dashboard and a screen-reader user both get a plain document.
  const choreographed = layout.scrollChoreography && !reducedMotion;
  useSmoothScroll(manifest.motion, !choreographed);
  useScrollRefresh(choreographed);

  useEffect(() => {
    const element = previewRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerNarrow(entry.contentRect.width <= spec.responsive.narrowBreakpointPx);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [spec.responsive.narrowBreakpointPx]);

  useEffect(() => {
    const highlightedId = screen.highlightedRegionId;
    if (!highlightedId) return;
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(highlightedId)
        : highlightedId.replace(/["\\]/g, '\\$&');
    const element = previewRef.current?.querySelector<HTMLElement>(
      `[data-region-frame="${escaped}"]`,
    );
    element?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [screen.highlightedRegionId, reducedMotion]);

  const handleCommand = useCallback(
    (command: PreviewCommand) => {
      switch (command.type) {
        case 'set-state':
          dispatch({ type: 'set-state', state: command.state });
          break;
        case 'replay-interaction':
          if (!spec.interactions.some((interaction) => interaction.id === command.interactionId)) {
            send(branchId, {
              type: 'error',
              message: `Unknown preview interaction: ${command.interactionId}`,
            });
            return;
          }
          runInteraction(command.interactionId);
          break;
        case 'set-viewport':
          dispatch({ type: 'set-viewport', viewport: command.width });
          break;
        case 'highlight-region':
          dispatch({ type: 'highlight', regionId: command.regionId });
          break;
        case 'set-reduced-motion':
          dispatch({ type: 'set-reduced-motion', enabled: command.enabled });
          break;
        case 'ping':
          send(branchId, { type: 'ready', branchId });
          break;
      }
    },
    [branchId, dispatch, runInteraction, spec.interactions],
  );

  const commandRef = useRef(handleCommand);
  useEffect(() => {
    commandRef.current = handleCommand;
  }, [handleCommand]);
  useEffect(
    () => createBridge(branchId, { onCommand: (command) => commandRef.current(command) }),
    [branchId],
  );

  const topLevelRegions = useMemo(() => {
    const childIds = new Set(spec.regions.flatMap((region) => region.children));
    return spec.regions
      .filter((region) => region.region !== 'overlay' && !childIds.has(region.id))
      .sort((left, right) => left.order - right.order);
  }, [spec.regions]);

  const regionsByArea = useMemo(
    () =>
      REGION_ORDER.map((area) => ({
        area,
        groups: groupRegions(
          topLevelRegions.filter((region) => region.region === area),
          manifest.selections,
        ),
      })).filter((group) => group.groups.length > 0),
    [topLevelRegions, manifest.selections],
  );

  const narrow =
    containerNarrow || screen.viewport === 'mobile' || screen.state === 'narrow';

  return (
    <div
      ref={previewRef}
      className={clsx('cc-preview', narrow && 'cc-preview--narrow')}
      data-state={screen.state}
      data-scheme={manifest.palette.scheme}
      data-archetype={manifest.archetype}
      data-shell={layout.shell}
      data-surface={manifest.form.surface}
      data-motion-language={manifest.motion.language}
      data-button-fill={manifest.controls.buttonFill}
      data-input-style={manifest.controls.inputStyle}
      data-focus-ring={manifest.controls.focusRing}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      style={
        {
          ...cssVariableStyle(manifest),
          '--page-max': `${layout.maxWidthPx}px`,
          '--measure': `${layout.measureCh}ch`,
        } as React.CSSProperties
      }
    >
      <a className="cc-skip-link" href="#cc-main">
        Skip to main content
      </a>
      <Backdrop />
      <div className="cc-page">
        <main id="cc-main" className="cc-layout" aria-label={spec.name}>
          {regionsByArea.map(({ area, groups }) => (
            <div key={area} className={clsx('cc-area', `cc-area--${area}`)}>
              {groups.map((group) =>
                Array.isArray(group) ? (
                  <ClusteredRegionRenderer key={group[0]!.id} regions={group} />
                ) : (
                  <RegionRenderer key={group.id} region={group} />
                ),
              )}
            </div>
          ))}
        </main>
        <OverlayLayer />
      </div>
    </div>
  );
}

function RegionRenderer({ region }: { region: SpecRegion }) {
  const {
    spec,
    screen,
    recordsFor,
    isRegionVisible,
    isRegionPlaceholder,
    runInteraction,
    reducedMotion,
  } = useScreen();
  const { manifest, branchId, layout } = useBranch();
  const weight = weightFor(region.role, region.region);

  // A region enters once. Which mechanism it enters by is the branch's own
  // motion language; how far it travels is its weight in the composition.
  const revealRef = useScrollReveal(manifest.motion, reducedMotion || !layout.scrollChoreography, {
    distance: WEIGHT_DISTANCE[weight],
  });

  if (!isRegionVisible(region.id)) return null;

  const interaction = spec.interactions.find(
    (candidate) =>
      candidate.fromRegion === region.id &&
      (candidate.fromState === null || candidate.fromState === screen.state),
  );
  const selection =
    manifest.selections.find((candidate) => candidate.regionId === region.id) ?? null;
  const Pattern = resolvePattern(region, selection);
  const children = region.children
    .map((id) => spec.regions.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is SpecRegion => candidate !== undefined);

  const onRegionClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-region-frame]') === event.currentTarget) {
      send(branchId, { type: 'region-clicked', regionId: region.id });
    }
  };

  return (
    <div
      ref={revealRef}
      className={clsx(
        'cc-region',
        `cc-region--${region.region}`,
        screen.highlightedRegionId === region.id && 'cc-region--highlighted',
      )}
      data-region-frame={region.id}
      data-weight={weight}
      data-source-element-id={region.sourceElementId ?? undefined}
      style={{ '--span': String(WEIGHT_SPAN[weight]) } as React.CSSProperties}
      onClick={onRegionClick}
    >
      <Pattern
        region={region}
        records={recordsFor(region.id)}
        selection={selection}
        placeholder={isRegionPlaceholder(region.id)}
        highlighted={screen.highlightedRegionId === region.id}
        onAct={() => {
          if (interaction) runInteraction(interaction.id);
        }}
        interactive={interaction !== undefined}
      />
      {children.length > 0 ? (
        <div className="cc-region__children">
          {children.map((child) => (
            <RegionRenderer key={child.id} region={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders a {@link groupRegions} cluster as one region: one reveal, one
 * pattern instance, records from every member combined. The heading is
 * suppressed (an individual member's own label, e.g. "Fast", would misname
 * the whole set) — `RegionHeading` already treats an empty label as "no
 * heading", so this needs no change on the pattern side.
 */
function ClusteredRegionRenderer({ regions }: { regions: SpecRegion[] }) {
  const { spec, screen, recordsFor, isRegionVisible, isRegionPlaceholder, runInteraction, reducedMotion } =
    useScreen();
  const { manifest, branchId, layout } = useBranch();
  const primary = regions[0]!;
  const weight = weightFor(primary.role, primary.region);

  const revealRef = useScrollReveal(manifest.motion, reducedMotion || !layout.scrollChoreography, {
    distance: WEIGHT_DISTANCE[weight],
  });

  const visible = regions.filter((region) => isRegionVisible(region.id));
  if (visible.length === 0) return null;

  const interaction = spec.interactions.find(
    (candidate) =>
      candidate.fromRegion === primary.id &&
      (candidate.fromState === null || candidate.fromState === screen.state),
  );
  const selection = manifest.selections.find((candidate) => candidate.regionId === primary.id) ?? null;
  const Pattern = resolvePattern(primary, selection);
  const records = visible.flatMap((region) => recordsFor(region.id));
  const placeholder = visible.some((region) => isRegionPlaceholder(region.id));
  const headingRegion: SpecRegion = { ...primary, label: '' };

  const onRegionClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-region-frame]') === event.currentTarget) {
      send(branchId, { type: 'region-clicked', regionId: primary.id });
    }
  };

  return (
    <div
      ref={revealRef}
      className={clsx(
        'cc-region',
        `cc-region--${primary.region}`,
        regions.some((region) => screen.highlightedRegionId === region.id) && 'cc-region--highlighted',
      )}
      data-region-frame={primary.id}
      data-weight={weight}
      style={{ '--span': String(WEIGHT_SPAN[weight]) } as React.CSSProperties}
      onClick={onRegionClick}
    >
      <Pattern
        region={headingRegion}
        records={records}
        selection={selection}
        placeholder={placeholder}
        highlighted={regions.some((region) => screen.highlightedRegionId === region.id)}
        onAct={() => {
          if (interaction) runInteraction(interaction.id);
        }}
        interactive={interaction !== undefined}
      />
    </div>
  );
}

function resolvePattern(
  region: SpecRegion,
  selection: PatternSelection | null,
): PatternComponent {
  if (selection && selection.recordId in ADAPTER_PATTERNS) {
    return ADAPTER_PATTERNS[selection.recordId as keyof typeof ADAPTER_PATTERNS];
  }
  if (selection && selection.recordId in EXPRESSIVE_PATTERNS) {
    return EXPRESSIVE_PATTERNS[
      selection.recordId as keyof typeof EXPRESSIVE_PATTERNS
    ];
  }
  if (selection && selection.recordId in ARCHETYPE_PATTERNS) {
    return ARCHETYPE_PATTERNS[selection.recordId as keyof typeof ARCHETYPE_PATTERNS];
  }
  if (selection && selection.recordId in NEUTRAL_PATTERNS) {
    return NEUTRAL_PATTERNS[selection.recordId as keyof typeof NEUTRAL_PATTERNS];
  }
  return NEUTRAL_PATTERNS[ROLE_FALLBACKS[region.role]];
}

function OverlayLayer() {
  const { spec, screen, dispatch, isRegionVisible } = useScreen();
  const { overlay, transition, exitFor } = useBranch();
  // A dialog and a toast are both screen-level, so both leave on the screen
  // exit: the accelerating curve at 70% of the arrival. Reusing the entrance
  // transition for the exit — which is what this did — is why dismissing
  // anything felt like waiting on the animation to agree with a decision the
  // reader had already made.
  const screenExit = exitFor('screen');
  // Carried on the variant rather than the `transition` prop, which
  // AnimatePresence would otherwise apply to the entrance as well.
  const overlayWithExit = {
    ...overlay,
    exit: { ...(overlay.exit as Record<string, unknown>), transition: screenExit },
  };
  // An empty `visibleInStates` means "every state" (see SpecRegion), so an
  // overlay drawn without an explicit state variant must still render. Prefer a
  // region scoped to the current state, then fall back to an unscoped one.
  const overlayCandidates = spec.regions.filter(
    (region) => region.region === 'overlay' && isRegionVisible(region.id),
  );
  const overlayRegion =
    overlayCandidates.find((region) => region.visibleInStates.includes(screen.state)) ??
    overlayCandidates[0];
  const showDialog = screen.state === 'modal' || screen.state === 'drawer';
  const showToast = screen.state === 'success' || screen.state === 'error';
  const close = useCallback(
    () => dispatch({ type: 'set-state', state: screen.baseState }),
    [dispatch, screen.baseState],
  );

  useEffect(() => {
    if (!showDialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>('[data-preview-overlay]');
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [close, showDialog]);

  return (
    <AnimatePresence>
      {showDialog ? (
        <motion.div
          className="cc-overlay"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={overlayWithExit}
          transition={transition}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) close();
          }}
        >
          <section
            className={clsx(
              'cc-overlay__panel',
              screen.state === 'drawer' && 'cc-overlay__panel--drawer',
            )}
            role="dialog"
            aria-modal="true"
            aria-label={overlayRegion?.label ?? (screen.state === 'drawer' ? 'Drawer' : 'Dialog')}
            tabIndex={-1}
            data-preview-overlay
          >
            <button className="cc-icon-button cc-overlay__close" type="button" onClick={close}>
              <X aria-hidden="true" />
              <span className="cc-visually-hidden">Close</span>
            </button>
            {overlayRegion ? <RegionRenderer region={overlayRegion} /> : <FallbackOverlay />}
          </section>
        </motion.div>
      ) : null}
      {showToast ? (
        <motion.div
          className={clsx(
            'cc-toast',
            screen.state === 'error' ? 'cc-toast--error' : 'cc-toast--success',
          )}
          role={screen.state === 'error' ? 'alert' : 'status'}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={overlayWithExit}
          transition={transition}
        >
          {screen.state === 'error' ? (
            <AlertCircle aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          <div>
            <strong>{screen.state === 'error' ? 'Could not complete that action' : 'Review saved'}</strong>
            <p>
              {screen.toast?.message ??
                (screen.state === 'error'
                  ? 'Check the highlighted fields and try again.'
                  : 'Your local preview state is up to date.')}
            </p>
          </div>
          <button
            className="cc-icon-button"
            type="button"
            onClick={() => dispatch({ type: 'dismiss-toast' })}
          >
            <X aria-hidden="true" />
            <span className="cc-visually-hidden">Dismiss notification</span>
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function FallbackOverlay(): ReactNode {
  const { screen } = useScreen();
  return (
    <div className="cc-overlay__fallback">
      <h2>{screen.state === 'drawer' ? 'Details' : 'Preview'}</h2>
      <p>This local state is ready for the generated screen content.</p>
    </div>
  );
}
