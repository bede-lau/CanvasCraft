import type { Transition, Variants } from 'motion/react';
import type { MotionLanguage, MotionTraits } from './types';

/**
 * Motion, derived from the branch's motion traits.
 *
 * Two rules hold in every branch, because they are part of the shared contract
 * rather than the varying treatment:
 *
 * 1. Motion explains a change. Nothing animates just to be seen animating.
 * 2. Under reduced motion, the information is unchanged — only the movement goes.
 *
 * What changed: `preset` used to be the only input, and it only ever produced an
 * opacity fade with an 8px rise. A preset is a *tempo*; `language` is the
 * mechanism, and it is what makes three directions read as three products
 * rather than three palettes. Every language below degrades to the same
 * opacity-or-nothing fallback, so the accessibility contract is unchanged and
 * only the expression varies.
 *
 * What changed again: there used to be one duration and one curve. Every
 * animation in the branch — a chip highlighting under the pointer, a drawer
 * arriving, a hero settling — shared them, which is why the output read as one
 * undifferentiated tempo no matter how good the individual moves were. This
 * module now owns a proportional duration ladder and a directional easing set,
 * and every helper below picks the class that matches what it is doing.
 */

/* -------------------------------------------------------------------------- */
/* Timing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Material Design 3's duration classes, in milliseconds at the reference tempo.
 *
 * Kept as the published numbers rather than as ratios so the source of the
 * scale stays checkable against the spec. `durationFor` is what applies the
 * branch's own tempo to them.
 */
export const DURATION_CLASS = {
  short1: 50,
  short2: 100,
  short3: 150,
  short4: 200,
  medium1: 250,
  medium2: 300,
  medium3: 350,
  medium4: 400,
  long1: 450,
  long2: 500,
  long3: 550,
  long4: 600,
  extraLong1: 700,
  extraLong2: 800,
} as const;

export type DurationClass = keyof typeof DURATION_CLASS;

/**
 * The ladder step the branch's own `motion.durationMs` *is*.
 *
 * M3 places a hero or shared-element transition at medium4–long2, and
 * `durationMs` is precisely the branch's hero-entrance budget, so the two are
 * the same measurement and `long2` is where the scale anchors. Every other
 * class then moves with the branch: a calm branch's hover is slower than an
 * editorial branch's hover by exactly the ratio their entrances differ by, so
 * character survives while the *relationships* between classes stay fixed.
 */
const LADDER_ANCHOR_MS = DURATION_CLASS.long2;

/** Milliseconds for one ladder class at this branch's tempo. */
export function durationFor(motion: MotionTraits, klass: DurationClass): number {
  return Math.max(1, Math.round(DURATION_CLASS[klass] * (motion.durationMs / LADDER_ANCHOR_MS)));
}

/**
 * What an animation *is*, rather than how long it takes.
 *
 * Callers name the role and get the class; nothing outside this table decides
 * that a drawer is a screen-level transition or that a hover is a
 * micro-interaction. Assignments follow M3's own guidance so the ladder is not
 * quietly re-invented per component, which is the failure this replaces.
 */
export const ROLE_DURATION = {
  /** Press feedback. Must land before the finger leaves the control. */
  press: 'short1',
  /** Hover, focus ring, cursor-tracking highlight. */
  hover: 'short2',
  /** A component changing state in place: chip selects, tab activates. */
  state: 'short4',
  /** A container resolving: card expands, menu opens, panel swaps. */
  container: 'medium2',
  /** Screen-level: dialog, drawer, sheet, toast. */
  screen: 'medium4',
  /** Hero and shared-element choreography. Equals the branch's own duration. */
  hero: 'long2',
  /** A full-region morph. The longest anything is allowed to take. */
  morph: 'long4',
} as const satisfies Record<string, DurationClass>;

export type MotionRole = keyof typeof ROLE_DURATION;

export function roleDuration(motion: MotionTraits, role: MotionRole): number {
  return durationFor(motion, ROLE_DURATION[role]);
}

/**
 * How much shorter an exit is than the matching enter.
 *
 * An exit that reuses the entrance duration is the single most common reason a
 * UI feels sluggish: the reader has already decided the thing is gone and is
 * waiting on the animation to agree. Leaving is not an event anyone needs to
 * watch, so it gets the same shape at 70% of the time.
 */
export const EXIT_DURATION_RATIO = 0.7;

/**
 * The interaction budget, as a fraction of the entrance duration.
 *
 * Mirrors `INTERACTION_DURATION_RATIO` in `@canvascraft/schema`. The Design
 * Director measures a branch against this exact number, so it stays a literal
 * here rather than becoming another rung on the ladder — a branch that reported
 * one response time and shipped another would fail review for the wrong reason.
 */
