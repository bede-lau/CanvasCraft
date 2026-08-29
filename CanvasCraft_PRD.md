CanvasCraft

Product Requirements Document

Alternate name: WireLive
Stage: Hackathon MVP
Primary outcome: Three comparable, live frontend prototype branches from a rough sketch or browser canvas
Scope decision: Frontend-only generated branches with local mock state and state pages; no production backend
Prepared for: Coding-agent implementation handoff

Core product statement
CanvasCraft turns a rough, interactive wireframe into a small set of polished, clickable frontend prototype branches. Each branch preserves the same product intent while testing a distinct visual and motion direction, then runs live in isolated Daytona previews.

1. Product Summary

CanvasCraft is a visual prototyping agent for founders, product designers, PMs, and hackathon builders. Users begin with a napkin sketch, screenshot, or digital whiteboard. The product converts that intent into three responsive React/Vite frontend branches with a shared interaction model, polished visual hierarchy, local interaction states, and live embedded previews.

The differentiator is not generic sketch-to-code. CanvasCraft treats the sketch as product intent, retrieves source-attributed UI patterns instead of inventing everything from scratch, and lets an AI Design Director make its UX and animation decisions visible, comparable, toggleable, and editable across deliberate design branches.

Target Users

Founders who need a credible product prototype before engineering a backend.

Product designers and PMs who want to turn workshop wireframes into a testable visual concept.

Hackathon teams that need a striking, functional demo rather than a static landing page.

Value Proposition

CanvasCraft turns a sketch into a credible interactive prototype rather than a static screenshot or raw code dump. It pairs curated, source-attributed patterns with visible design judgement and low-risk local mock state, so users can compare coherent design directions instead of receiving one opaque generation.

2. Scope and Product Boundary

In Scope

A dual-mode canvas: upload a wireframe image or draw and annotate directly in the browser.

Structured UI stamps, arrows, and sticky notes that express layout and intended interactions.

Generation of one shared screen specification and three polished responsive frontend design branches, plus deliberate local UI states.

Live Daytona previews for the branches, embedded in the CanvasCraft workspace.

AI UX & Animation Co-Pilot with explainable recommendations, motion presets, and reversible changes.

Fair branch comparison, Motion Audition, State-Locked Comparison, and a constrained Trait Remix flow.

Curated component retrieval from the four specified sources, subject to the source policy in this PRD.

Explicitly Out of Scope

Databases, authentication, server APIs, payment processing, real user accounts, or persistent customer data.

A generated backend, Node API service, or production deployment pipeline. Node may be used only by Vite tooling.

Live third-party data, real external integrations, or background job processing in the generated app.

AI user trials, a build-truth panel, and a fullstack logic builder.

Multi-user canvas collaboration, a general code editor, or downloadable source-code export for third-party components.

A generic visual keyframe/timeline editor or an open component marketplace.

Ten concurrent live previews in the MVP. "Up to ten" is a queued/stretch capability, not the core demo experience.

Hard implementation boundary
Generated branches must be React + Vite + TypeScript frontend projects with Tailwind CSS. Their behaviour comes from local state, fixtures, and mocked content only. Do not generate server routes, database code, credentials, fetch calls, payment flows, or authentication. The host orchestration layer may create and stop sandboxes, but generated branches contain no backend.

3. Primary User Journey

Create or import. The user uploads a sketch or draws on the Canvas Studio with stamps, freehand marks, arrows, and notes.

Resolve intent. An OpenAI-compatible AI generator converts the canvas into a shared Screen Spec, surfaces only high-impact ambiguities, and selects component candidates.

Create design branches. The generator emits three compact Variant Manifests—for example, Calm Trust, Playful Momentum, and Editorial Precision—from that same Screen Spec.

Generate and run. Daytona launches an isolated frontend preview for each branch from the same prepared starter snapshot.

Compare, remix, or patch. In a three-panel workspace, the user auditions a shared interaction across branches, chooses a direction or safe trait remix, then patches only the selected branch.

4. Core Experience Requirements

4.1 Interactive Dual-Mode Canvas

The Canvas Studio must support two entry modes in the same workspace.

Canvas capability

Requirement

Upload mode

Accept a photo, screenshot, or hand-drawn wireframe. Show it as the canvas base layer so users can mark it up.

Draw mode

Provide freehand drawing, pan/zoom, selection, delete/undo, and a clean blank canvas.

