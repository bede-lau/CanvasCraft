# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-09-06
- Primary product surfaces: Canvas Studio, generation activity, three-panel review workspace, branch lineage rail, Design Director, responsive preview, **and the generated branches themselves**.
- Evidence reviewed: `CanvasCraft_PRD.md`, `docs/architecture.md`, `docs/checkpoint.md`, `docs/adr/0001-monorepo-and-package-boundaries.md` through `docs/adr/0008-spec-manifest-split.md`, `packages/schema/src`, `packages/branch-template/src`, `apps/orchestrator/src/compiler.ts`.

---

## The pivot

This document previously described one design system and applied it to two very
different things: the CanvasCraft **shell** (the studio a designer works in) and
the **branches** (the webpages CanvasCraft generates). Its rules — "avoid glass
cards, marketing-page composition, and decorative motion", "hairlines and
restrained elevation", "120–160ms utility transitions" — were correct for the
shell and actively wrong for the branches.

The result was measurable. Every generated page rendered as hairline boxes on a
flat ground with an opacity-and-8px fade, regardless of what the user drew or
which of the three directions they were looking at. A landing page, a dashboard,
and a portfolio all came out as the same 2010 admin template, and the three
"directions" differed only in hue because the toolbar overwrote each direction's
motion with a single shared preset.

**The split is now explicit.** The shell keeps its old, deliberately quiet
rules — chrome should recede. The branches are held to the bar a person would
apply to a site they were paying for. Two sections below, and where they
disagree, the section that owns the surface wins.

What did not change: WCAG 2.1 AA, the reduced-motion contract, the shared Screen
Spec, and the rule that a branch can vary treatment and never product intent.

---

## Brand
- Personality: A calm, exacting design studio that makes AI judgement visible and reversible — and that ships output nobody would guess was generated.
- Trust signals: Live stage trace, explicit degraded states, source provenance, manifest lineage, readable sandbox status, and reversible changes.
- Avoid: Hidden failures, unexplained automation, and — in the shell only — marketing-page composition.

## Product goals
- Goals: Turn a rough wireframe into three comparable interactive frontend directions; preserve a fixed shared product contract; make visual, motion, provenance, and state choices inspectable.
- Non-goals: A generated backend, persistent customer data, a general code editor, unrestricted third-party source export, or a freeform animation tool.
- Success signals: A user can create/import a canvas, generate exactly three directions, compare one interaction or state across them, inspect provenance, remix traits, patch one selected region, and select a champion — **and would be willing to show any of the three to a client**.

## Personas and jobs
- Primary personas: Founders, product designers, product managers, and small product teams.
- User jobs: Express product intent spatially, obtain credible comparable prototypes quickly, review a design decision without losing product consistency, and demonstrate the process clearly.
- Key contexts of use: A focused desktop studio for authoring and review; a narrow-width mode for inspecting and presenting a branch.

---

# Part one — the generated branches

Owned by `packages/branch-template/src`. Driven entirely by a validated
`VariantManifest`; no branch has source of its own.

## Webpage archetype

The archetype is the first decision and the largest one. It is chosen once in
the canvas toolbar, shared by all three directions, and carried on the manifest
(`VariantManifest.archetype`) because the renderer only ever receives a
manifest. It selects the layout shell, the background treatment, the component
vocabulary, and the motion system. **The three directions then diverge within
it** — comparison happens inside an archetype, never across one.

| Archetype | Shell | Ground | Vocabulary | Motion |
| --- | --- | --- | --- | --- |
| `marketing` | Stacked full-bleed sections, 1180px measure, viewport-height hero | Aurora / wash / grain | Oversized display type, glass CTAs, stat count-ups, proof rows | Scroll-driven reveals, Lenis smooth scroll |
| `application` | Bento — 12 columns where region weight decides span, 1560px, railed aside | Spotlight / wash / flat | Panels with real elevation, dense tables with sticky headers, command-shaped controls | Mount-time entrance only; nothing re-animates on scroll |
| `portfolio` | Editorial, asymmetric, 1320px, wide media | Grain / spotlight | Large framed media, generous vertical air, restrained chrome | Parallax between foreground and ground |
| `ai-native` | Conversation — narrow centred measure, 1080px | Aurora | Glass panels, prompt-shaped inputs, thinking and streaming primitives | Cascade and shimmer, suggesting computation |

