# ADR 0007 — Shell design language: "Graphite & Lamplight"

- **Status:** Accepted
- **Date:** 2026-08-29

## Context

CanvasCraft's own interface is the product's argument. It is a tool for
designers that generates design, so a templated shell would undercut the pitch
before the first branch renders. The chosen direction is a dark AI-native
studio, with a full light theme.

The obvious trap: "dark AI tool" has a default look — near-black ground, one
acid-green or vermilion accent, Inter everywhere, glass cards. It is everywhere,
and it says nothing about *this* product.

## The idea the interface is built on

A design studio comparing three directions does it on a **light table**: the
surface is dark and inert, and the artifacts are the only things that glow. That
is literally what CanvasCraft does — three prototypes of the same screen, lit
side by side under identical conditions.

So: the chrome is graphite and recedes. The canvas, the previews, and the branch
plates are the luminous objects. Emphasis is carried by *light*, not by a
saturated brand hue — which also leaves the hue space free for the three
branches to own their own colours without fighting the shell.

## Tokens

### Colour — dark (default)

| Token | Value | Role |
|---|---|---|
| `--cc-void` | `#0A0B0F` | App ground. Cold near-black, faint blue cast |
| `--cc-graphite` | `#14161C` | Panel surface |
| `--cc-slate` | `#1D212A` | Raised card / plate body |
| `--cc-edge` | `#2A2F3B` | Hairlines, borders |
| `--cc-mist` | `#8B93A7` | Secondary text, metadata |
| `--cc-chalk` | `#E8EBF2` | Primary text |
| `--cc-lamp` | `#F0B860` | The single accent. Warm lamp amber |
| `--cc-lamp-dim` | `#7A5C2E` | Accent at rest, borders on active elements |

Status colours are functional and desaturated so they read as instrument
readings rather than decoration: `--cc-live #6EA97F`, `--cc-warn #C99A4E`,
`--cc-fail #C4736B`.

Light theme inverts the metaphor honestly rather than by algorithm: the ground
becomes warm paper (`#F7F5F1`), the lamp accent darkens to `#9A6B18` to hold
4.5:1 on paper, and elevation is carried by hairlines instead of glow.

**One accent, used sparingly.** Amber marks what is *live* or *awaiting you* and
nothing else. If everything is amber, nothing is.

### Type

| Role | Face | Use |
|---|---|---|
| Display | **Bricolage Grotesque** | Screen titles, branch names, lineage labels. Variable weight and optical size; used at large sizes only |
| UI / body | **Geist Sans** | Every control, label, and paragraph |
| Utility / data | **Geist Mono** | Design Genome slugs, provenance, token values, sandbox ids, coordinates |

The mono face is doing real work, not adding texture. Anything that is a
machine-generated identifier is set in mono, so identifiers are visually
distinct from prose everywhere in the product.

Scale (rem): `0.6875 · 0.75 · 0.8125 · 0.875 · 1 · 1.25 · 1.625 · 2.25 · 3.25`.
Tight tracking on display sizes, normal on body, `+0.02em` on mono at small sizes.

### Space and shape

4px base. Radii nest correctly: outer container `12px`, inner card `8px`,
control `6px`, chip `4px` — an inner radius is always outer minus its padding,
so corners stay concentric.

## Signature element — the Lineage Rail

A horizontal rail across the top of the workspace showing the actual genealogy
of the run as physical plates on a light table:

```
  canvas ──▶ spec ──┬─▶ ▣ Calm Trust        ──┐
                    ├─▶ ▣ Playful Momentum  ──┼─▶ ▣ champion
                    └─▶ ▣ Editorial Precision──┘
                              └─▶ ▣ Remix A×C
```

Each plate is lit according to its real sandbox state, connectors are hairlines,
and the rail is the primary way to switch branches. It encodes lineage, status,
and provenance — three things the PRD requires be visible — in one object
instead of three panels. It is the one place the interface is allowed to be
memorable; everything around it stays quiet.

## Motion

- **Run start:** plates develop in sequence as their sandboxes come up — a short
  staggered opacity-and-lift, like a print appearing. It tracks real events, so
  the animation is a readout, not a flourish.
- **Branch switch:** 180ms crossfade with a 0.99→1 scale on the incoming plate.
- **Live sandbox:** a slow 4s breathing glow on the plate edge. This is the only
  looping animation in the product.
- **Everything else:** 120–160ms, `cubic-bezier(0.2, 0, 0, 1)`.

Under `prefers-reduced-motion: reduce`, the stagger becomes a single fade, the
breathing glow becomes a static lit edge, and no information is lost.

## Consequences

- Two variable web fonts plus one mono; self-hosted via Fontsource so the app
  has no third-party font request and works offline for the demo.
- The shell must never introduce a second accent hue. New status meanings use
  the existing functional trio or a shape/weight change.
- Because branch hues come from generated manifests, the workspace has to be
  legible against arbitrary palettes. Branch colour is confined to the plate's
  ink swatch and its lit edge; it never sets text or control colour in the shell.
- The light theme is not a stylesheet afterthought. Both themes are defined as
  token sets and every component is built against tokens only.
