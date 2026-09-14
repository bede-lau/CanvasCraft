import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import gsap from 'gsap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StateKind } from '@canvascraft/schema';
import { PreviewRuntime } from '../../branch-template/src/App.tsx';
import { BranchProvider } from '../../branch-template/src/runtime/branch-context.tsx';
import { ScreenProvider } from '../../branch-template/src/runtime/screen-store.tsx';
import type {
  ScreenSpec as TemplateScreenSpec,
  VariantManifest as TemplateManifest,
} from '../../branch-template/src/runtime/types.ts';
import { adapterProbeBranches, auditBranches, type AuditBranch } from '../src/manifests.ts';

/**
 * The rendered-output audit.
 *
 * For every deterministic branch a run can ship — four archetypes, three
 * directions — this mounts the real template renderer against that branch's
 * manifest and, across the states a preview can be driven into, asserts the
 * three failure classes stay out:
 *
 *  1. the render does not throw and logs no React error or warning
 *     (a crashed component, invalid DOM nesting, a bad prop);
 *  2. every control has an accessible name and real semantics
 *     (the "interactability" class);
 *  3. nothing is still animating on a page nobody has interacted with
 *     (the "animates on load / flies off" class).
 *
 * What jsdom cannot see is pixel layout, so true overflow and truncation are
 * not measured here — the orchestrator's selection guard keeps the pattern
 * class that causes them (expressive motion in a scanned region) out of the
 * candidate list instead. A Playwright layout pass is the natural next step if
 * that guarantee needs to be positive rather than preventive.
 */

const STATES: StateKind[] = ['default', 'loading', 'empty', 'filtered', 'modal', 'narrow'];
const PREVIEW_CHANNEL = 'canvascraft:preview';

const branches = auditBranches();

let container: HTMLDivElement;
let root: Root;
let consoleErrors: string[];
const realError = console.error;
const realWarn = console.warn;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  consoleErrors = [];
  const capture =
    (kind: string) =>
    (...args: unknown[]) => {
      consoleErrors.push(`${kind}: ${args.map((value) => String(value)).join(' ')}`);
    };
  console.error = capture('error');
  console.warn = capture('warn');
});

afterEach(() => {
  console.error = realError;
  console.warn = realWarn;
  act(() => root?.unmount());
  container.remove();
  // A branch that leaves a tween running would otherwise bleed into the next.
  gsap.globalTimeline.getChildren(true, true, true).forEach((child) => child.kill());
});

function mount(branch: AuditBranch): void {
  const spec = branch.spec as unknown as TemplateScreenSpec;
  const manifest = branch.manifest as unknown as TemplateManifest;
  root = createRoot(container);
  act(() =>
    root.render(
      <StrictMode>
        <ScreenProvider spec={spec} motionPreset={branch.manifest.motion.preset}>
          <BranchProvider manifest={manifest} branchId={branch.manifest.id}>
            <PreviewRuntime />
          </BranchProvider>
        </ScreenProvider>
      </StrictMode>,
    ),
  );
}

