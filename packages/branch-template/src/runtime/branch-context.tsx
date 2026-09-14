import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { VariantManifest } from './types';
import { useScreen } from './screen-store';
import {
  containerVariants,
  enterVariants,
  exitTransitionFor,
  heroVariants,
  interactionTransitionFor,
  overlayVariants,
  pressTransitionFor,
  pressVariants,
  secondaryTransitionFor,
  stageDelay,
  stateTransitionFor,
  transitionFor,
  type MotionRole,
} from './motion';
import { ARCHETYPE_LAYOUTS, type ArchetypeLayout } from './archetype';
import type { Transition, Variants } from 'motion/react';

/**
 * Branch identity: the manifest, plus the motion values and layout rules
 * derived from it.
 *
 * Components read motion and layout from here rather than computing it, so a
 * preset change from the inspector — or an archetype change on the next run —
 * reaches every animation and every container in the branch at once.
 *
 * Every field below is a *role*, not a duration. A component picks the one that
 * matches what it is doing and never reaches for `manifest.motion` itself; that
 * is what keeps a hover, a chip filling in, and a drawer arriving from all
 * collapsing onto the same curve, which is what they used to do when the only
 * things on offer were `transition` and `interaction`.
 */

interface BranchContextValue {
  manifest: VariantManifest;
  branchId: string;
  layout: ArchetypeLayout;
  /** Entrance transition. May be long; this is choreography. */
  transition: Transition;
  /** Response to a click. Always short; this is feedback. */
  interaction: Transition;
  /** A component changing in place — chip selects, indicator slides. */
  stateChange: Transition;
  /** A supporting detail that accompanies a primary move without competing. */
  secondary: Transition;
  /** Default exit: same shape as the entrance, 70% of the time. */
  exit: Transition;
  /** An exit at a specific scale, for anything that is not hero-weight. */
  exitFor: (role: MotionRole) => Transition;
  /** Seconds the nth act of a choreographed group waits before it starts. */
  stage: (index: number) => number;
  enter: Variants;
  hero: Variants;
  container: Variants;
  overlay: Variants;
  /** Anticipation and squash-and-stretch for anything pressable. */
  press: Variants;
  pressTransition: Transition;
  reducedMotion: boolean;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({
  manifest,
  branchId,
  children,
}: {
  manifest: VariantManifest;
  branchId: string;
  children: ReactNode;
}) {
  const { reducedMotion } = useScreen();

  const value = useMemo<BranchContextValue>(
    () => ({
      manifest,
      branchId,
      reducedMotion,
      layout: ARCHETYPE_LAYOUTS[manifest.archetype],
      transition: transitionFor(manifest.motion, reducedMotion),
      interaction: interactionTransitionFor(manifest.motion, reducedMotion),
      stateChange: stateTransitionFor(manifest.motion, reducedMotion),
      secondary: secondaryTransitionFor(manifest.motion, reducedMotion),
      exit: exitTransitionFor(manifest.motion, reducedMotion),
      exitFor: (role: MotionRole) => exitTransitionFor(manifest.motion, reducedMotion, role),
      stage: (index: number) => stageDelay(manifest.motion, reducedMotion, index),
      enter: enterVariants(manifest.motion, reducedMotion),
      hero: heroVariants(manifest.motion, reducedMotion),
      container: containerVariants(manifest.motion, reducedMotion),
      overlay: overlayVariants(manifest.motion, reducedMotion),
      press: pressVariants(manifest.motion, reducedMotion),
      pressTransition: pressTransitionFor(manifest.motion, reducedMotion),
    }),
    [manifest, branchId, reducedMotion],
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchContextValue {
  const value = useContext(BranchContext);
  if (!value) throw new Error('useBranch must be used inside a BranchProvider');
  return value;
}
