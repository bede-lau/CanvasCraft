# CanvasCraft — Architecture

> Status: living document. Update whenever a boundary or contract changes.
> Companion documents: `docs/checkpoint.md` (build progress, resume point) and
> `docs/adr/` (one file per irreversible decision).

---

## 1. What the system does

CanvasCraft takes a rough wireframe — drawn in-browser or uploaded as an image —
and produces **three live, comparable frontend prototype branches** that share
one product contract but differ deliberately in visual and motion treatment.

The trace the user sees is the trace the system actually executes:

```
Canvas Studio ──▶ Intent Compiler ──▶ Screen Spec (one, shared)
                                          │
                       ┌──────────────────┼──────────────────┐
                       ▼                  ▼                  ▼
              Variant Manifest A   Variant Manifest B   Variant Manifest C
                       │                  │                  │
                       ▼                  ▼                  ▼
                 Daytona sandbox    Daytona sandbox    Daytona sandbox
                 (Calm Trust)       (Playful Momentum) (Editorial Precision)
                       └──────────────────┼──────────────────┘
                                          ▼
                            Three-Panel Review Workspace
```

Component choices inside each manifest are grounded by the **Component
Intelligence Registry**: the AI generator turns a canvas region into a retrieval
request, Nosana returns visual-similarity candidates over curated thumbnails,
and local licence/compatibility metadata narrows them to a legal, compatible pick.

---

## 2. Repository shape

```
canvascraft/
├── apps/
│   ├── web/                 React 19 + Vite + Tailwind v4 client
│   └── orchestrator/        Node + TS credential-holding service
├── packages/
│   ├── schema/              Zod contracts shared by web + orchestrator
│   ├── registry/            Component Intelligence Registry (data + query)
│   └── branch-template/     The Vite starter copied into every sandbox
├── services/
│   └── nosana-clip/         FastAPI + CLIP image-embedding service (GPU job)
├── infra/
│   └── daytona-snapshot/    Dockerfile for the pre-baked sandbox image
├── scripts/                 Build/index/deploy/doctor scripts
└── docs/                    This file, checkpoint, ADRs
```

`packages/branch-template` is **outside the pnpm workspace on purpose**. It is
copied verbatim into sandboxes and must resolve its own dependencies from the
pre-baked snapshot, never from the host `node_modules`.

---

## 3. Layers and responsibilities

| Layer | Package | Owns | Must never |
|---|---|---|---|
| Client | `apps/web` | Canvas Studio, generation progress, three-panel workspace, Design Director UI | Hold any API key; call Nosana/Daytona/OpenAI directly |
| Orchestration | `apps/orchestrator` | Credentials, AI calls, Nosana matching, Daytona lifecycle, run state, SSE progress | Become a backend for the *generated* apps |
| Contracts | `packages/schema` | Canvas Doc, Screen Spec, Variant Manifest, Recommendation, Patch, Run event schemas | Import from web or orchestrator (leaf package) |
| Registry | `packages/registry` | Curated pattern records, licence gating, embeddings index, adapter snippets | Contain scraped whole libraries or Pro/AGPL material |
| Generated branch | `packages/branch-template` + AI-written files | One screen, local state, fixtures, motion presets | Contain fetch calls, auth, server routes, or a database |

**The credential boundary is absolute.** The browser talks only to the
orchestrator. The orchestrator talks to OpenAI, Nosana, and Daytona.

---

## 4. Core data contracts

All five live in `packages/schema` as Zod schemas, and every one is validated at
both the producing and the consuming edge. The Zod schemas are also the source of
the JSON Schemas handed to the AI generator for structured output, so a schema
change propagates into the model prompt automatically.

### 4.1 Canvas Document — `CanvasDoc`

The structured serialisation of the Canvas Studio, and **the source of truth
whenever it exists**. The rendered PNG is a secondary, corroborating input.

- `elements[]` — stamps with `kind` (closed vocabulary), `bounds`, `label`, `z`,
  and optional `intendedState`.
- `arrows[]` — `from`/`to` element ids plus an `interaction` drawn from a closed
  vocabulary (`open-modal`, `show-filtered-state`, `next-step`, …).
- `notes[]` — free-text intent, optionally anchored to an element.
- `strokes[]` — freehand marks, kept for the image render and for regions the
  compiler could not classify.
- `baseImage` — optional uploaded wireframe, stored as a data reference.

### 4.2 Screen Spec — `ScreenSpec`

The single shared product contract. Everything in it is **locked across all
three branches**: layout regions, element roles and labels, content meaning,
interactions, the set of local states, the accessibility baseline, and the
responsive contract. It also carries resolved ambiguity answers so an Approval
Card is never shown twice for the same decision.

### 4.3 Variant Manifest — `VariantManifest`

One per branch. Everything in it is **free to vary**: design tokens (palette,
typography, density, radius, elevation), control treatment, the selected registry
pattern per region, and the motion preset. It also carries `lineage` (parent spec
plus parent branches for a remix) and `provenance` (per-pattern source, URL,
licence, notice).

A manifest is valid only if every pattern it selects is compatible with the
single allowed primitive stack and permitted by the licence gate.

### 4.4 Recommendation — `Recommendation`

A Design Director proposal: `surface` (hierarchy / state-completeness /
accessibility / motion), rationale, the concrete manifest delta it would apply,
and enough information to revert it.

### 4.5 Patch — `PatchInstruction`

A scoped change to **one region of one branch**. Never a full regeneration.

---

## 5. Generation pipeline

Executed by the orchestrator, streamed to the client over SSE as typed
`RunEvent`s so the UI shows real activity rather than a spinner.

