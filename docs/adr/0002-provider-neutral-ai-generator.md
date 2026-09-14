# ADR 0002 — Provider-neutral OpenAI-compatible AI generator

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

The product keeps the AI provider boundary configurable while still requiring
three hard things reliably: reading a
wireframe image, emitting schema-valid structured output, and making design
judgements that survive being shown to a designer.

## Decision

Depend only on the **OpenAI `/v1` wire protocol**, not on any provider. A single
client is constructed from `OPENAI_BASE_URL` + `OPENAI_API_KEY`, defaulting to
`https://api.openai.com/v1`. Model ids are configuration, not code:
`OPENAI_VISION_MODEL` for canvas interpretation and manifest generation,
`OPENAI_TEXT_MODEL` for recommendations and patch instructions.

Every model call that produces structure uses **JSON Schema-constrained output**
derived from the Zod contracts in `packages/schema`, and every response is
re-validated with Zod before it is used.

## Rationale

The compatibility surface we actually need — chat/responses, image parts, and a
JSON-schema response format — is implemented by OpenAI, OpenRouter, Together,
vLLM, LM Studio, Ollama, and Anthropic-compat shims. Pinning to the protocol
rather than the vendor makes the swap a `.env` edit, which is also the honest
reading of "provider-neutral".

Deriving the JSON Schema from Zod rather than hand-writing it removes the
failure mode where the prompt schema and the validator drift apart. That drift
is the most common source of "the model returned something valid but the app
crashed".

## Handling invalid output

1. Call with the schema constraint.
2. Validate with Zod.
3. On failure, one repair round-trip that includes the *formatted Zod issues*
   and the offending payload.
4. On second failure, use the deterministic fallback (see below) and mark the
   stage `degraded` in the run log and in the UI.

Never retry blindly, and never silently coerce. A degraded stage that says so is
worth more in a demo than a stage that quietly invents.

## Deterministic fallbacks

- **Screen Spec:** the deterministic stamp→role/interaction pre-pass already
  produces a structurally complete spec; the model's job is to enrich it with
  labels, content meaning, and state selection. If the model fails, the pre-pass
  output is used as-is.
- **Variant Manifests:** three hand-authored token sets (Calm Trust, Playful
  Momentum, Editorial Precision) exist as literals. They are the fallback and
  also the few-shot examples given to the model.

## Consequences

- Providers with weak or absent JSON-schema mode degrade to the fallback more
  often. `scripts/doctor.mjs` probes the configured endpoint for schema support
  at startup and warns rather than failing at demo time.
- OpenAI strict structured-output mode forbids several ordinary Zod shapes
  (optional-without-nullable, open objects, some unions). `packages/schema`
  exports *two* views of each contract: the permissive internal schema, and a
  strict-mode-safe projection used only for the model. ADR 0008 covers the
  contract itself.
- Costs are bounded by calling vision once per generation, not once per branch.