export const INTERACTION_DURATION_RATIO = 0.4;

/* -------------------------------------------------------------------------- */
/* Easing                                                                     */
/* -------------------------------------------------------------------------- */

export type Bezier = [number, number, number, number];

/**
 * M3's easing set, emitted whole rather than collapsed to one curve.
 *
 * The whole point of having six is that they are not interchangeable:
 * `decelerate` is what arriving feels like, `accelerate` is what leaving feels
 * like, and `emphasized` is what a thing changing *in place* feels like. One
 * shared curve for all three is why a dialog and a hover chip used to read as
 * the same kind of event.
 */
export const EASING: Record<
  | 'emphasized'
  | 'emphasizedDecelerate'
  | 'emphasizedAccelerate'
  | 'standard'
  | 'standardDecelerate'
  | 'standardAccelerate',
  Bezier
> = {
  emphasized: [0.2, 0.0, 0.0, 1.0],
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1.0],
  emphasizedAccelerate: [0.3, 0.0, 0.8, 0.15],
  standard: [0.2, 0.0, 0.0, 1.0],
  standardDecelerate: [0.0, 0.0, 0.0, 1.0],
  standardAccelerate: [0.3, 0.0, 1.0, 1.0],
};

/** Parses `cubic-bezier(a, b, c, d)` into the tuple Motion wants. */
function cubicBezierArray(easing: string): Bezier | null {
  const match = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(
    easing,
  );
  if (!match) return null;
  const values = match.slice(1, 5).map(Number);
  if (values.some((value) => Number.isNaN(value))) return null;
  return [values[0]!, values[1]!, values[2]!, values[3]!];
}

/**
 * Time-reverses a curve, so an ease-out becomes the ease-in of the same shape.
 *
 * This is what lets a branch keep one signature curve and still never use it
 * for both directions: the exit is demonstrably the *same* character as the
 * enter — a playful branch's overshoot becomes a playful branch's wind-up —
 * rather than a second curve chosen independently and only coincidentally
 * related to the first.
 */
function mirrorBezier([x1, y1, x2, y2]: Bezier): Bezier {
  return [1 - x2, 1 - y2, 1 - x1, 1 - y1];
}

/**
 * Whether a curve spends its progress early.
 *
 * A cubic bezier from (0,0) to (1,1) sits above the diagonal at its parametric
 * midpoint exactly when `y1 + y2 > 1`, which is the cheap test for "this is an
 * ease-out". Overshooting curves (`y > 1`) pass it too, which is correct: a
 * back-out is still an arrival.
 */
function decelerates([, y1, , y2]: Bezier): boolean {
  return y1 + y2 > 1;
}

/**
 * The branch's signature curve, split into the two directions it can be used in.
 *
 * All three shipped presets carry an ease-out as their signature, so `enter` is
 * normally the manifest's own value untouched and `exit` is its mirror. A
 * hand-edited manifest that supplies an ease-in gets the pair the other way
 * round rather than an entrance that accelerates away from the reader.
 */
export function easingPairFor(motion: MotionTraits): { enter: Bezier; exit: Bezier } {
  const signature = cubicBezierArray(motion.easing) ?? EASING.emphasizedDecelerate;
  const mirrored = mirrorBezier(signature);
  return decelerates(signature)
    ? { enter: signature, exit: mirrored }
    : { enter: mirrored, exit: signature };
}

/** Serialises a curve back to the CSS value that produced it. */
export function bezierCss(bezier: Bezier): string {
  return `cubic-bezier(${bezier.map((value) => Number(value.toFixed(4))).join(', ')})`;
}

/**
 * The same curve as a plain progress function, for consumers that cannot read
 * `cubic-bezier()`.
 *
 * GSAP only understands its own named eases and a function; handed a CSS
 * string it warns and silently falls back to `power1.out`. That fallback is
 * why the scroll reveals used to resolve at a rate no branch had asked for
 * while every Motion-driven entrance on the same page used the branch's own
 * curve. Newton-Raphson on x with a bisection backstop, which is the standard
 * solve — the curve is only a parametric function of t, so x has to be
 * inverted before y means anything.
 */
export function bezierEasing(bezier: Bezier): (progress: number) => number {
  const [x1, y1, x2, y2] = bezier;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (progress: number) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;

    let t = progress;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(t) - progress;
      if (Math.abs(error) < 1e-6) return sampleY(t);
      const slope = slopeX(t);
      // A flat tangent makes the Newton step diverge, which is reachable for
      // the accelerate curves — hand those iterations to bisection instead.
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }

    let low = 0;
    let high = 1;
    t = progress;
    while (high - low > 1e-6) {
      if (sampleX(t) < progress) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return sampleY(t);
  };
}

