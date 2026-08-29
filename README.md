# CanvasCraft

> Turn a rough wireframe into three live, comparable frontend directions - then
> select, remix, and refine the one worth building.

CanvasCraft is an AI-assisted product-prototyping studio for the moment when a
team has an idea but not yet a convincing interface. A founder, designer, or
student can sketch a screen, add notes and interaction arrows, and turn that
rough intent into three polished, responsive frontend prototype branches that
preserve the same product requirements while deliberately exploring different
visual and motion directions.

This is not a one-shot "make me a UI" generator. CanvasCraft creates a shared,
validated product contract first, uses that contract to keep every option
comparable, and provides a review workspace where a team can understand why
each choice was made before selecting a champion.

## Why CanvasCraft matters

Early product work is full of avoidable ambiguity. A wireframe can communicate
what is on a screen, but it rarely communicates hierarchy, interaction states,
accessibility, motion, visual confidence, or how the experience should feel on
mobile. Teams either spend days translating that ambiguity into prototypes or
settle for a single AI-generated result that is hard to inspect, compare, or
trust.

CanvasCraft shortens that loop:

1. **Capture intent, not just pixels.** The in-browser Canvas Studio supports
   labelled UI stamps, arrows, notes, freehand drawing, image wireframes,
   selection, pan/zoom, undo/redo, and a readiness check.
2. **Create one shared Screen Spec.** An OpenAI-compatible multimodal AI
   interprets the canvas into a strict, schema-validated product contract:
   regions, roles, interactions, local states, accessibility baseline, and
   responsive behavior.
3. **Explore without changing the product.** CanvasCraft creates exactly three
   distinct Variant Manifests. They may vary in design tokens, pattern choices,
   density, and motion, but they remain locked to the same product intent.
4. **Review live alternatives side by side.** The studio presents desktop and
   mobile previews, state-lock controls, motion audition, provenance, and
   targeted recommendations so a team can make a decision with evidence.
5. **Keep the winner, learn from the rest.** A selected champion remains
   available for refinement, while the non-champion branches can be stopped and
   archived to protect compute and prevent prototype sprawl.

The result is a faster path from an idea to a reviewable decision: not one
opaque mockup, but three coherent, working directions with a clear lineage.

## Integrated sponsor impact

CanvasCraft is designed so each integrated platform changes the product outcome
in a visible, meaningful way. Integrations are not hidden API checkboxes; their
results appear directly in the generation trace, branch cards, provenance, and
review workflow.

### Nosana: visual intelligence grounded in the sketch

Nosana powers the visual-matching stage. In a credentialed live run, CanvasCraft
calls a containerized CLIP image-embedding service deployed on Nosana GPU
compute and sends each relevant canvas region to it alongside reviewed component
thumbnails. Nosana returns ranked visual-similarity candidates with confidence
scores, helping CanvasCraft select UI patterns that are visually appropriate for
the actual wireframe rather than merely textually plausible.

That matters because a checkout panel, analytics card, inbox list, or filter
drawer is defined by its visual structure as much as its label. The Nosana
match feeds a curated Component Intelligence Registry, where licence,
compatibility, mobile risk, accessibility guidance, and source provenance are
checked before a candidate can reach a prototype branch.

**Impact:** GPU-assisted matching makes design retrieval more faithful to the
user's visual intent, while the registry keeps the resulting prototypes
traceable and license-aware. The reviewer can see whether a match came from
Nosana or an explicitly labelled local fallback; CanvasCraft never fabricates a
live sponsor call.

### Daytona: three real prototypes, not three static mockups

Daytona is CanvasCraft's parallel live-branch engine. In a credentialed live
run, once the shared Screen Spec and three Variant Manifests are ready, the
Branch Manager creates three isolated Daytona sandboxes from a pre-baked Vite
snapshot. Each sandbox receives the same locked product contract plus its own
design direction, runs on a fixed preview port, and returns an embedded preview
URL for the review workspace.

The pre-baked snapshot removes dependency installation from the critical demo
path and makes the allowed frontend stack auditable. In practical terms, it
means a team can move from a rough sketch to three independently running,
responsive branches without waiting for three fresh environments to install
packages at the moment feedback is most valuable.

**Impact:** Daytona turns comparison into something real. Stakeholders can
interact with each direction, inspect mobile behavior and local states, choose a
champion, and automatically retire the branches that did not win. This reduces
prototype waste while giving teams a much stronger artifact for user testing,
demo feedback, and build planning.

