import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { arcRatioFor, bezierEasing, easingPairFor } from './motion';
import type { MotionTraits } from './types';

/**
 * Scroll choreography.
 *
 * A generated page is judged largely on what happens as you move down it, and
 * the previous renderer did nothing at all: every region rendered at full
 * opacity in a grid and stayed there. This module supplies the three mechanisms
 * that change that — smoothed scrolling, one-shot section reveals, and parallax
 * layers — and it is the single place any of them can be switched off.
 *
 * Three rules hold throughout:
 *
 * 1. **Reduced motion removes movement, never content.** Every helper here
 *    resolves its targets to their final state immediately when `reduced` is
 *    true, so a reader who never sees an animation still sees the whole page.
 *    Nothing is hidden by a trigger that might not fire.
 * 2. **Nothing hijacks scroll position.** Lenis smooths the wheel; it never
 *    pins the reader in place or scrolls somewhere they did not ask to go.
 * 3. **The preview lives in an iframe.** The host sizes that frame and can
 *    resize it at any time, so every trigger refreshes on resize rather than
 *    trusting the measurements it took at mount.
 */

let registered = false;

function ensureScrollTrigger(): void {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

/**
 * Smoothed scrolling for the whole preview.
 *
 * Off under reduced motion, and off entirely for the `cut` language: a
 * direction whose whole argument is that nothing should be interpolated should
 * not interpolate the scroll either.
 */
export function useSmoothScroll(motion: MotionTraits, reduced: boolean): void {
  useEffect(() => {
    if (reduced || motion.language === 'cut') return;
    if (typeof window === 'undefined') return;

    const lenis = new Lenis({
      // Duration tracks the branch's own tempo, so the toolbar's motion control
      // is felt in the scroll as well as in the entrances.
      duration: Math.min(1.6, Math.max(0.6, motion.durationMs / 500)),
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      // Touch smoothing is left to the platform: overriding it fights the OS
      // momentum curve and reads as lag on every phone.
      smoothWheel: true,
      syncTouch: false,
    });

    let frame = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    // ScrollTrigger measures against the real scroll position, which Lenis now
    // owns. Without this the two disagree and reveals fire at the wrong offset.
    ensureScrollTrigger();
    const sync = () => ScrollTrigger.update();
    lenis.on('scroll', sync);

    return () => {
      cancelAnimationFrame(frame);
      lenis.off('scroll', sync);
      lenis.destroy();
    };
  }, [motion.durationMs, motion.language, reduced]);
}

/**
 * Reveals an element once, when it first enters the viewport.
 *
 * `once` is not a preference. A section that re-animates every time it scrolls
 * back into view turns re-reading a page into a slideshow, which is the most
 * common way scroll animation becomes hostile.
 */
export function useScrollReveal(
  motion: MotionTraits,
  reduced: boolean,
  options: { distance?: number; stagger?: boolean } = {},
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const { distance = 32, stagger = false } = options;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const targets = stagger
      ? Array.from(element.querySelectorAll<HTMLElement>('[data-reveal-item]'))
      : [element];
    if (targets.length === 0) return;

    // Reduced motion, `cut`, and a missing IntersectionObserver all land in the
    // same place: everything visible, immediately, with no trigger to fail.
    if (reduced || motion.language === 'cut' || typeof IntersectionObserver === 'undefined') {
      gsap.set(targets, { clearProps: 'all' });
      return;
    }

    ensureScrollTrigger();
    const travelPx = motion.travel * distance;
    const parallax = motion.language === 'parallax';
    // The same arc the Motion-driven entrances trace. Without it a scrolled
    // section slid straight down while the cards inside it curved in, which
    // read as two pages spliced together rather than one page with a language.
    const arcPx = travelPx * arcRatioFor(motion);
    // GSAP's own `power3.out` is a fixed curve, so every branch's scroll reveal
    // resolved at the same rate no matter what its signature easing said. The
    // branch's enter curve is the one the rest of the page is already using.
    const enterEase = bezierEasing(easingPairFor(motion).enter);

    const tween = gsap.fromTo(
      targets,
      {
        opacity: 0,
        x: arcPx,
        y: travelPx,
        scale: motion.language === 'spring' ? 1 - motion.travel * 0.04 : 1,
      },
      {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        duration: motion.durationMs / 1000,
        ease: motion.language === 'spring' ? 'back.out(1.4)' : enterEase,
        // Follow-through, capped: past ~50ms per sibling a group stops reading
        // as one group arriving and starts reading as a queue to wait through.
        stagger: stagger ? Math.min(50, motion.staggerMs) / 1000 : 0,
        scrollTrigger: {
          trigger: element,
          // 88% rather than 100% so a section has visibly begun resolving by the
          // time the reader's eye reaches it, instead of starting under them.
          start: 'top 88%',
          once: true,
        },
      },
    );

    // Mirrors the `targets.length === 0` guard above: `gsap.to()` on an empty
    // NodeList logs a "target not found" warning rather than silently
    // no-op'ing, so a `parallax`-language section with no
    // `[data-parallax-layer]` markup spammed the console on every load.
    const parallaxLayers = element.querySelectorAll<HTMLElement>('[data-parallax-layer]');
    const layers =
      parallax && parallaxLayers.length > 0
        ? gsap.to(parallaxLayers, {
            yPercent: -12 * motion.travel,
            ease: 'none',
            scrollTrigger: { trigger: element, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
          })
        : null;

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      layers?.scrollTrigger?.kill();
      layers?.kill();
      gsap.set(targets, { clearProps: 'all' });
    };
  }, [distance, motion.durationMs, motion.language, motion.staggerMs, motion.travel, reduced, stagger]);

  return ref;
}

/**
 * Keeps ScrollTrigger honest when the host resizes the preview iframe.
 *
 * Mounted once at the shell. Without it, switching the review workspace between
 * desktop and mobile width leaves every trigger measuring the old viewport, and
 * sections below the fold never reveal at all.
 */
export function useScrollRefresh(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof ResizeObserver === 'undefined') return;
    ensureScrollTrigger();

    let queued = 0;
    const refresh = () => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(() => ScrollTrigger.refresh());
    };

    const observer = new ResizeObserver(refresh);
    observer.observe(document.documentElement);
    window.addEventListener('resize', refresh);

    return () => {
      cancelAnimationFrame(queued);
      observer.disconnect();
      window.removeEventListener('resize', refresh);
    };
  }, [enabled]);
}

/**
 * Drifts the aurora and spotlight backdrops.
 *
 * Written as CSS custom properties rather than transforms so the backdrop stays
 * one painted layer: moving a real element behind the page would create a
 * compositing layer the size of the viewport on every branch that uses one.
 * Frozen — not removed — under reduced motion, so the treatment survives.
 */
export function useBackdropDrift(active: boolean, reduced: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    if (!active || reduced) {
      root.style.setProperty('--aurora-x', '22%');
      root.style.setProperty('--aurora-y', '10%');
      return;
    }

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      root.style.setProperty('--aurora-x', `${22 + Math.sin(t / 11) * 14}%`);
      root.style.setProperty('--aurora-y', `${10 + Math.cos(t / 9) * 8}%`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced]);
}