| # | Stage | Actor | Output |
|---|---|---|---|
| 1 | Serialise canvas | Client | `CanvasDoc` + PNG render |
| 2 | Deterministic pre-pass | Orchestrator | Stamp/arrow → role/interaction mapping, ambiguity candidates |
| 3 | Interpret intent | AI generator (vision) | `ScreenSpec`, validated against Zod |
| 4 | Approval cards | Client | Only for decisions that materially change the screen |
| 5 | Retrieval requests | AI generator | One semantic + visual query per significant region |
| 6 | Visual match | Nosana | Top-k candidate patterns with confidence per region |
| 7 | Licence + compatibility gate | Registry | Legal, stack-compatible candidate shortlist |
| 8 | Propose directions | AI generator | Three `VariantManifest`s, validated |
| 9 | Materialise branches | Orchestrator | Per-branch source files from spec + manifest |
| 10 | Launch | Daytona | Three sandboxes from the pre-baked snapshot, preview URLs |
| 11 | Review | Client | Three-panel workspace, Motion Audition, State-Lock |
| 12 | Refine | AI + Daytona | Trait Remix (new branch) or scoped patch (same branch) |
| 13 | Select champion | Orchestrator | Keep one sandbox, stop/archive the rest |

Stages 3, 5, and 8 are the only places the AI is allowed to invent structure.
Stage 9 is templated and deterministic: the model writes *component bodies and
tokens*, not project wiring.

---

## 6. Sponsor integrations

### 6.1 AI generator — provider-neutral, OpenAI-compatible (not a sponsor)

Configured by `OPENAI_BASE_URL` + `OPENAI_API_KEY`, so any compatible endpoint
works. Uses structured outputs against JSON Schemas derived from the Zod
contracts. Every response is re-validated with Zod before use; a validation
failure triggers one repair round-trip carrying the validation errors, then a
deterministic fallback.

### 6.2 Nosana — GPU visual component matcher

`services/nosana-clip` is a FastAPI service wrapping a CLIP image encoder,
containerised and posted to a Nosana GPU market. It exposes:

- `POST /embed` — image (base64 or URL) → embedding vector
- `POST /match` — query image + candidate ids → ranked similarity
- `GET /health`

The registry's thumbnails are embedded once and cached in
`packages/registry/data/embeddings.json`. At generation time the orchestrator
crops the canvas region, sends it to the Nosana endpoint, and receives ranked
candidates with confidence scores. Those scores surface in the UI as "Matching
visual UI patterns", and the winning pattern's provenance is recorded in the
manifest.

If the endpoint is unreachable the orchestrator uses the pre-computed local
index and **marks the match source as `local`** in the UI — degraded, and
visibly so, never silently faked.

### 6.3 Daytona — parallel live-branch engine

`infra/daytona-snapshot` builds an image with the Vite starter and its
`node_modules` already installed. That image is registered as a Daytona Snapshot,
and the Branch Manager creates three sandboxes from it in parallel. Each sandbox
receives the shared Screen Spec plus its own manifest and generated files, runs
the dev server on one fixed port, and yields a preview URL embedded in the
workspace iframe. On champion selection, non-champions are stopped and archived.

---

## 7. Generated-branch guardrails

Enforced by a validator that runs over every generated file set before it is
written to a sandbox:

1. React + Vite + TypeScript + Tailwind only.
2. No `fetch`, `XMLHttpRequest`, `WebSocket`, `axios`, or any network call.
3. No server routes, database clients, auth, or payment code.
4. One primitive stack per app: coss/Base UI plus ReUI Base UI variants.
   Radix and Base UI must never co-exist.
5. All data from local fixture files or component constants; interactions via
   React state.
6. Every animation respects `prefers-reduced-motion` and stays comprehensible
   without motion.
7. Required licence notices preserved in-sandbox wherever substantial
   third-party code is used.
8. Identical fixed preview port and identical state fixtures across branches.

Violations fail the branch with a visible status, not a silent repair.

---

## 8. State and persistence

There is no database. A run is a directory under `DATA_DIR`:

```
.canvascraft/runs/<runId>/
  canvas.json        CanvasDoc
  canvas.png         rendered canvas
  screen-spec.json   the shared contract
  branches/<branchId>/manifest.json
  branches/<branchId>/files/…      materialised source
  events.ndjson      append-only run log (replayable into the UI)
```

Append-only run logs mean a reload replays the exact generation trace, and a
restarted orchestrator resumes without losing the run.

---

## 9. Failure posture

| Failure | Behaviour |
|---|---|
| AI returns invalid structure | One repair round-trip carrying the validation errors, then a deterministic fallback spec |
| Nosana unreachable | Local embedding index; match source shown as `local` |
| A sandbox fails to build | That branch card shows the error and a static fallback render; other branches unaffected |
| Preview URL expires | Orchestrator re-requests a signed URL on iframe error |
| No pattern passes the licence gate | Neutral CanvasCraft fallback component, recorded as such in provenance |

The champion preview is never taken down by another branch's failure.

---

## 10. Accessibility and motion baseline

Applies to CanvasCraft's own shell *and* to every generated branch:

- Contrast: body text ≥ 4.5:1; large text and UI boundaries ≥ 3:1.
- Every interactive element is keyboard reachable with a visible focus ring.
- Touch targets ≥ 44×44 CSS px.
- Motion is semantic: it explains a state change or a spatial relationship.
  Decorative motion is not applied by default.
- `prefers-reduced-motion: reduce` collapses transforms to opacity or to nothing,
  and never removes information.
- Narrow-width layout is a first-class state, not an afterthought.