### AI: structured intent compilation, not unbounded generation

CanvasCraft uses a provider-neutral, OpenAI-compatible AI endpoint to understand
the visual canvas and produce structured outputs. The AI is deliberately not
presented as a sponsor integration. Its role is to compile intent into a
validated Screen Spec, retrieval requests, three Variant Manifests, design
recommendations, and scoped patch instructions.

Every AI response is validated against Zod-derived JSON Schemas. Invalid output
gets one bounded repair attempt, followed by a deterministic fallback. This
keeps AI useful where interpretation and variation are needed while keeping
project wiring, safety boundaries, and comparison rules deterministic.

## What makes the project credible

- **Visible integration trace:** The interface shows the actual sequence:
  canvas interpretation -> Nosana visual matching -> Daytona branch launch ->
  review -> champion selection.
- **Honest degradation:** The studio works offline for rehearsal and local
  development. A local match, simulated preview, or stored manifest is always
  labelled `local` and is never presented as a live external result.
- **Comparable by design:** All branches share a single Screen Spec, so a
  reviewer compares visual and motion decisions rather than three unrelated
  interpretations of a prompt.
- **Responsible component intelligence:** The registry is small, hand-curated,
  source-attributed, and licence-gated. It uses metadata and adapters rather
  than scraping libraries or exporting third-party source.
- **Accessible from the start:** Generated branches honor keyboard access,
  focus visibility, contrast floors, touch-target sizing, responsive layouts,
  and reduced-motion preferences.
- **Protected credentials:** The browser never sees AI, Nosana, or Daytona
  secrets. The orchestration service owns those credentials and proxies live
  preview capabilities.

## End-to-end experience

```text
Sketch a wireframe
        |
        v
AI compiles a validated shared Screen Spec
        |
        v
Nosana ranks visual UI-pattern candidates from curated thumbnails
        |
        v
CanvasCraft applies licence and compatibility gates
        |
        v
AI produces three intentionally distinct Variant Manifests
        |
        v
Daytona launches three isolated, live frontend branches in parallel
        |
        v
Review, compare, remix, patch, and select a champion
```

## Built for real review

CanvasCraft supports the decisions teams need to make after generation:

- Compare the three directions through one switchable, embedded preview
  workspace with desktop and mobile widths.
- Lock the same fixture state across branches so differences remain meaningful.
- Audit motion and interaction feedback without losing accessibility context.
- Inspect per-region component provenance, confidence, source, licence position,
  and fallback status.
- Apply or revert Design Director recommendations.
- Make a scoped visual-pattern patch to one region, or remix traits into a new
  branch without regenerating the whole product.
- Preserve branch lineage and run events so the final choice is explainable.

## Run locally

CanvasCraft ships as an offline-first MVP, so the full studio can be rehearsed
locally before external credentials are available.

```powershell
pnpm install
pnpm dev
```

Open the web client at the Vite address printed by the command. In local mode,
demonstration data, visual matches, and branch lifecycle are clearly marked as
local/offline.

## Verify

```powershell
pnpm doctor
pnpm typecheck
pnpm test
pnpm registry:validate
pnpm build
```

## Credentialed live integrations

Copy `.env.example` to `.env` and configure an OpenAI-compatible endpoint, a
deployed Nosana CLIP endpoint, and Daytona credentials plus a registered
snapshot. These activate the live generation path. Browser code never receives
these credentials.

```powershell
pnpm nosana:build
pnpm snapshot:build
```

`pnpm nosana:build` prepares the GPU matcher image. `pnpm snapshot:build`
prepares the Daytona branch image; register it as a Daytona Snapshot and place
its identifier in `DAYTONA_SNAPSHOT`.

## Guardrails

- Generated branches are React/Vite/TypeScript frontend projects with local
  fixtures and local state only.
- Generated code cannot add network calls, server routes, auth, databases, or
  payment code.
- The Component Intelligence Registry is curated, source-attributed, and
  licence-gated. Third-party source export is disabled.
- A live run must visibly identify its integration results. A local fallback is
  always marked `local`, never presented as a sponsor call.

## Project documentation

- [Product requirements](CanvasCraft_PRD.md)
- [System architecture](docs/architecture.md)
- [Design contract](DESIGN.md)
- [Build checkpoint](docs/checkpoint.md)
- [Architecture decisions](docs/adr)