UI stamps

Navbar, hero, card, button, input/search, table/list, tab, image/media, modal, and sidebar.

Interaction arrows

Connect source and destination elements and label the intended outcome, such as “open modal”, “show filtered state”, or “next step”.

Sticky notes

Capture intent in plain language, including content, tone, and motion direction, such as “premium calm motion” or “swap these insight cards”.

CanvasCraft should produce two artifacts from the studio:

A visual canvas image for vision understanding.

A structured canvas document containing stamps, bounds, labels, arrows, and notes.

The structured canvas document is the source of truth whenever it is available.

4.2 Intent Compiler and Ambiguity Cards

Map stamps and arrows to local UI changes: navigation, tabs, filters, modal/drawer, selection, carousel, validation, and toast feedback.

Create a Screen Spec for each element: semantic role, layout region, label, intended state, motion preference, and compatible candidates.

Use an Approval Card only for a decision that materially changes the screen, such as detail panel versus modal; save the answer to the Screen Spec and continue without re-asking.

4.3 Interactive Frontend and State Pages

Every branch must feel like the same real application while remaining fully frontend-only. Support the following local UI states where relevant to the drawn screen:

Default/populated content state with realistic seeded mock data.

Loading/skeleton state during a simulated transition.

Empty state with a clear action.

Input or selection state, including search/filter and active tabs.

Modal, drawer, or confirmation state triggered by a drawn interaction arrow.

Success and error/toast feedback states without a real network request.

A responsive narrow-width layout and a prefers-reduced-motion fallback.

The same state and interaction contract must render in every branch. A branch may change its visual treatment and motion personality, but may not silently remove or reinterpret a drawn flow.

4.4 Live Three-Panel Review Workspace

Panel

Purpose

Left: Canvas

Original wireframe, elements, and notes. A selected canvas element can be highlighted.

Centre: Branch Preview

One selected running Daytona frontend in an embedded iframe, with desktop/mobile width toggle and compact branch cards beneath it.

Right: Design Director

Component provenance, UX recommendations, motion presets, accessibility guardrails, and selected-element controls.

4.5 Canvas-to-Preview Traceability and Safe Patch

Selecting a canvas element highlights the corresponding preview area and its Design Director card.

The Design Director shows the selected pattern, source, why it fit, motion intensity, dependency, accessibility note, and fallback.

A user can request a local change such as “make this card calmer” or “turn this into a modal”. The agent updates only the affected component in the selected branch and re-runs that preview.

Keep the initial MVP to one screen plus local states; selected-region patches are preferable to multi-page generation.

4.6 Parallel Design Branches

CanvasCraft must create three named live branches from one shared Screen Spec. The point is controlled comparison, not ten unrelated mockups.

Locked across every branch

May deliberately vary by branch

Layout structure, content, interaction arrows, mock-data meaning, state pages, accessibility baseline, reduced-motion behaviour, and responsive contract.

Palette and typography, density, radius/elevation, button/input/icon treatment, compatible registry pattern, and semantic motion personality.

Each branch card exposes a concise Design Genome, such as Midnight palette · rounded controls · calm motion, plus sandbox status and component provenance.

Motion Audition runs the same supported trigger—such as opening a modal or advancing a card—across all three branches, so motion can be compared fairly.

State-Locked Comparison lets the user switch every branch to the same default, loading, empty, feedback, or narrow-width state.

Trait Remix safely combines approved traits, for example colour from branch A, controls from branch B, and motion from branch C. It creates a fresh Variant Manifest and branch; it must never merge arbitrary generated source files.

Show lightweight lineage: Base Screen Spec → three directions → optional remix → selected champion.

After a champion is selected, retain it and stop/archive the other sandboxes according to the host lifecycle policy.

5. AI UX & Animation Co-Pilot

The co-pilot is a senior-design layer, not an arbitrary aesthetic filter. It analyses hierarchy, touch targets, contrast, state coverage, readability, and interaction feedback, then proposes changes that the user may preview, apply, or revert. It is powered by a provider-neutral, OpenAI-compatible multimodal AI generator; this AI layer is not presented as a sponsor integration.

Co-pilot surface

Required behaviour

Hierarchy and composition

Improve visual grouping, page rhythm, primary actions, and information priority while preserving the user’s intent.

State completeness

Recommend missing loading, empty, feedback, or validation states for the generated frontend.

