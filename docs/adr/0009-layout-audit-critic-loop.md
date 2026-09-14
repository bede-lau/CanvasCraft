# ADR 0009 — Layout audit and the direction critic loop

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

A run produces a `ScreenSpec` plus three `VariantManifest` directions. Those
are checked for schema validity, manifest integrity, spec-context fit, and the
measured accessibility floors in `measureBranch` — but nothing checks whether
the manifest will *render well*. Real runs shipped directions with a region
left on the neutral fallback while a richer pattern was gate-approved, `roomy`
density on a working surface (content spread into empty bands), and glass
panels over a flat backdrop with nothing to blur.

Current (2026) guidance on AI-generated UI ("AI design slop", UI-craft
closed-loop methods) converges on the same shape: generate, then critique the
output against a concrete acceptance bar, fix the highest-impact issue, and
re-check — rather than trusting a single pass.

Two constraints shape the implementation:

- **The orchestrator must not render in the request path.** jsdom has no layout
  engine and a headless browser is too heavy and flaky for `POST /runs`. The
  branch template is also outside the pnpm workspace (ADR 0001), so it cannot be
  imported from the Fastify process.
- **The loop must never make a run worse.** A plausible-but-wrong revision that
  displaces a good direction is a regression.

## Decision

**A static layout-risk pass, plus an optional AI revision loop, as a new
`layout-audit` pipeline stage between `proposing-directions` and
`sandbox-launch`.**

- `findLayoutRiskIssues` (`packages/schema/src/layout-risk.ts`) is a pure
  function over `manifest` + `spec` + the gate-approved `selectionOptions`. It
  reads the choices known to render badly: a neutral-fallback selection when a
  richer option was approved for that region; `roomy` density on an
  `application` / `ai-native` surface; `glass` surface over a `flat` backdrop; a
  `flat` backdrop on a landing page; six or more top-level sections at `roomy`
  density. Every issue it reports is fixable by changing a manifest value, not
  by touching a component — which is exactly what the model can act on.
- The stage combines those issues with any failing `measureBranch` entry into a
  per-direction defect list.
- When the AI is configured and any direction has defects, `reviseDirections`
  (`apps/orchestrator/src/ai.ts`) runs. It is structurally identical to
  `proposeDirections`: strict structured output, one validation-repair attempt,
  and the compiler's `buildDirectionsFromAi` is the only thing that decides the
  result is usable. The prompt hands the model its three manifests and the
  issues each tripped, and asks it to change only what clears them. Up to two
  rounds.
- The measured findings are kept regardless of what the model returns, and a
  revised set that fails integrity or does not have exactly three directions is
  discarded in favour of the prior one. The stage finishes `degraded` (not
  failed) with the residual issues in its `detail`, which the run log shows.

Real-browser geometry measurement — true overlap, overflow, dead-band
detection — is deliberately **not** in this loop. It belongs in a Playwright
pass over the `branch-qa` audit matrix (the 12 deterministic archetype ×
direction combos), run before shipping rather than per request. That package is
the natural next increment; the jsdom `branch-qa` suite already anticipates it.

## Consequences

- One new `RunStage` (`layout-audit`), with `STAGE_LABELS` / `STAGE_ACTOR`
  entries and a trace row in the web client. The stage always runs; with no AI
  it reports what it found and proceeds.
- `reviseDirections` adds at most two extra model calls to a run, and only when
  the first pass produced a flawed direction.
- `ARCHETYPE_BRIEFS` and the direction prompt were also updated: the marketing
  and application briefs no longer ask for "roomy / generous vertical rhythm"
  (which was feeding the dead-space failure), and a "would a designer retouch
  this?" acceptance bar (`DIRECTION_ACCEPTANCE_BAR`) is now part of both the
  propose and revise prompts.
- `--section-gap` in the branch template is now bounded
  (`packages/branch-template/src/runtime/tokens.ts`): it was raw
  `spaceUnitPx × {14|20|28}`, which reached 110–160px between every section
  including near-empty ones. `--icon-size` has a 16px floor so a pattern that
  reserves adornment room as `calc(var(--icon-size) + …)` cannot collapse into
  its own text.

## Research sources

- smoothui.dev/blog/ai-design-slop — closed-loop "UI Craft": guardrails at
  generation time, a checkable acceptance bar, build → critique → fix → re-check.
- mindstudio.ai — the self-QA loop: an agent reviews its own output before it
  is shown.
- testquality.com — agentic QA: plan / act / verify with bounded regeneration.
- figma.com resource-library/web-design-trends, carbondesignsystem.com and
  atlassian.design spacing foundations, webpeak.org CSS/JS animation trends 2026.
