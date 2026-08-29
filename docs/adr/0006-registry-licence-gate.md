# ADR 0006 — Curated, licence-gated Component Intelligence Registry

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

CanvasCraft draws on four third-party UI sources with materially different
licences, and the PRD forbids calling any of it a "training dataset" or
ingesting whole libraries. It also caps the catalogue at 8–12 patterns for
hackathon reliability.

Licence positions, per the PRD's own register:

| Source | Position |
|---|---|
| React Bits | MIT **+ Commons Clause** — usable inside a product, may not be sold, sublicensed, or redistributed as components |
| Beautiful UI | MIT — copyright and permission notice must travel with substantial copied code |
| coss ui | Only the official MIT `apps/ui` registry content. The wider monorepo is mixed-licence and may contain AGPL material |
| ReUI | Only free/public MIT registry material, Base UI variants. Pro/Ultimate blocks, templates, and icons are excluded, and licensed material may not be used to build a generative tool |

## Decision

Implement a **versioned, hand-curated, source-attributed registry** of 8–12
records. Each record stores metadata and a small adapter, never a vendored copy
of a library. Enforce licence in code with a gate that every candidate must pass
before it can enter a Variant Manifest.

Each record carries: intent tags, source, source URL, component identifier,
stack variant, dependency list, licence id and notice text, motion intensity,
mobile risk, accessibility guidance, a neutral fallback, a thumbnail, and two
independent flags — `allowedForPreview` and `allowedForExport`.

**For this MVP `allowedForExport` is `false` for every third-party record.**
Source export is not a product surface. There is no code-download path.

## Rationale

Two flags rather than one, because "may run in a sandbox we operate" and "may be
handed to a user as source" are genuinely different permissions, and Commons
Clause turns exactly on that difference. Collapsing them into a single boolean
would be the bug that eventually ships the wrong thing.

The gate lives in code, not in a document, because the AI generator selects
patterns and cannot be trusted to have read the licence table. `ScreenSpec` →
candidate shortlist passes through the gate *before* the model ever sees the
options, so an unlicensed pattern is not a thing the model can choose.

A neutral CanvasCraft fallback exists for every intent tag, so a gate rejection
degrades the visual, never the functionality.

## Consequences

- Coverage target follows the PRD: 2–3 expressive motion, 3 AI-workflow/inspector,
  4–5 accessible primitives/state, 2–3 composed blocks.
- Adding a pattern is a reviewed act: the record must name a licence and a URL,
  and `pnpm registry:validate` fails the build if either is missing, if a notice
  is required and absent, or if `allowedForExport` is true for a third-party
  source.
- No runtime scraping and no whole-library prompt dumps. The model receives a
  compact candidate list, not source code.
- Where substantial copied code does end up in a sandbox, the branch
  materialiser writes the required notice into the sandbox project alongside it.
- The registry is versioned; manifests record the registry version they were
  generated against, so provenance stays meaningful as the catalogue changes.