/* -------------------------------------------------------------------------- */
/* Deformation and travel                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How far a control is allowed to deform under the finger.
 *
 * Capped at 0.05 because squash and stretch past a 0.95–1.05 scale stops
 * reading as weight and starts reading as a cartoon — the line between
 * believable and Looney Tunes, and the one place exaggeration is not the
 * answer. `cut` gets none: a language whose whole argument is that nothing
 * interpolates cannot justify a rubber button.
 */
export function deformationFor(motion: MotionTraits): number {
  if (motion.language === 'cut') return 0;
  return Math.min(0.05, 0.02 + motion.travel * 0.04);
}

/** How far, and in which axis, an entrance travels for each language. */
interface Travel {
  x: number;
  y: number;
  scale: number;
  /** Degrees of rotation on entry. Only `spring` uses it, and only slightly. */
  rotate: number;
  /** Blur in px at rest. Reads as focus pulling in rather than as motion blur. */
  blur: number;
}

/**
 * The entrance offset for a language, at a given weight.
 *
 * `cascade` and `spring` carry a real off-axis component so their arrival
 * traces an arc rather than a straight vertical slide — nothing in the physical
 * world travels in a pure axis, and a grid of cards that all drop straight down
 * is the tell that a page was generated. `reveal` and `parallax` stay on the Y
 * axis deliberately: their argument is depth, and an arc would fight it.
 */
function travelFor(motion: MotionTraits, distance: number): Travel {
  const language: MotionLanguage = motion.language;
  const t = motion.travel * distance;

  switch (language) {
    case 'reveal':
      return { x: 0, y: t, scale: 1, rotate: 0, blur: Math.min(6, motion.travel * 8) };
    case 'cascade':
      return { x: t * 0.4, y: t * 0.7, scale: 1, rotate: 0, blur: 0 };
    case 'spring':
      return {
        x: t * 0.18,
        y: t * 0.8,
        scale: 1 - motion.travel * 0.06,
        rotate: motion.travel * -1.6,
        blur: 0,
      };
    case 'parallax':
      return { x: 0, y: t * 1.3, scale: 1 + motion.travel * 0.04, rotate: 0, blur: 0 };
    case 'cut':
    default:
      return { x: 0, y: 0, scale: 1, rotate: 0, blur: 0 };
  }
}

/**
 * The sideways component of an entrance, as a signed multiplier of the vertical.
 *
 * Exposed so CSS-driven reveals can trace the same arc the Motion-driven ones
 * do. A page where the JS entrances curve and the CSS entrances do not reads as
 * two pages spliced together.
 */