`application` deliberately opts out of scroll choreography
(`ARCHETYPE_LAYOUTS[...].scrollChoreography === false`). A section that resolves
into place is charming the first time and obstructive on the fiftieth, and a
tool is used for hours.

## Visual language

**Colour.** Twelve hand-tuned palettes — three per archetype, one per comparison
slot — in `ARCHETYPE_RECIPES` (`apps/orchestrator/src/compiler.ts`). Every one
is measured against the run's own WCAG floors by a compiler test, so a palette
that fails contrast fails the build rather than shipping a branch the Design
Director immediately flags. Backdrop treatments (`flat`, `wash`, `aurora`,
`grain`, `spotlight`) are derived entirely from the palette's own colours; a
backdrop can never introduce a hue the contrast measurements did not see.

**Depth.** Real, and derived from `form.elevation` and `form.surface`, which are
orthogonal: elevation is how far a panel sits off the page, surface is what it
is made of (`solid`, `glass`, `gradient`, `outline`). Shadow stacks are three
layers plus an inner light edge. Glass is behind `@supports (backdrop-filter)`
with an opaque colour underneath — `backdrop-filter` is the first thing a
browser drops under memory pressure, and a panel that vanishes when it does is a
bug, not a degradation. Glass is only ever paired with a backdrop worth blurring.

**Typography.** A modular scale from `typography.scaleRatio` and `baseSizePx`,
running from `--text-n2` to `--text-8`. Display copy gets its own tighter
leading (`--leading-display`), negative tracking, and `text-wrap: balance`. A
hero uses `clamp(2.4rem, 7.4vw, var(--text-8))`. Every section carries a small
tracked-out mono eyebrow derived from the spec — the cheapest single device that
makes a generated page read as authored rather than assembled.

**Rhythm.** Two separate budgets: `--space-*` for padding inside a component and
`--section-gap` for the air between sections. They scale on different curves,
because a roomy card in a cramped page still reads as cramped.

**Interaction states.** Hover has intent and a direction: cards lift and their
arrow travels, list rows slide toward the reader, table rows tint, primary
buttons gain a shadow step. All are removed under reduced motion.

## Motion

Motion has two independent axes, and conflating them is what flattened the old
output:

- **`motion.preset`** — the run's *tempo*. Locked by the toolbar, uniform across
  all three directions, so "calm" means one thing everywhere and Motion Audition
  compares mechanism rather than luck.
- **`motion.language`** — the direction's *mechanism*, and the axis the toolbar
  deliberately does not lock. `reveal` (sections resolve as you reach them),
  `cascade` (siblings arrive in sequence), `spring` (entrances overshoot,
  controls push back), `parallax` (layers separate against the scroll), `cut`
  (no travel at all; changes are carried by type and colour).

The three directions in a run must use three different languages. This is
asserted in `compiler.test.ts`, not merely intended.

**Two duration budgets.** `--duration` is the entrance choreography and may be
long. `--duration-fast` is the answer to a click and is 40% of it. The Design
Director measures exactly that derived number against a 300ms ceiling
(`interactionDurationMs` in `packages/schema/src/accessibility.ts`), so the
measurement and the pixels cannot drift apart. An entrance plays once per
section per visit; an interaction plays every time anyone touches anything.

**Implementation.** `runtime/motion.ts` (variants, transitions, count-up),
`runtime/scroll.ts` (Lenis smooth scroll, GSAP ScrollTrigger reveals, parallax
layers, backdrop drift). Reveals are `once: true` — a section that re-animates
every time it scrolls back into view turns re-reading into a slideshow.

## Reduced motion — the contract

`ScreenSpec.accessibility.requiresReducedMotionFallback` stays `true`, and it is
honoured on both the OS preference and the host's explicit override.

