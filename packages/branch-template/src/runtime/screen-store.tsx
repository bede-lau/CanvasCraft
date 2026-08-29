import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { InteractionKind, ScreenSpec, SpecInteraction, StateKind } from './types';
import { LOADING_DURATION_MS } from './motion';
import type { MotionPreset } from './types';

/**
 * The screen's local state machine.
 *
 * Every branch runs this exact reducer. That is the whole point: if the state
 * logic varied per branch, comparing three branches would compare three
 * different products rather than three treatments of one.
 *
 * Nothing here touches the network. Loading is a timer, success and error are
 * local flags, and the data never leaves `fixtures`.
 */

export interface ScreenState {
  state: StateKind;
  /** Where to return to when an overlay closes. */
  baseState: StateKind;
  activeTabId: string | null;
  selectedIndex: number | null;
  query: string;
  carouselIndex: number;
  stepIndex: number;
  toast: { tone: 'success' | 'error'; message: string } | null;
  /** Set by the host so a canvas selection can highlight the matching region. */
  highlightedRegionId: string | null;
  viewport: 'desktop' | 'mobile';
  /** Host override for reduced motion. Null means "follow the OS setting". */
  reducedMotionOverride: boolean | null;
  /** Set while a validation attempt has failed, for the error state. */
  validationMessage: string | null;
}

type Action =
  | { type: 'set-state'; state: StateKind }
  | { type: 'run-interaction'; interaction: SpecInteraction }
  | { type: 'set-tab'; tabId: string }
  | { type: 'set-query'; query: string }
  | { type: 'select'; index: number | null }
  | { type: 'advance-carousel'; total: number }
  | { type: 'next-step'; total: number }
  | { type: 'dismiss-toast' }
  | { type: 'highlight'; regionId: string | null }
  | { type: 'set-viewport'; viewport: 'desktop' | 'mobile' }
  | { type: 'set-reduced-motion'; enabled: boolean | null }
  | { type: 'reset' };

const OVERLAY_STATES: ReadonlySet<StateKind> = new Set<StateKind>(['modal', 'drawer']);
const TRANSIENT_STATES: ReadonlySet<StateKind> = new Set<StateKind>([
  'loading',
  'success',
  'error',
  'modal',
  'drawer',
]);

function initialState(spec: ScreenSpec): ScreenState {
  const firstTab = spec.regions.find((region) => region.role === 'tab-strip');
  return {
    state: 'default',
    baseState: 'default',
    activeTabId: firstTab ? `${firstTab.id}-0` : null,
    selectedIndex: null,
    query: '',
    carouselIndex: 0,
    stepIndex: 0,
    toast: null,
    highlightedRegionId: null,
    viewport: 'desktop',
    reducedMotionOverride: null,
    validationMessage: null,
  };
}

function reduce(current: ScreenState, action: Action): ScreenState {
  switch (action.type) {
    case 'set-state': {
      const next = action.state;
      const feedback =
        next === 'success'
          ? { tone: 'success' as const, message: 'Saved.' }
          : next === 'error'
            ? { tone: 'error' as const, message: 'Check the highlighted fields and try again.' }
            : null;
      return {
        ...current,
        state: next,
        // Only remember a base state we can meaningfully return to.
        baseState: TRANSIENT_STATES.has(next) ? current.baseState : next,
        toast: feedback,
        validationMessage:
          next === 'error' ? 'Add a name before continuing.' : null,
      };
    }

    case 'run-interaction':
      return applyInteraction(current, action.interaction);

    case 'set-tab':
      return { ...current, activeTabId: action.tabId, selectedIndex: null };

    case 'set-query': {
      const query = action.query;
      const filtering = query.trim().length > 0;
      return {
        ...current,
        query,
        // A search box that does not visibly change the screen is a search box
        // nobody believes. Filtering is a real state in the shared contract.
        state: current.state === 'modal' || current.state === 'drawer'
          ? current.state
          : filtering
            ? 'filtered'
            : current.baseState,
      };
    }

    case 'select':
      return {
        ...current,
        selectedIndex: action.index,
        state: action.index === null ? current.baseState : 'selected',
      };

    case 'advance-carousel':
      return {
        ...current,
        carouselIndex: action.total > 0 ? (current.carouselIndex + 1) % action.total : 0,
      };

    case 'next-step':
      return {
        ...current,
        stepIndex: Math.min(current.stepIndex + 1, Math.max(0, action.total - 1)),
      };

    case 'dismiss-toast':
      return { ...current, toast: null, state: current.baseState };

    case 'highlight':
      return { ...current, highlightedRegionId: action.regionId };

    case 'set-viewport':
      return { ...current, viewport: action.viewport };

    case 'set-reduced-motion':
      return { ...current, reducedMotionOverride: action.enabled };

    case 'reset':
      return {
        ...current,
        state: 'default',
        baseState: 'default',
        selectedIndex: null,
        query: '',
        carouselIndex: 0,
        stepIndex: 0,
        toast: null,
        validationMessage: null,
      };

    default:
      return current;
  }
}