async function drive(state: StateKind): Promise<void> {
  await act(async () => {
    window.postMessage({ channel: PREVIEW_CHANNEL, branchId: 'audit', payload: { type: 'set-state', state } }, '*');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function settle(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** aria-label / aria-labelledby / title / trimmed text, in that precedence. */
function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label');
  if (label && label.trim()) return label.trim();
  const labelledby = element.getAttribute('aria-labelledby');
  if (labelledby) {
    const text = labelledby
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
    if (text) return text;
  }
  const title = element.getAttribute('title');
  if (title && title.trim()) return title.trim();
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function interactabilityProblems(scope: HTMLElement): string[] {
  const problems: string[] = [];

  const controls = scope.querySelectorAll('button, [role="button"], [role="tab"], a[href]');
  for (const control of controls) {
    if (control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true') continue;
    if (!accessibleName(control)) {
      problems.push(`control with no accessible name: <${control.tagName.toLowerCase()} class="${control.className}">`);
    }
    if ((control as HTMLElement).style.pointerEvents === 'none') {
      problems.push(`control is click-dead (pointer-events:none inline): ${accessibleName(control) || control.className}`);
    }
    const tabindex = control.getAttribute('tabindex');
    if (tabindex !== null && Number(tabindex) < -1) {
      problems.push(`control has an invalid tabindex ${tabindex}: ${accessibleName(control) || control.className}`);
    }
  }

  for (const tablist of scope.querySelectorAll('[role="tablist"]')) {
    if (tablist.querySelectorAll('[role="tab"]').length === 0) {
      problems.push('a tablist renders no tabs');
    }
  }

  const dialog = scope.querySelector('[role="dialog"]');
  if (dialog) {
    if (dialog.getAttribute('aria-modal') !== 'true') problems.push('dialog is missing aria-modal="true"');
    const closer = [...dialog.querySelectorAll('button, [role="button"]')].some((element) =>
      /close|dismiss/i.test(accessibleName(element)),
    );
    if (!closer) problems.push('dialog has no labelled close control');
  }

  return problems;
}

describe('branch render audit', () => {
  it('covers every deterministic archetype direction', () => {
    expect(branches).toHaveLength(12);
    expect(new Set(branches.map((branch) => branch.archetype)).size).toBe(4);
  });

  describe.each(branches)('$label', (branch) => {
    it.each(STATES)('renders "%s" without a crash, a console error, or a dead control', async (state) => {
      mount(branch);
      await drive(state);
      await settle(50);

      expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);

      const preview = container.querySelector<HTMLElement>('.cc-preview');
      expect(preview, 'the branch produced no .cc-preview root').not.toBeNull();

      const problems = interactabilityProblems(preview!);
      expect(problems, `${branch.label} / ${state}\n${problems.join('\n')}`).toEqual([]);
    });

    it('is not still animating on a page nobody has touched', async () => {
      mount(branch);
      // Long enough for any legitimate Motion entrance (roles top out near
      // 600ms plus stagger) to have settled. Anything GSAP-driven still live
      // after this is a cycle or a mis-timed tween that started on mount.
      await settle(900);

      const live = gsap.globalTimeline
        .getChildren(true, true, true)
        .filter((child) => {
          if (!child.isActive()) return false;
          // An explicitly infinite loop — a marquee, a backdrop drift — is the
          // pattern's whole point, not a mount animation. A finite tween still
          // running on an untouched page is the "animates on load" bug.
          const repeats =
            typeof (child as { repeat?: unknown }).repeat === 'function'
              ? (child as unknown as { repeat: () => number }).repeat()
              : (child.vars as { repeat?: number } | undefined)?.repeat;
          return repeats !== -1;
        });

      expect(
        live.map((child) => (child.vars as { id?: string })?.id ?? child.constructor.name),
        `${branch.label}: ${live.length} finite animation(s) still running on load`,
      ).toEqual([]);
    });
  });
});

/**
 * The third-party adapters are gate-approved registry records the AI can pick,
 * but the deterministic audit branches above rarely select them. This forces
 * each one to render and holds it to the same bar — and checks it resolves to
 * its own component rather than silently falling back to the neutral shell.
 */
describe('third-party adapter render audit', () => {
  const probes = adapterProbeBranches();
  const rootSelector: Record<string, string> = {
    'beautiful-ui-thinking': '.cc-think',
    'beautiful-ui-recommendation': '.cc-recs',
    'beautiful-ui-task-list': '.cc-tasks',
    'coss-ui-dialog': '.cc-dlg',
    'coss-ui-empty-state': '.cc-emptyx',
    'reui-textarea': '.cc-composer',
  };

  it('covers every adapter', () => {
    expect(probes.map((probe) => probe.recordId).sort()).toEqual(Object.keys(rootSelector).sort());
  });

  describe.each(probes)('$label', (probe) => {
    it('renders without a crash, a console error, or a dead control, and is not the neutral fallback', async () => {
      mount(probe);
      await drive('default');
      await settle(50);

      expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);

      const preview = container.querySelector<HTMLElement>('.cc-preview');
      expect(preview, 'the probe produced no .cc-preview root').not.toBeNull();
      expect(
        preview!.querySelector(rootSelector[probe.recordId]!),
        `${probe.recordId} did not render its own component`,
      ).not.toBeNull();

      const problems = interactabilityProblems(preview!);
      expect(problems, `${probe.label}\n${problems.join('\n')}`).toEqual([]);
    });
  });
});
