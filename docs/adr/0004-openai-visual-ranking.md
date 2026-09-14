# ADR 0004 - OpenAI vision ranking replaces the dedicated CLIP service

- Status: Accepted
- Date: 2026-08-30

## Context

CanvasCraft needs to select the most suitable UI pattern for each rough
wireframe region. The previous design used a separately deployed, GPU-backed
CLIP service. That added infrastructure, a second credential, and an additional
operational surface while the application already depended on OpenAI for visual
understanding and design direction.

## Decision

CanvasCraft uses OpenAI vision to rerank UI patterns after the registry gate has
produced a finite, approved candidate set.

`OPENAI_VISUAL_RANKER_MODEL` defaults to `gpt-5.6-luna`. The model receives
batched, low-detail labelled comparison sheets: a target wireframe region and
the approved candidate thumbnails. It must return strict JSON containing the
exact candidate IDs supplied for every region.

The model may only reorder gate-approved candidates. It cannot introduce a new
component, image, token, or route.

## Cost and reliability controls

- Comparison sheets batch up to eight regions per request.
- Image inputs use low detail.
- The output schema requires a complete candidate set for every ranked region.
- Malformed, incomplete, failed, or unavailable responses retain the
  deterministic local ranking.
- API-ranked output is labelled `matchSource: "openai"`; fallback output is
  labelled `matchSource: "local"`.

## Consequences

- The separate CLIP service, image-packaging script, and synthetic embedding
  index are removed.
- Deployments need only OpenAI and optional Daytona credentials.
- Visual ranking becomes easier to operate, trace, and tune through one
  configured AI provider.
- A live OpenAI key is still required to validate credentialed ranking outside
  the local fallback path.
