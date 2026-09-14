# CanvasCraft - Architecture

> Status: living document. Update it whenever a boundary or contract changes.
> Companion documents: `docs/checkpoint.md` and `docs/adr/`.

## 1. System purpose

CanvasCraft turns a rough wireframe into three comparable frontend directions
that share one validated product contract while varying deliberately in visual
and motion treatment.

```text
Canvas Studio -> Intent Compiler -> Shared Screen Spec
                                        |
                    +-------------------+-------------------+
                    |                   |                   |
               Variant A           Variant B           Variant C
                    |                   |                   |
               Daytona sandbox     Daytona sandbox     Daytona sandbox
                    +-------------------+-------------------+
                                        |
                              Review Workspace
```

Component choices are constrained by the Component Intelligence Registry. The
registry creates approved candidates first; OpenAI vision can then rank those
candidates against the corresponding wireframe region. It cannot introduce a
new component or bypass the licence and compatibility gate.

## 2. Repository shape

```text
canvascraft/
|- apps/
|  |- web/                 React + Vite client
|  `- orchestrator/        Node + TypeScript service that holds credentials
|- packages/
|  |- schema/              Shared Zod contracts
|  |- registry/            Reviewed UI-pattern metadata and local fallback
|  `- branch-template/     Vite starter copied into generated branches
|- infra/
|  `- daytona-snapshot/    Dockerfile for the pre-baked sandbox image
|- scripts/                Snapshot, validation, and doctor scripts
`- docs/                   Architecture, decisions, and checkpoint
```

`packages/branch-template` is intentionally outside the pnpm workspace. It is
copied into sandboxes and resolves dependencies from the pre-baked snapshot,
not from the host workspace.

## 3. Trust boundaries

| Layer | Owns | Must never |
|---|---|---|
| Browser | Canvas capture, progress UI, review workspace | Hold credentials or call OpenAI/Daytona directly |
| Orchestrator | Request validation, OpenAI calls, registry gate, branch payloads, Daytona lifecycle | Become a backend for generated apps |
| Schema | Canvas, Screen Spec, manifests, event contracts | Depend on web or orchestrator packages |
| Registry | Reviewed records, provenance, licence gate, deterministic fallback | Ship third-party source libraries |
| Generated branch | One frontend screen, local fixtures, local interaction state | Make network calls or contain credentials |
| Daytona | Optional isolated preview runtime | Receive browser-held provider credentials |

The browser only communicates with the orchestrator. OpenAI and Daytona
credentials are read from server-only environment variables.

## 4. Generation pipeline

1. The browser serialises a structured canvas and renders a PNG.
2. The orchestrator validates payload size, data URLs, and canvas structure.
3. OpenAI interprets the canvas into a strict, schema-validated Screen Spec.
4. Deterministic logic creates retrieval requests and local candidate sets.
5. The registry gate rejects records that are not approved, compatible, or
   licence-permitted.
6. OpenAI vision receives labelled comparison sheets and reranks only the
   approved candidate IDs.
7. The orchestrator generates three validated Variant Manifests and fills the
   deterministic branch template.
8. Daytona optionally starts isolated previews for the generated branches.
9. The browser renders provenance, match source, previews, and the generation
   trace.

OpenAI has bounded authority. It interprets the canvas, proposes design
directions, and orders a known candidate set. It does not directly write project
wiring, approve source material, or add a dependency.

## 5. OpenAI visual ranking

`OPENAI_API_KEY` enables the OpenAI client. `OPENAI_BASE_URL` may point to an
OpenAI-compatible service.

- `OPENAI_VISION_MODEL` defaults to `gpt-5.6` for canvas interpretation.
- `OPENAI_TEXT_MODEL` defaults to `gpt-5.6-luna` for text tasks.
- `OPENAI_VISUAL_RANKER_MODEL` defaults to `gpt-5.6-luna` for visual ranking.

The ranker is deliberately separated from canvas interpretation so its cost and
latency can be tuned independently. It receives low-detail, labelled comparison
sheets in batches of up to eight regions. Each response must satisfy a strict
JSON schema and return the complete candidate set for each region.

Any API error, malformed response, unknown candidate ID, or incomplete result
retains the deterministic local ranking. The result is always explicit:

- `matchSource: "openai"` for a validated vision ranking.
- `matchSource: "local"` for the transparent fallback.

## 6. Registry controls

The registry is a curated, versioned set of metadata records. Each record
includes source attribution, licence information, compatibility requirements,
thumbnail data, accessibility guidance, and a neutral fallback.

The gate runs before visual ranking. This prevents an AI model from selecting a
record that has not been reviewed or that does not fit the generated branch
contract.

## 7. Daytona runtime

`DAYTONA_API_KEY` enables optional remote preview validation. The orchestrator
builds a branch from the shared Screen Spec and its Variant Manifest, uploads it
to a sandbox created from a pinned Daytona snapshot, and proxies preview access
without exposing signed runtime credentials to the browser.

When Daytona is unavailable, the browser retains a clearly labelled local
preview. A local preview is never presented as a running sandbox.

## 8. Failure posture

| Failure | Behaviour |
|---|---|
| Invalid AI structure | One bounded repair attempt, then deterministic fallback |
| OpenAI visual ranker unavailable or invalid | Retain registry-approved local ranking; report `local` |
| No record passes the registry gate | Use the neutral CanvasCraft fallback and record provenance |
| Daytona build or launch failure | Show the failed branch state; preserve other branches and local preview |
| Preview URL expires | Request a renewed signed URL through the orchestrator |

Every degraded mode is represented in the generation trace and response
contracts. The interface never labels a local result as an external one.
