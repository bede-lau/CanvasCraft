# ADR 0008 — The Screen Spec / Variant Manifest split is the product

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

The PRD's central risk is that "three design directions" degrades into "three
unrelated mockups". Comparison is only meaningful if the three branches are
genuinely the same product. That property cannot be a prompt instruction; a
model asked nicely to keep things consistent will not.

## Decision

Split the generated contract in two, and make the split structural:

- **`ScreenSpec`** — produced **once** per run. Layout regions, element roles and
  labels, content meaning, interactions, the set of local states, the
  accessibility baseline, the responsive contract. Every branch receives the
  identical object, byte for byte.
- **`VariantManifest`** — produced **three times**, one per branch. Design tokens,
  control treatment, selected registry pattern per region, motion preset,
  lineage, provenance. Nothing else.

There is no field that appears in both. A property is locked or it varies, and
which one it is, is decided in the schema rather than at generation time.

## Enforcement

Three checks, all mechanical:

1. **Identity.** A SHA-256 of the canonicalised `ScreenSpec` is written into every
   manifest. The branch materialiser refuses to build a branch whose manifest
   hash does not match the run's spec.
2. **Coverage.** Every `region.id` and every `state.id` in the spec must be
   resolved by the manifest. A manifest that omits one fails validation; it
   cannot quietly drop a drawn flow.
3. **Containment.** The manifest schema has no field capable of expressing a
   layout change, a new interaction, or different content. Drift is not
   forbidden by policy — it is unrepresentable.

The generated files are then produced from `(spec, manifest)` by a deterministic
materialiser. The model writes component bodies and token values; it does not
write routing, state machines, or fixtures. Those come from the spec, identically
in all three branches.

## Trait Remix follows from this

Because a manifest is a flat set of independently valid trait groups — palette,
typography, density, shape, controls, motion, pattern selections — a remix is a
field-wise composition of two or three manifests, re-validated against the same
schema and the same spec hash. It produces a *new manifest*, then a new branch
built by the same materialiser.

This is why the PRD's rule that Trait Remix must never merge source files is
easy to honour: there is no code path that merges source files. Composition
happens where the data is structured, before any code exists.

## The scoped patch follows too

"Make this card calmer" resolves to a change in one region's entry in one
manifest, then a re-materialise of the files that region owns, then a
targeted write into that one sandbox. The spec is untouched, so the patch cannot
change the product — only its treatment. No full-page regeneration, and no
effect on any other branch.

## Consequences

- Ambiguity resolution belongs to the spec stage. Once answered, the answer is
  stored in the spec and never asked again, in any branch or any remix.
- Adding a genuinely new capability usually means adding a spec field, and that
  means deciding explicitly whether it is locked or variable. That decision is
  the review gate for every future feature.
- The spec hash makes stale branches detectable. Editing the canvas and
  regenerating produces a new spec and therefore a new hash; the old branches
  are visibly stale rather than silently mixed with new ones.
- Lineage is real data: `manifest.lineage` names the parent spec and, for a
  remix, the parent manifests and which trait group came from each. The lineage
  view renders stored fact, not a reconstruction.