export function arcRatioFor(motion: MotionTraits): number {
  const travel = travelFor(motion, 1);
  return travel.y === 0 ? 0 : Number((travel.x / travel.y).toFixed(3));
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Entrance transition. May be long; this is choreography.
 *
 * Uses the branch's signature curve in its decelerating direction, which is the
 * shape of something arriving and coming to rest.
 */
export function transitionFor(motion: MotionTraits, reduced: boolean): Transition {
  if (reduced) {
    return motion.reducedMotion === 'instant'
      ? { duration: 0 }
      : { duration: Math.min(0.15, motion.durationMs / 1000), ease: 'linear' };
  }

  if (motion.language === 'spring') {
    // A spring reads as springy in a way no cubic-bezier does. Damping is kept
    // high enough that the overshoot never obscures the content underneath, and
    // stiffness tracks the branch's own duration so the toolbar's tempo control
    // still has an effect on the one language that ignores `duration`.
    return {
      type: 'spring',
      stiffness: Math.round(28_000 / Math.max(120, motion.durationMs)),
      damping: 20,
      mass: 0.9,
    };
  }

  // Through the ladder rather than off `durationMs` directly. The two are the
  // same number by construction — `hero` is the class the branch's own tempo
  // anchors — but reading it from the ladder is what keeps the anchor a single
  // decision instead of one that has to be remembered in two places.
  return {
    duration: roleDuration(motion, 'hero') / 1000,
    ease: easingPairFor(motion).enter,
  };
}

/**
 * The transition for something leaving.
 *
 * Accelerating curve, 70% of the matching enter, and never a spring: a spring's
 * value is its settle, and nothing that is on its way out has anything to
 * settle into. Under `instant` reduced motion this is a hard cut, which is what
 * that preference asks for.
 */
export function exitTransitionFor(
  motion: MotionTraits,
  reduced: boolean,
  role: MotionRole = 'hero',
): Transition {
  if (reduced) {
    return motion.reducedMotion === 'instant'
      ? { duration: 0 }
      : { duration: Math.min(0.1, motion.durationMs / 1400), ease: 'linear' };
  }

  return {
    duration: (roleDuration(motion, role) * EXIT_DURATION_RATIO) / 1000,
    ease: easingPairFor(motion).exit,
  };
}

/**
 * The transition for a state change that happens in place.
 *
 * Neither an arrival nor a departure — a chip filling in, an indicator sliding
 * between tabs — so it takes the emphasized curve rather than either
 * directional one. That is the whole reason M3 publishes three.
 */
export function stateTransitionFor(
  motion: MotionTraits,
  reduced: boolean,
  role: MotionRole = 'state',
): Transition {
  // `cut` is a claim about the branch, not a speed: a direction whose whole
  // argument is that nothing interpolates cannot slide its own tab indicator.
  if (reduced || motion.language === 'cut') return { duration: 0 };
  return {
    duration: roleDuration(motion, role) / 1000,
    ease: EASING.emphasized,
  };
}

/**
 * The transition for a control answering a click.
 *
 * Shorter than the entrance on purpose, and by the exact ratio the Design
 * Director measures — see `INTERACTION_DURATION_RATIO`.
 */
export function interactionTransitionFor(motion: MotionTraits, reduced: boolean): Transition {
  if (reduced) return { duration: 0 };
  return {
    duration: (motion.durationMs * INTERACTION_DURATION_RATIO) / 1000,
    ease: easingPairFor(motion).enter,
  };
}

/**
 * The transition for a supporting detail — an icon rotating, an underline
 * sweeping, a count starting.
 *
 * Starts fractionally after the move it accompanies and finishes inside it, so
 * it is felt as part of the same event rather than seen as a second one. A
 * secondary action that competes with the primary move is no longer secondary.
 */
export function secondaryTransitionFor(motion: MotionTraits, reduced: boolean): Transition {
  if (reduced) return { duration: 0 };
  const base = roleDuration(motion, 'state');
  return {
    duration: (base * 0.8) / 1000,
    delay: (base * 0.25) / 1000,
    ease: EASING.emphasizedDecelerate,
  };
}

/* -------------------------------------------------------------------------- */
/* Variants                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Entrance for a list or grid of sibling items.
 *
 * `distance` lets a caller scale the same language to the element's weight: a
 * hero moves further than a table row, because a hero that moves as little as a
 * table row is not doing anything.
 */
export function enterVariants(motion: MotionTraits, reduced: boolean, distance = 24): Variants {
  if (reduced) {
    return motion.reducedMotion === 'instant'
      ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
      : { hidden: { opacity: 0 }, visible: { opacity: 1 } };
  }

  const travel = travelFor(motion, distance);
  return {
    hidden: {
      opacity: 0,
      x: travel.x,
      y: travel.y,
      scale: travel.scale,
      rotate: travel.rotate,
      filter: travel.blur > 0 ? `blur(${travel.blur}px)` : 'blur(0px)',
    },
    visible: { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, filter: 'blur(0px)' },
    // Mirrored, and shorter: leaving retraces the arc it arrived on rather than
    // fading in place, which is what makes a removal read as the reverse of the
    // addition instead of as a separate, unrelated event.
    exit: {
      opacity: 0,
      x: travel.x * 0.5,
      y: travel.y * 0.5,
      scale: travel.scale,
      filter: 'blur(0px)',
    },
  };
}

/**
 * Stagger for a container whose children use `enterVariants`.
 *
 * Follow-through: the children keep arriving after the container has settled,
 * because nothing in nature moves as one rigid unit. Capped at 50ms per sibling
 * regardless of what the manifest asks for — past that the group stops reading
 * as one group and starts reading as a queue, and a six-item list becomes a
 * wait rather than an arrival.
 */
export function containerVariants(motion: MotionTraits, reduced: boolean): Variants {
  const stagger = reduced ? 0 : Math.min(50, motion.staggerMs) / 1000;
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren: stagger, delayChildren: 0 },
    },
    exit: {
      // Reversed and tighter on the way out. The last thing to arrive is the
      // first thing to leave, so the group collapses back along the path it
      // unfolded on instead of unfolding a second time.
      transition: { staggerChildren: stagger * 0.6, staggerDirection: -1 },
    },
  };
}