Accessibility guardrails

Check contrast direction, labels, focus visibility, keyboard reachability, and reduced-motion behaviour.

Motion presets

Offer fixed semantic presets: Calm, Playful, and Editorial. Apply Framer Motion/CSS transitions with clear purposes, not decoration everywhere.

Inspector controls

Let users switch a selected component between compatible candidates, tune a preset, and revert the local change.

Design directions

Explain what meaningfully distinguishes each branch while confirming the shared Screen Spec stays fixed.

Motion Audition

Replay the same interaction across the active branches to compare feedback, pacing, and reduced-motion fallback.

Trait Remix and lineage

Compose named, compatible traits into a validated Variant Manifest and show its parent branches.

Motion rule
Use Framer Motion or CSS as the normal implementation. React Bits Card Swap is an optional, allow-listed preview pattern only for a clear stacked-card, hero, or gallery intent. Do not create a freeform keyframe editor or an animation-builder product.

6. Component Intelligence Registry

CanvasCraft must not call the third-party code collection a “training dataset” or permanently ingest whole libraries. Implement a versioned, source-attributed Component Intelligence Registry. It retrieves a small set of compatible, license-cleared patterns at generation time and records provenance for every selection.

Registry Record

Each record should contain:

Intent tags, such as card-stack, dashboard-shell, search-control, modal, tabbed-view, loading-state, and AI-recommendation.

Source, source URL, component name/identifier, stack variant, dependency list, and license/notice.

Motion intensity, responsive/mobile risk, accessibility guidance, and a neutral fallback implementation.

Allowed-for-preview and allowed-for-export flags. For this MVP, raw third-party source export is disabled.

A screenshot/thumbnail and concise usage pattern, not an unrestricted dump of source libraries into the prompt.

Selection Flow

The OpenAI-compatible AI generator converts a canvas element into a semantic and visual retrieval request.

Nosana returns visual-similarity candidates from the curated registry; local metadata narrows the search by compatibility and license.

The generator creates one shared Screen Spec plus branch-specific Variant Manifests, selecting one compatible pattern per branch or a neutral CanvasCraft fallback if no source is suitable.

The selected pattern is adapted to CanvasCraft design tokens and recorded in a component manifest shown in the Design Director.

Daytona builds and runs the branches. The user sees progress, source provenance, live status, and the selected preview.

Every Variant Manifest must record its branch name, parent Screen Spec, token set, compatible component choice, motion preset, and lineage. All branches must stay within the same allowed primitive stack; design variety must not introduce incompatible component dependencies.

Curated Component Sources and Rules

Source

Use in CanvasCraft

Non-negotiable policy

React Bits

Expressive motion and UI references. Use Card Swap only for a deliberate stacked hero, insight deck, testimonial, or portfolio-card intent; include a reduced-motion and non-animated fallback.

MIT + Commons Clause. May be used within an app/product with notice, but components themselves must not be sold, sublicensed, or redistributed. Do not keep raw code in a general corpus or expose standalone source downloads.

Beautiful UI

CanvasCraft’s AI-native shell: Thinking, Task Rows, Tool Chips, Approval/Recommendation/Context Cards, Fine-tune Card, Diff Table, Sidebar, and Flowchart.

MIT. Curate a small, versioned set from the official site and retain the copyright and permission notice with any substantial copied code.

coss ui

Default accessible primitives: Group, input groups, dialogs, tabs, menus, empty/skeleton/progress/toast states, and toolbars.

Use only the official MIT-licensed apps/ui registry content. The wider COSS monorepo is mixed-license; do not use AGPL material.

ReUI

Richer composed frontend patterns: app shells, frames, steppers, timelines, file upload, cards, dashboard/marketing blocks, and state pages. Use Base UI variants only.

Use only public/MIT free registry material. Exclude Pro/Ultimate blocks, templates, and icons from the registry; licensed materials may not be used to train or build a generative tool.

Hackathon Catalogue Limit

Pre-curate 8–12 high-value patterns instead of live-scraping every catalogue. This keeps the agent reliable and makes source selection legible in the demo.

Suggested coverage:

2–3 expressive motion patterns.

3 AI-workflow/inspector patterns.

4–5 accessible primitives/state patterns.

2–3 composed frontend blocks.

7. Sponsor and Platform Integration Plan

