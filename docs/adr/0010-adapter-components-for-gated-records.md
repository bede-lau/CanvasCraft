# ADR 0010 — Adapter components for already-gated registry records

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

The registry (ADR 0006) held records for `beautiful-ui-thinking`,
`beautiful-ui-recommendation`, `beautiful-ui-task-list`, `coss-ui-dialog`, and
`coss-ui-empty-state` — gate-approved, `allowedForPreview: true`, offered to the
AI in every `selectionOptions` block. The direction generator selects them
regularly (`beautiful-ui-recommendation` and `coss-ui-dialog` show up across
most saved runs). But no adapter component existed for any of them, so
`resolvePattern` in the branch template fell straight through to
`ROLE_FALLBACKS` and rendered the neutral shell. The result the user saw:
"generated pages aren't using the component libraries."

The `reui-*` records are in the same state. Per a project decision to
deprioritise ReUI (its terms restrict use in a generative tool — ADR 0006),
those are left as-is for now; `reui-app-frame` and `reui-stepper` fall back to
the neutral shell, which is safe for their roles.

## Decision

**Write adapter components for the five Beautiful UI / coss ui records, in
`packages/branch-template/src/patterns/adapters.tsx`.**

- Each adapter is written from scratch in the template's own token-driven
  pattern style. No third-party source is copied; the component is *informed by*
  the referenced source's structure and interaction model, which is what the
  registry record's `source` and `license` already document. This keeps the
  "no scraped catalogue, no whole-library dumps" position of ADR 0006 intact and
  needs no new npm dependency in the Daytona snapshot.
- They register in a new `ADAPTER_PATTERNS` map, checked first in
  `resolvePattern` (before expressive / archetype / neutral).
- `packages/branch-qa` gains `adapterProbeBranches()` plus a render-audit block
  that forces each adapter to render and asserts it resolves to its own
  component rather than the neutral fallback — so a record can never again be
  gate-approved with no adapter behind it.

`react-three-fiber` is **not** adopted here: a 3D backdrop needs `three` +
`@react-three/fiber` in `packages/branch-template/package.json`, which is the
literal input to the Daytona snapshot and would force a snapshot rebuild. It is
recorded as a candidate for a later, separate change.

### Addendum (2026-09-11) — `reui-textarea`

A sixth adapter, `reui-textarea` (`Composer Textarea`), was added the same way.
ADR 0006's ReUI position excludes **Pro/Ultimate blocks, templates, and
icons** and bars *licensed* material from building a generative tool — it does
not exclude ReUI's free/public MIT registry primitives, which is why the
`reui-*` records already carry `MIT_NOTICE` and `allowedForPreview: true`. A
textarea is such a primitive, so the record goes through the gate exactly like
`reui-data-table` and `reui-stepper`.

The `pnpm dlx shadcn@latest add @reui/c-textarea-3` install path — which
vendors the component's source into the project — was **not** used: it
contradicts the "no vendored source, adapter only" rule above and would add a
dependency to the Daytona snapshot. `PromptTextarea` is CanvasCraft's own
token-driven code, informed by that component's structure (label, field, live
character count, send affordance).

It serves `form-field` / `neutral-block` as the multi-line composer, and
`search-control` as a correctly-adorned single-line input — the icon sits in
its own flex track, so it cannot overlap the placeholder, which is the class of
defect that prompted this work.

Regenerating thumbnails for the new record also wrote the five previously
missing `canvascraft-*` thumbnails, so `pnpm registry:validate` now passes
clean.

## Consequences

- `beautiful-ui-*` and `coss-ui-*` selections now render as intended. The
  layout-audit critic loop (ADR 0009) already nudges the generator toward these
  over the neutral fallback; this is what makes that nudge visible.
- Adding a registry record now carries an implicit obligation to add its
  adapter, enforced by the new branch-qa probe.
- `pnpm registry:validate` passes clean (the five previously missing
  `canvascraft-*` thumbnails were regenerated alongside the new record — see
  the addendum).
