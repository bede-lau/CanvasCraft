# CanvasCraft - Build Checkpoint

> **Read this first when resuming work.** This is the single honest progress
> record. Update it with the implementation and fresh verification evidence.

- **Last updated:** 2026-08-29
- **Spec:** `CanvasCraft_PRD.md` (authoritative)
- **Architecture:** `docs/architecture.md`
- **Design contract:** `DESIGN.md`
- **Decisions:** `docs/adr/`

## Locked decisions

| # | Decision | ADR |
|---|---|---|
| 1 | pnpm workspace monorepo; `branch-template` deliberately sits outside it | 0001 |
| 2 | AI generation uses a server-side OpenAI-compatible client and strict schemas | 0002 |
| 3 | Canvas Studio uses react-konva custom shapes | 0003 |
| 4 | Nosana provides visual matching; transparent local matching is the fallback | 0004 |
| 5 | Daytona runs a pre-baked branch-template snapshot | 0005 |
| 6 | The registry is curated, licence-gated, and never exports third-party source | 0006 |
| 7 | The host is a dark studio with a complete light theme | 0007 |
| 8 | Screen Spec is shared and locked; Variant Manifests carry variation | 0008 |

## Status

Legend: `DONE` · `WIP` · `TODO` · `BLOCKED`

### Foundation and contracts

| Item | Status | Notes |
|---|---|---|
| Workspace, TypeScript configuration, documented environment | DONE | `pnpm` monorepo with branch template intentionally separate |
| Architecture, PRD, ADRs, design contract | DONE | `DESIGN.md` captures the host design system |
| Environment preflight | DONE | `pnpm doctor` |
| Zod contracts and strict JSON Schema conversion | DONE | Canvas, Screen Spec, manifests, mutations, runs, SSE events, AI-facing schemas |
| Contract regression coverage | DONE | Validated Screen Spec/manifest invariants, remix boundaries, accessibility floors |

### Registry and canvas

| Item | Status | Notes |
|---|---|---|
| Curated pattern catalogue and licence gate | DONE | 12 reviewed metadata records; no third-party source is bundled |
| Local pattern query and transparent fallback | DONE | Semantic/role ranking always identifies itself as local |
| Thumbnail and local-index build commands | DONE | Current vectors are a clearly labelled demo semantic index, not production CLIP embeddings |
| Canvas Studio | DONE | Stamps, image base layer, drawing, erasing, notes, labelled arrows, pan/zoom, undo/redo, selection, PNG export |
| Canvas integrity and readiness checks | DONE | Blocks generation until the structured canvas is valid |

### Offline-first orchestration

| Item | Status | Notes |
|---|---|---|
| Fastify bootstrap, credential boundary, append-only run store | DONE | Browser receives no service credentials or Daytona preview tokens |
| Typed SSE replay and run persistence | DONE | Artifacts persist beneath `.canvascraft/runs/<id>` |
| Deterministic Screen Spec compiler | DONE | Stamps, notes, and arrows become a shared validated product contract |
| Exactly three valid directions | DONE | Shared spec hash, exact one-pattern-per-region validation, and materially distinct direction validation |
| Director mutations | DONE | Recommendation apply/revert, trait remix, scoped compatible-pattern patch, champion selection |
| Live AI interpretation and direction adapter | DONE | Server-side OpenAI Responses uses strict Screen Spec and three-Variant Manifest schemas, with one bounded structural repair and deterministic fallback |
| Live Nosana visual ranking adapter | DONE | The orchestrator sends rendered region and registry thumbnails to `/match`; failures remain visibly local |
| Generated branch materialisation and validator | DONE | Every branch receives only generated Screen Spec and Variant Manifest modules; unsafe paths and network/server code are rejected |
| Live Daytona lifecycle | DONE | Creates private sandboxes, uploads generated modules, serves a fixed preview port, syncs mutations, and stops/archives non-champions |

### Review workspace and branch template

| Item | Status | Notes |
|---|---|---|
| Three-panel host workspace | DONE | Canvas trace, state-locked previews, desktop/mobile, accessibility/motion controls |
| Director and provenance surfaces | DONE | Per-region provenance, recommendations, scoped patch, trait remix and lineage |
| Offline review preview | DONE | Manifest-driven local preview; visibly labelled as a simulation |
| Standalone generated-branch template | DONE | Local fixtures, bridge, responsive states, reduced-motion support, no network behaviour |
| Live embedded Daytona previews | DONE | Serving branches use an orchestrator proxy that keeps their signed upstream capability server-side; stopped or failed branches retain the explicit local fallback |

### Verification

| Item | Status | Notes |
|---|---|---|
| Schema and registry tests | DONE | Fresh contract and registry suites pass |
| Web and orchestrator tests | DONE | Fresh suites pass, including AI-direction materialisation and branch guardrails |
| Python service syntax validation | DONE | `services/nosana-clip/main.py` compiles |
| Browser workflow and responsive smoke test | DONE | August 29, 2026: generated a credentialed AI run through the isolated Vite proxy, verified event-driven trace labels, state lock, interaction audition, scoped calmer-pattern swap, desktop layout, and mobile viewport |
| Credentialed OpenAI run | DONE | August 29, 2026: a local live run completed AI interpretation and three validated directions |
| Credentialed Nosana visual matching | BLOCKED | Requires a deployed Nosana service endpoint; local registry matching remains explicit |
| Credentialed Daytona launch | BLOCKED | Requires the registered Daytona snapshot name; local manifests remain explicit |

## Completion state

The app is implemented end to end. It is immediately usable in the local,
offline-first mode and keeps every degraded result visibly labelled. When the
required provider configuration is present, the same pipeline invokes the AI,
Nosana, and Daytona adapters instead of their deterministic local fallbacks.

Do not represent a local match, a simulated preview, or a stopped manifest as a
live sponsor call or live sandbox.

## External setup still required

The code can be fully exercised offline. The remaining credentialed production
paths require:

1. A deployed Nosana CLIP service URL and, if configured, its API key.
2. A registered `DAYTONA_SNAPSHOT` for the supplied Daytona account.
3. Docker Hub access only when rebuilding and publishing the snapshot or Nosana image.