- Movement is removed. **Treatment is not.** A frozen aurora is still an aurora.
- Every scroll reveal resolves its targets to their final state *immediately*
  and registers no trigger, so nothing can be left at zero opacity by a trigger
  that never fires.
- Lenis is not instantiated. Backdrop drift is pinned to a fixed focal point.
- Count-ups jump to their final value: the information is the number, not the
  counting.
- Cyclical motion (the Card Swap stack) pauses, and its content stays exposed in
  DOM order.
- `motionIntensity: 'none'` in the toolbar is treated as an accessibility-shaped
  request, not a taste one: it collapses every direction to `language: 'cut'`,
  zero travel, zero stagger, and `reducedMotion: 'instant'`.

## Accessibility (branches)
- Target standard: WCAG 2.1 AA.
- Body contrast ≥ 4.5:1; large text and boundaries ≥ 3:1; the label on the primary action ≥ 4.5:1 against the accent. Measured per branch by `measureBranch`.
- Icon-only controls render at ≥ 44px. This constrains real token choices — the compact direction carries a 6px base unit precisely because a 4px one rendered 35px controls.
- Every control keyboard reachable with a visible focus indicator, in all three focus-ring treatments.
- Backdrops carry a scrim (`.cc-backdrop__veil`) so a drifting gradient can never take a paragraph's measured contrast with it.
- Animated stacks expose the same records in DOM order for assistive technology.
- Counted numbers are `aria-hidden` with the final value in a visually-hidden sibling.

## Third-party patterns
Registry records are metadata plus a CanvasCraft-authored adapter, never a
vendored copy. Preview-only; source export is disabled product-wide (ADR 0006),
which is what satisfies the Commons Clause on `mit-commons-clause` records.

---

# Part two — the CanvasCraft shell

Owned by `apps/web/src`. Unchanged in intent: this is equipment, and equipment
recedes.

- **Color:** Graphite & Lamplight dark tokens — void `#0A0B0F`, graphite `#14161C`, slate `#1D212A`, edge `#2A2F3B`, mist `#8B93A7`, chalk `#E8EBF2`, lamp `#F0B860`. Amber means live or awaiting attention only. Status colors desaturated and functional.
- **Typography:** Bricolage Grotesque for sparse display labels, Geist Sans for UI and body, Geist Mono for generated identifiers and provenance.
- **Spacing:** 4px base. Constrained panels, no nested decorative cards. Desktop review uses canvas / preview / director columns, collapsing progressively.
- **Shape:** Outer containers 12px, nested cards 8px, controls 6px, chips 4px. Hairlines and restrained elevation. **No frosted glass in the shell** — the branches use it, and the shell must not compete with the thing it is displaying.
- **Motion:** 120–160ms utility transitions, 180ms branch-switch crossfade, event-driven lineage status. Reduced motion collapses to static or opacity-only.
- **Imagery:** Canvas content and branch previews are the media. Lucide for controls.

### Design principles (shell)
- Make product sameness visible: comparisons always show the shared spec, state, and interaction context beside the visual difference.
- Treat the shell as equipment: chrome recedes so canvas artifacts, branch plates, and preview content are the luminous focus.
- Explain every automated decision: recommendations, matches, licence decisions, and degraded integration paths are legible instead of implied.
- Tradeoff: compact professional density over promotional spaciousness. In the shell, motion communicates state rather than decorating it.

### Information architecture
- Primary navigation: Studio, review controls, selected branch controls, Design Director controls, theme.
- Core routes: one application workspace moving from Canvas Studio to Review Workspace; branch previews are contained rather than separate host routes.
- Hierarchy: current task and run status first, then the lineage rail and active preview, then supporting canvas context and decision controls.

### Toolbar
Five locked axes, applied to every direction after generation: **page archetype**
(the consequential one — it selects the whole vocabulary), display font, body
font, button shape, and motion preset × intensity. Everything else — palette,
backdrop, density, radius, elevation, surface, button fill, input style, focus
ring, motion language — is free to vary, and is what makes three directions a
comparison.

