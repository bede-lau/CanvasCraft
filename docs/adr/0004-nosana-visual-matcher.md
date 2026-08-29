# ADR 0004 — Nosana runs a real CLIP matcher; the local index is the degraded path

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

The PRD requires Nosana to have a *visible, meaningful role*: a GPU-backed
visual component matcher that returns similarity candidates for a sketched
region against curated component thumbnails. It explicitly rejects treating a
sponsor API as a hidden checkbox.

Honest tension: 12–16 CLIP embeddings and one query image is not a workload that
needs a GPU. Pretending otherwise would be dishonest engineering.

## Decision

Deploy a real containerised **CLIP image-embedding service** (`openai/clip-vit-base-patch32`
via `transformers`, FastAPI) to a Nosana GPU market, and call it from the
orchestrator during generation. Keep a **pre-computed local embedding index**
(`packages/registry/data/embeddings.json`) as an explicitly-labelled degraded
path, not as a silent substitute.

The service exposes `POST /embed`, `POST /match`, and `GET /health`.

## Rationale on the GPU question

The GPU is not load-bearing for 16 thumbnails, and the architecture says so
plainly rather than inventing scale. What the GPU job genuinely provides is:

- **Cold-start-free inference during a live demo.** Loading CLIP weights on a
  cold CPU host costs seconds inside the generation critical path.
- **A single embedding authority.** Query crops and registry thumbnails must be
  embedded by the identical model build, or cosine similarity between them is
  meaningless. A deployed service guarantees that; two local environments do not.
- **A real path to the catalogue actually growing.** The registry is capped at
  8–12 patterns for hackathon reliability (PRD §6), not by any property of the
  matcher.

This is a real integration used for a real reason. It is not claimed to be a
performance necessity at current catalogue size.

## Degraded path rules

1. Local index is used only when the endpoint is unreachable or unhealthy.
2. Every match result carries `matchSource: 'nosana' | 'local'`.
3. The UI renders that distinction visibly on the match card and in provenance.
4. The run log records the reason for the downgrade.

Silently substituting local results while showing a Nosana badge would be
fabricating a sponsor integration. It is prohibited.

## Consequences

- The registry indexer must be able to produce embeddings both ways, and both
  must use the same model id and preprocessing. The model id is written into
  `embeddings.json` and checked at query time; a mismatch forces a re-index
  rather than a bad comparison.
- The container must be `linux/amd64`, bind `0.0.0.0`, and keep its process
  alive for the job's lifetime.
- The image is published to Docker Hub, since Nosana pulls a publicly
  addressable image.
- Job posting requires a funded Solana wallet (SOL for fees, NOS for compute).
  This is human setup and is documented in `README.md`.
- The exposed endpoint's lifetime is bounded by the job timeout. The
  orchestrator treats endpoint loss as a downgrade, never as a run failure.
