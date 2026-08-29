import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { VariantManifest } from './types';
import { useScreen } from './screen-store';
import { containerVariants, enterVariants, overlayVariants, transitionFor } from './motion';
import type { Transition, Variants } from 'motion/react';

/**
 * Branch identity: the manifest, plus the motion values derived from it.
 *
 * Components read motion from here rather than computing it, so a preset change
 * from the inspector reaches every animation in the branch at once.
 */

interface BranchContextValue {
  manifest: VariantManifest;
  branchId: string;
  transition: Transition;
  enter: Variants;
  container: Variants;
  overlay: Variants;
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
      transition: transitionFor(manifest.motion, reducedMotion),
      enter: enterVariants(manifest.motion, reducedMotion),
      container: containerVariants(manifest.motion, reducedMotion),
      overlay: overlayVariants(manifest.motion, reducedMotion),
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