### Offline branch simulation
`apps/web/src/components/BranchPreview.tsx` renders only when no Daytona sandbox
is serving the real branch; the frame bar labels it as a simulation and **the
iframe is always the source of truth**. It tracks the same visual axes as the
real renderer (backdrop, surface fill, elevation, motion language) rather than
pixel-matching it: a mock that reproduces the template exactly is a second copy
to keep in sync, and a mock that ignores those axes would tell the reviewer the
three directions look alike when they do not.

### Accessibility (shell)
- WCAG 2.1 AA. Body contrast ≥ 4.5:1, large text and boundaries ≥ 3:1. Never use a branch palette as shell control text.
- Every tool, branch, state, selection, dialog, and inspector action is keyboard reachable with a visible focus indicator. Canvas interactions have an accessible DOM-list equivalent.
- Named landmarks, labelled controls, live status for generation changes, readable equivalents for canvas and animated stacks.

### Responsive behavior
- Desktop studio at 1280px and above; tablet and narrow layouts down to 320px.
- The three-panel workspace collapses to a sequenced single-column workflow. Preview width control remains available; canvas element controls remain reachable without precision pointer input.
- All primary targets ≥ 44px; no information depends on hover.

### Interaction states
- **Loading:** specific generation stages and skeletons, never an unexplained spinner.
- **Empty:** explain the missing input or filtered content and offer a direct action.
- **Error:** surface concrete validation, generation, match, or sandbox failure with a safe path where one exists.
- **Success:** brief visible confirmation for applied recommendations, patches, remixes, and champion selection.
- **Disabled:** explain the prerequisite.
- **Offline/slow:** a clearly marked offline-demo path with locally generated branches; integrations identified as simulated or degraded.

### Content voice
- Clear, studio-like, concise, candid about automation.
- Terminology: Canvas, Screen Spec, Branch, Design Genome, Design Director, archetype, motion language, provenance, lineage.
- Microcopy states real state and consequence. "Apply recommendation", "Select champion" — not clever labels.

---

## Implementation constraints

- **Shell:** React 19, Vite, TypeScript, Tailwind v4, Base UI, React Konva, Lucide, Motion.
- **Branch template:** React 19, Vite, Tailwind v4, Base UI (accessible dialog/tabs), Motion, **GSAP + ScrollTrigger**, **Lenis**, Lucide, clsx. No workspace coupling: the template is copied verbatim into a sandbox and builds with `npm ci && npm run build && npm run preview`. It hand-mirrors the schema types in `runtime/types.ts` (ADR 0001) and those must be kept in sync by hand.
- **No WebGL.** An earlier revision used `@shadergradient/react` for the aurora ground. It was removed: the package imports `@react-three/fiber` without declaring it, so shipping it meant adding three WebGL packages and a ~1MB chunk to a template whose build runs inside a sandbox nobody can attach a debugger to. A drifting multi-stop CSS gradient is most of the same picture for none of that risk. Revisit only if a shader ground becomes a demo requirement.
- **Token constraints:** the shell uses only documented theme tokens; branch presentation is driven solely by `manifestToCssVariables`. No component in the branch template reads the manifest for styling.
- **Performance:** one active embedded preview in the host; deterministic local fallbacks for unavailable sandboxes; branch entry bundle stays around 500KB (168KB gzipped).
- **Compatibility:** no browser-held credentials, no direct browser calls to OpenAI or Daytona. Generated branches stay frontend-only with local fixtures.
- **Test expectations:** keyboard state transitions, canvas serialization, responsive layout, reduced-motion behavior, a full offline demo flow, per-archetype palette contrast, and three-distinct-motion-languages per run.

## Open questions
- [ ] Decide whether a live configured integration run should replace or coexist with the offline demo fixture in the initial launcher. Owner: product. Impact: demo framing.
- [ ] Establish the exact Daytona SDK lifecycle calls against the configured snapshot before enabling a credentialed production path. Owner: platform. Impact: live sandbox launch.
- [ ] Decide whether archetype should be inferable from the canvas (stamp mix, notes) with the toolbar as an override, rather than always chosen explicitly. Owner: product. Impact: first-run quality for users who never touch the toolbar.
