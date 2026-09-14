import { useBranch } from '../runtime/branch-context';
import { useBackdropDrift } from '../runtime/scroll';

/**
 * The page ground.
 *
 * Three painted layers, all derived from colours the manifest already
 * validated, so a backdrop can never introduce a hue the contrast measurements
 * did not see:
 *
 * 1. `paint` — the multi-stop gradient field for this palette's backdrop
 *    treatment (see `backdropLayers` in tokens.ts).
 * 2. `drift` — a second, slowly counter-rotating conic field on the treatments
 *    that are supposed to feel alive. Its focal point is moved through two CSS
 *    custom properties rather than by transforming an element, so the whole
 *    backdrop stays one composited layer at viewport size instead of two.
 * 3. `veil` — a vertical scrim that keeps measured body contrast true no matter
 *    where the gradient has drifted to. Without it a `wash` can slide under a
 *    paragraph and take its contrast ratio with it.
 *
 * ── On WebGL ───────────────────────────────────────────────────────────────
 * An earlier revision rendered layer 2 with `@shadergradient/react`. It was
 * removed: the package imports `@react-three/fiber` without declaring it, so
 * making it build meant adding three WebGL packages and a ~1MB async chunk to
 * a template whose `npm ci && npm run build` runs inside a Daytona sandbox
 * nobody can attach a debugger to. A drifting multi-stop gradient is most of
 * the same picture for none of that risk. Recorded in DESIGN.md.
 * ───────────────────────────────────────────────────────────────────────────
 */
export function Backdrop() {
  const { manifest, reducedMotion } = useBranch();
  const { backdrop } = manifest.palette;
  const animated = backdrop === 'aurora' || backdrop === 'spotlight' || backdrop === 'wash';

  // Frozen, not removed, under reduced motion: the treatment is part of the
  // design, only the movement is a preference.
  useBackdropDrift(animated, reducedMotion);

  return (
    <div className="cc-backdrop" data-backdrop={backdrop} aria-hidden="true">
      <div className="cc-backdrop__paint" />
      {backdrop === 'aurora' ? <div className="cc-backdrop__drift" /> : null}
      {backdrop === 'grain' ? <div className="cc-backdrop__grain" /> : null}
      <div className="cc-backdrop__veil" />
    </div>
  );
}