Each sponsor must have a visible, meaningful role in the user flow. Do not treat a sponsor API call as a hidden checkbox. The AI generator is deliberately provider-neutral and must not be presented as a hackathon sponsor.

Integration

Product role

Implementation in MVP

What judges see

OpenAI-compatible AI generator (not a sponsor)

Design interpreter and Design Director.

Use a configurable OpenAI-compatible multimodal endpoint to read the visual canvas plus structured notes; create the shared Screen Spec, three Variant Manifests, code instructions, and UX/motion explanations. Validate structured output before generation.

“Interpreting wireframe”, “Proposing three directions”, and “Applying design direction” activity states.

Nosana

GPU-backed visual component matcher.

Run a UI-image embedding/similarity service against the small curated catalogue of component thumbnails. Return the top visual matches for a sketched region; local metadata and the AI generator use the candidates to make a compatible selection.

“Matching visual UI patterns” with top candidates and confidence.

Daytona

Parallel live-design branch engine and frontend execution environment.

Start from one prepared Vite/dependency snapshot, then create three independent sandboxes in parallel. Write the same shared Screen Spec and branch-specific manifests, run each branch on a fixed preview port, embed signed preview URLs, and stop/archive non-champions after selection. Queue additional directions only as a stretch capability.

A branch-status strip, three switchable live previews, shared-interaction comparison, and the winning branch’s live URL/status.

Integration principle
The demo should show the trace in order: the AI generator establishes one shared product contract → Nosana grounds visual choices in curated UI patterns → Daytona makes competing frontend directions independently live. This makes the sponsor integrations part of the core product outcome rather than peripheral tooling.

8. High-Level Implementation Shape

Layer

Responsibility

CanvasCraft client

React frontend with Canvas Studio, generation progress, three-panel review workspace, and Design Director.

Secure orchestration layer

A minimal service that holds the OpenAI-compatible AI endpoint configuration, Nosana, and Daytona credentials. It exists to orchestrate the product; it is not a generated-app backend.

Screen Spec

A compact shared contract for layout, elements, note intent, interactions, mock-state pages, accessibility, and responsive behaviour.

Variant Manifest

A validated branch definition: branch name, parent Screen Spec, design tokens, allowed component choices, motion preset, and lineage/provenance.

Component registry

Versioned JSON/metadata plus only permissible, curated snippets/adapters. No runtime scraping and no whole-library prompt dumps.

Daytona Branch Manager

Creates up to three sandboxes from the prepared snapshot, tracks preview status/signed URLs, and cleans up non-champion branches.

Generated branch

One React + Vite + TypeScript frontend in Daytona, generated from the identical shared Screen Spec plus a permitted Variant Manifest. Use Tailwind, Lucide, and Framer Motion/CSS with local fixtures and React state only.

Generated-Branch Guardrails

Pre-bake the stable Vite starter and allowed dependencies into a Daytona snapshot to reduce package-install and cold-start risk.

Support a deliberately narrow set of stamps and interaction types; unknown elements fall back to a clean neutral component.

Use one primitive stack: coss/Base UI plus ReUI Base UI variants. Do not mix Base UI and Radix variants in the same generated app.

Keep all data in local fixture files or component constants. Use React state for interactions.

Every animation must respect prefers-reduced-motion and remain understandable without motion.

For source-selected components, preserve required notices in the sandbox project where substantial copied code is used.

Use the same fixed preview port and state fixtures in every branch.

Build three live branches for the MVP; queue additional candidates rather than opening ten concurrent iframes.

Trait Remix composes manifests only. Never merge arbitrary generated source files from two sandboxes.

If a non-selected branch fails, show its status and a static fallback; keep the selected champion preview available.

9. Demo Story

The demo must visibly prove both product quality and sponsor use in under two minutes.

Time

What happens

0:00–0:20

Show a rough dashboard or product-wireframe canvas with a card stack, search/filter control, note, and arrow.

0:20–0:40

Click Generate. Show the AI generator interpret intent, Nosana return pattern matches, and Daytona create three live design branches from the prepared snapshot.

0:40–1:10

Reveal the branch cards and switch one live iframe among Calm Trust, Playful Momentum, and Editorial Precision. Demonstrate the same tab/filter or modal interaction in each.

1:10–1:35

Open the Design Director. Use Motion Audition or State-Locked Comparison to show the same interaction/state under three deliberate treatments, with provenance visible.

1:35–1:55