/** Maps a drawn interaction onto the local state change it represents. */
function applyInteraction(current: ScreenState, interaction: SpecInteraction): ScreenState {
  const kind: InteractionKind = interaction.kind;

  switch (kind) {
    case 'open-modal':
    case 'open-drawer':
      return {
        ...current,
        state: kind === 'open-modal' ? 'modal' : 'drawer',
        baseState: OVERLAY_STATES.has(current.state) ? current.baseState : current.state,
      };

    case 'show-filtered-state':
      return { ...current, state: 'filtered', query: current.query || 'active' };

    case 'select-item':
      return { ...current, state: 'selected', selectedIndex: current.selectedIndex ?? 0 };

    case 'navigate-tab':
      return { ...current, state: interaction.toState, selectedIndex: null };

    case 'advance-carousel':
      return { ...current, carouselIndex: current.carouselIndex + 1 };

    case 'next-step':
      return { ...current, stepIndex: current.stepIndex + 1, state: interaction.toState };

    case 'submit-with-validation':
      return {
        ...current,
        state: 'error',
        validationMessage: 'Add a name before continuing.',
        toast: { tone: 'error', message: 'Add a name before continuing.' },
      };

    case 'show-toast':
      return {
        ...current,
        state: 'success',
        toast: { tone: 'success', message: 'Saved.' },
      };

    case 'reset-state':
      return reduce(current, { type: 'reset' });

    default:
      return { ...current, state: interaction.toState };
  }
}

interface ScreenContextValue {
  spec: ScreenSpec;
  screen: ScreenState;
  reducedMotion: boolean;
  dispatch: (action: Action) => void;
  /** Runs an interaction by id, including its simulated loading transition. */
  runInteraction: (interactionId: string) => void;
  isRegionVisible: (regionId: string) => boolean;
  isRegionPlaceholder: (regionId: string) => boolean;
  recordsFor: (regionId: string) => ReadonlyArray<Record<string, string | number | boolean | null>>;
}

const ScreenContext = createContext<ScreenContextValue | null>(null);

export function ScreenProvider({
  spec,
  motionPreset,
  children,
  onInteractionComplete,
  onStateChange,
}: {
  spec: ScreenSpec;
  motionPreset: MotionPreset;
  children: ReactNode;
  onInteractionComplete?: (interactionId: string) => void;
  onStateChange?: (state: StateKind) => void;
}) {
  const [screen, dispatch] = useReducer(reduce, spec, initialState);
  const timers = useRef<number[]>([]);

  const prefersReduced = usePrefersReducedMotion();
  const reducedMotion = screen.reducedMotionOverride ?? prefersReduced;

  useEffect(() => {
    onStateChange?.(screen.state);
  }, [screen.state, onStateChange]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
    };
  }, []);

  const runInteraction = useCallback(
    (interactionId: string) => {
      const interaction = spec.interactions.find((entry) => entry.id === interactionId);
      if (!interaction) return;

      const wantsLoading =
        interaction.toState === 'loading' ||
        interaction.kind === 'show-filtered-state' ||
        interaction.kind === 'next-step';

      if (!wantsLoading) {
        dispatch({ type: 'run-interaction', interaction });
        onInteractionComplete?.(interactionId);
        return;
      }

      // A simulated transition, not a network call. The duration is fixed per
      // motion preset so Motion Audition compares pacing rather than randomness.
      dispatch({ type: 'set-state', state: 'loading' });
      const timer = window.setTimeout(() => {
        dispatch({ type: 'run-interaction', interaction });
        onInteractionComplete?.(interactionId);
      }, LOADING_DURATION_MS[motionPreset]);
      timers.current.push(timer);
    },
    [spec.interactions, motionPreset, onInteractionComplete],
  );

  const stateDefinition = useMemo(
    () => spec.states.find((entry) => entry.id === screen.state) ?? null,
    [spec.states, screen.state],
  );

  const isRegionVisible = useCallback(
    (regionId: string) => {
      const region = spec.regions.find((entry) => entry.id === regionId);
      if (!region) return false;
      if (stateDefinition?.hiddenRegions.includes(regionId)) return false;
      if (region.visibleInStates.length === 0) return true;
      return region.visibleInStates.includes(screen.state);
    },
    [spec.regions, stateDefinition, screen.state],
  );

  const isRegionPlaceholder = useCallback(
    (regionId: string) => {
      if (screen.state === 'loading') return true;
      return stateDefinition?.placeholderRegions.includes(regionId) ?? false;
    },
    [stateDefinition, screen.state],
  );

  const recordsFor = useCallback(
    (regionId: string) => {
      const fixture = spec.fixtures.find((entry) => entry.regionId === regionId);
      const records = fixture?.records ?? [];

      if (screen.state === 'empty') return [];
      if (screen.state !== 'filtered' || screen.query.trim().length === 0) return records;

      const needle = screen.query.trim().toLowerCase();
      const filtered = records.filter((record) =>
        Object.values(record).some((value) => String(value ?? '').toLowerCase().includes(needle)),
      );
      // A filter that silently returns everything teaches the viewer nothing.
      // Falling back to the first half keeps the state visibly different even
      // for a query that matches nothing.
      return filtered.length > 0 ? filtered : records.slice(0, Math.ceil(records.length / 2));
    },
    [spec.fixtures, screen.state, screen.query],
  );

  const value = useMemo<ScreenContextValue>(
    () => ({
      spec,
      screen,
      reducedMotion,
      dispatch,
      runInteraction,
      isRegionVisible,
      isRegionPlaceholder,
      recordsFor,
    }),
    [spec, screen, reducedMotion, runInteraction, isRegionVisible, isRegionPlaceholder, recordsFor],
  );

  return <ScreenContext.Provider value={value}>{children}</ScreenContext.Provider>;
}

export function useScreen(): ScreenContextValue {
  const value = useContext(ScreenContext);
  if (!value) throw new Error('useScreen must be used inside a ScreenProvider');
  return value;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, force] = useReducer((_: boolean, next: boolean) => next, false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    force(media.matches);
    const listener = (event: MediaQueryListEvent) => force(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return reduced;
}