/**
 * Staging: how long the nth element in a choreographed group waits.
 *
 * One thing at a time carries the eye. This is deliberately coarser than the
 * sibling stagger — it separates *acts*, not items — and it caps out so a long
 * region never spends its whole entrance budget on the queue.
 */
export function stageDelay(motion: MotionTraits, reduced: boolean, index: number): number {
  if (reduced || motion.language === 'cut') return 0;
  return Math.min(0.32, (index * Math.min(50, motion.staggerMs) * 1.6) / 1000);
}

/**
 * Press feedback: anticipation, then squash, then release.
 *
 * `hover` stretches very slightly and lifts — the wind-up, so the control has
 * visibly reacted before it is asked to do anything. `press` squashes
 * non-uniformly, wider than it is tall, which is what mass looks like when it
 * meets a surface. Text is never the target: these go on the control's own box,
 * because deforming a glyph is illegible rather than expressive.
 */
export function pressVariants(motion: MotionTraits, reduced: boolean): Variants {
  if (reduced) return { rest: {}, hover: {}, press: {} };
  const deform = deformationFor(motion);
  const lift = motion.travel * 2;
  return {
    rest: { scaleX: 1, scaleY: 1, y: 0 },
    hover: { scaleX: 1 + deform * 0.3, scaleY: 1 + deform * 0.3, y: -lift },
    press: { scaleX: 1 + deform * 0.6, scaleY: 1 - deform, y: 0 },
  };
}

/**
 * The transition attached to `pressVariants`.
 *
 * A press has to land before the finger leaves the control, so it takes the
 * shortest class on the ladder. A spring language gets a real spring: the
 * release is exactly the overshoot-and-settle a curve cannot fake.
 */
export function pressTransitionFor(motion: MotionTraits, reduced: boolean): Transition {
  if (reduced) return { duration: 0 };
  if (motion.language === 'spring') {
    return { type: 'spring', stiffness: 520, damping: 24, mass: 0.6 };
  }
  return { duration: roleDuration(motion, 'press') / 1000, ease: EASING.emphasized };
}

/**
 * Hero entrance.
 *
 * Deliberately separate from `enterVariants`: the first thing on the page is
 * the one element allowed to be theatrical, and reusing the list-item variant
 * for it is most of why the old output looked like a form.
 */
export function heroVariants(motion: MotionTraits, reduced: boolean): Variants {
  const base = enterVariants(motion, reduced, motion.language === 'cut' ? 0 : 56);
  // The hero is the page's largest above-the-fold content and its likely LCP
  // element. `enterVariants`'s hidden state starts every entrance at
  // opacity: 0, which is fine for a staggered list item but leaves the
  // hero's real headline and CTA fully invisible for the whole entrance
  // duration on every single load. Keep the directional/scale/blur settle-in
  // — that's the "theatrical" part worth keeping — but never hide the
  // content itself behind it.
  return {
    ...base,
    hidden: { ...(base.hidden as Record<string, unknown>), opacity: 1 },
  };
}

/**
 * Overlay entrance for dialogs and drawers.
 *
 * The exit is not the entrance played backwards at the same speed: it drops the
 * travel to half and hands the timing to `exitTransitionFor`, so dismissing
 * something never costs as long as summoning it.
 */
export function overlayVariants(motion: MotionTraits, reduced: boolean): Variants {
  const scale = reduced || motion.language === 'cut' ? 1 : 1 - motion.travel * 0.05;
  const y = reduced || motion.language === 'cut' ? 0 : motion.travel * 14;
  return {
    hidden: { opacity: 0, scale, y },
    visible: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: reduced ? 1 : scale + (1 - scale) * 0.4, y: y * 0.5 },
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

/**
 * Counts from zero to `value` over the branch's own duration.
 *
 * A number that arrives already counted is a number nobody read. Returns the
 * final value immediately under reduced motion — the information is the number,
 * not the counting, so nothing is lost.
 */
export function countUp(
  value: number,
  motion: MotionTraits,
  reduced: boolean,
  onFrame: (current: number) => void,
): () => void {
  if (reduced || motion.language === 'cut' || typeof requestAnimationFrame !== 'function') {
    onFrame(value);
    return () => {};
  }

  const durationMs = Math.min(1600, motion.durationMs * 2.2);
  const start = performance.now();
  let frame = 0;

  const step = (nowMs: number) => {
    const progress = Math.min(1, (nowMs - start) / durationMs);
    // Ease-out cubic: fast enough to read as responsive, slow enough at the end
    // that the final digits are legible as they settle.
    onFrame(value * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1) frame = requestAnimationFrame(step);
  };

  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}
