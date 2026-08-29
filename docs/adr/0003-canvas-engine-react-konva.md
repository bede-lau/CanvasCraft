# ADR 0003 — Canvas Studio on react-konva with custom shapes

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

The Canvas Studio must produce a **structured canvas document** that is the
source of truth for generation — typed UI stamps with bounds and labels,
arrows carrying a closed-vocabulary interaction, sticky notes, freehand strokes,
and an optional uploaded base image. It also needs pan/zoom, selection,
delete/undo, and a PNG render for the vision call.

Three credible engines: tldraw, Excalidraw, and a custom canvas on react-konva.

## Decision

Build custom shapes on **react-konva** (MIT), with our own `CanvasDoc` schema as
the serialisation format.

## Rationale

The deciding factor is that the structured document is a *product contract*, not
an export. Everything downstream — the deterministic pre-pass, the retrieval
requests, canvas-to-preview traceability, and the scoped patch flow — addresses
canvas elements by stable id and typed kind. An engine whose document model is
its own gives us a lossy translation layer at the exact point where fidelity
matters most.

Secondary but real: the PRD is unusually licence-strict, and spends a whole
section on provenance and allow-listing. tldraw's default licence requires a
visible watermark and paid removal, which sits badly in a product whose pitch
includes licence hygiene. Excalidraw is MIT but has no custom-shape API worth
the name, so typed UI stamps would become tagged rectangles — precisely the
lossiness we are trying to avoid.

react-konva costs more build effort for interactions that tldraw ships free.
That cost is bounded and one-off; the fidelity benefit compounds through every
later feature.

## Consequences

- We own pan/zoom, marquee selection, transform handles, snapping, undo/redo,
  and hit-testing. Undo/redo is a bounded command stack over `CanvasDoc`, not an
  engine feature.
- `CanvasDoc` ↔ Konva node mapping is 1:1 and explicit, so serialisation has no
  translation step and no unknown fields.
- PNG export is `stage.toDataURL()` on a deterministically composed export layer
  (base image + shapes + labels, no selection chrome), which keeps the image the
  vision model sees identical to what the user sees.
- Konva renders to a single `<canvas>` and is therefore invisible to assistive
  technology. This is a real accessibility gap and is addressed deliberately: a
  parallel DOM element list panel provides keyboard-navigable, screen-reader
  accessible access to every element, and every canvas action has an equivalent
  there. The canvas is the fast path, not the only path.
- react-konva's React 19 support requires attention to `konva`/`react-konva`
  peer versions; the pinned pair is recorded in `apps/web/package.json` and
  re-verified by `pnpm typecheck`.

## Alternatives rejected

- **tldraw** — best interaction quality and a genuinely good custom-shape API,
  rejected on the licence/watermark conflict with the product's own positioning.
- **Excalidraw** — MIT and instantly familiar, rejected because typed stamps
  cannot be represented faithfully.
- **Fabric.js / raw canvas** — same work as Konva without Konva's React
  reconciler and scene graph.
