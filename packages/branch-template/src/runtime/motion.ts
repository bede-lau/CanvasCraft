import type { Transition, Variants } from 'motion/react';
import type { MotionTraits } from './types';

/**
 * Motion, derived from the branch's motion traits.
 *
 * Two rules hold in every branch, because they are part of the shared contract
 * rather than the varying treatment:
 *
 * 1. Motion explains a change. Nothing animates just to be seen animating.
 * 2. Under reduced motion, the information is unchanged — only the movement goes.
 */

export function transitionFor(motion: MotionTraits, reduced: boolean): Transition {
  if (reduced) {
    return motion.reducedMotion === 'instant'
      ? { duration: 0 }
      : { duration: Math.min(0.15, motion.durationMs / 1000), ease: 'linear' };
  }

  if (motion.preset === 'playful') {
    // A spring reads as playful in a way no cubic-bezier does. Damping is kept
    // high enough that the overshoot never obscures the content underneath.
    return {
      type: 'spring',
      stiffness: 320,
      damping: 22,
      mass: 0.8,
    };
  }

  return {
    duration: motion.durationMs / 1000,
    ease: cubicBezierArray(motion.easing) ?? [0.2, 0, 0, 1],
  };
}

/** Parses `cubic-bezier(a, b, c, d)` into the tuple Motion wants. */
function cubicBezierArray(easing: string): [number, number, number, number] | null {
  const match = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(
    easing,
  );
  if (!match) return null;
  const values = match.slice(1, 5).map(Number);
  if (values.some((value) => Number.isNaN(value))) return null;
  return [values[0]!, values[1]!, values[2]!, values[3]!];
}

/** Entrance for a list or grid of sibling items. */
export function enterVariants(motion: MotionTraits, reduced: boolean): Variants {
  const travel = reduced ? 0 : motion.travel * 16;
  return {
    hidden: { opacity: 0, y: travel },
    visible: { opacity: 1, y: 0 },
  };
}

/** Stagger for a container whose children use `enterVariants`. */
export function containerVariants(motion: MotionTraits, reduced: boolean): Variants {
  return {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduced ? 0 : motion.staggerMs / 1000,
        delayChildren: 0,
      },
    },
  };
}

/** Overlay entrance for dialogs and drawers. */
export function overlayVariants(motion: MotionTraits, reduced: boolean): Variants {
  const scale = reduced || motion.preset === 'editorial' ? 1 : 1 - motion.travel * 0.04;
  return {
    hidden: { opacity: 0, scale },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale },
  };
}

/**
 * How long the simulated loading state lasts.
 *
 * Fixed per preset rather than random, so Motion Audition compares pacing
 * rather than luck. All three are short enough to feel like a real app and
 * long enough that the skeleton is legible.
 */
export const LOADING_DURATION_MS: Record<MotionTraits['preset'], number> = {
  calm: 900,
  playful: 700,
  editorial: 550,
};