Create a Trait Remix—for example, Calm colour, Editorial controls, and Playful motion—then show its lineage and live branch status.

1:55–2:00

Select the champion and show Daytona retain its preview while the other branches are marked for cleanup.

10. MVP Acceptance Criteria

A user can draw a wireframe or upload an image, then add at least six supported stamp types, notes, and labelled arrows.

A configured OpenAI-compatible AI generator produces a validated Screen Spec and three valid Variant Manifests from the canvas input.

Generation produces three responsive React/Vite frontend branches that run inside Daytona and appear through a single switchable embedded preview.

Every generated branch includes the same at least four local interactive/state behaviours relevant to the sketch.

The Design Director displays at least three actionable UX/motion recommendations with apply/revert behaviour.

At least one component/pattern from each named source is represented in the curated registry or CanvasCraft shell, with clear license gating.

Nosana and Daytona are both called in the visible generation sequence and have a real role in the output.

Exactly three concurrent live branches come from one Screen Spec and obey the identical state, interaction, accessibility, and responsive contracts.

Branch cards visibly show a Design Genome, manifest lineage, sandbox status, and source provenance.

Motion Audition or State-Locked Comparison works across the branches in the MVP.

A Trait Remix creates a fresh validated manifest/child branch without source-code merging.

Canvas-to-preview selection and one local patch flow work without a full-page regeneration; the patch affects only the selected branch.

The branch manager can retain a selected champion and stop/archive the remaining branches.

The live prototype is usable on desktop and narrow width and respects reduced-motion settings.

11. Recommended Build Order

Build the Canvas Studio and serialise a simple structured canvas document.

Define the shared Screen Spec schema and deterministic mapping for the supported stamps/interactions.

Create the pre-baked Vite starter and Daytona snapshot with allowed dependencies and a fixed preview port.

Implement the provider-neutral OpenAI-compatible AI output schema for Screen Specs, Variant Manifests, recommendations, and patch instructions.

Create a fixed 8–12-item Component Intelligence Registry with source, license, and suitability metadata, then implement the Nosana visual-matching call against its pre-indexed thumbnails.

Build the Daytona Branch Manager: create three branches in parallel, track status/URLs, and clean up non-champions.

Build the three-panel review workspace, branch cards, Motion Audition, State-Locked Comparison, and visible agent-progress UI.

Add Design Director recommendation cards, fixed motion presets, Trait Remix, lineage, and selected-region patch flow.

Polish one rehearsed demo wireframe, pre-cache approved catalogue metadata, and keep a champion/static fallback ready before presenting.

12. Risks and Mitigations

Risk

Mitigation

Generation becomes unreliable

Limit the stamp vocabulary, registry, and interaction types; use a stable starter and one rehearsed demo input.

Design directions drift into different products

Lock the Screen Spec and validate the same interaction/state fixtures, accessibility rules, and responsive contract in every branch.

Sandbox quota or cold-start pressure

Pre-bake the Daytona snapshot, run only three live branches, and queue the rest rather than attempting ten concurrent sandboxes.

A branch fails to build or load

Show a clear branch status and safe fallback; keep the champion branch available and use one active iframe rather than a wall of previews.

Trait Remix becomes fragile

Compose only validated manifest fields; never merge arbitrary branch source files.

Preview URL expiry or iframe access breaks

Have host orchestration request/renew signed preview URLs and rehearse the embedded-preview path.

Component sources conflict

Use the COSS/Base UI stack as the primitive foundation, ReUI Base UI-only patterns, and CanvasCraft design tokens for normalisation.

License exposure

Use a provenance manifest and strict allow-list; exclude paid/AGPL/restricted source material and do not build a source-export product.

Preview build takes too long

Pre-bake the starter and dependencies; make changes via selected-component patching instead of project-wide rewrites.

Motion is excessive or inaccessible

Use semantic presets, Framer Motion/CSS by default, and reduced-motion/static fallbacks.

13. Source and License Register

The following sources informed the registry policy. The coding agent should re-check terms before any commercial release or catalogue expansion.

React Bits: Card Swap

React Bits repository and license

Beautiful UI component catalogue

Beautiful UI MIT license

coss ui Group documentation

coss ui repository and licensing

ReUI component catalogue

ReUI public repository

ReUI license boundary

Daytona snapshots

Daytona sandboxes

Daytona preview

Daytona limits