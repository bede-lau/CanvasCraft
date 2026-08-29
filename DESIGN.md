# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-08-29
- Primary product surfaces: Canvas Studio, generation activity, three-panel review workspace, branch lineage rail, Design Director, responsive preview.
- Evidence reviewed: `CanvasCraft_PRD.md`, `docs/architecture.md`, `docs/checkpoint.md`, `docs/adr/0001-monorepo-and-package-boundaries.md` through `docs/adr/0008-spec-manifest-split.md`, `packages/schema/src`, and `packages/branch-template/src`.

## Brand
- Personality: A calm, exacting design studio that makes AI judgement visible and reversible.
- Trust signals: Live stage trace, explicit degraded states, source provenance, manifest lineage, readable sandbox status, and reversible changes.
- Avoid: Generic AI-chat styling, glass cards, saturated shell accents, marketing-page composition, hidden failures, and decorative motion.

## Product goals
- Goals: Turn a rough wireframe into three comparable interactive frontend directions; preserve a fixed shared product contract; make visual, motion, provenance, and state choices inspectable.
- Non-goals: A generated backend, persistent customer data, a general code editor, unrestricted third-party source export, or a freeform animation tool.
- Success signals: A user can create/import a canvas, generate exactly three directions, compare one interaction or state across them, inspect provenance, remix traits, patch one selected region, and select a champion.

## Personas and jobs
- Primary personas: Founders, product designers, product managers, and hackathon teams.
- User jobs: Express product intent spatially, obtain credible comparable prototypes quickly, review a design decision without losing product consistency, and demonstrate the process clearly.
- Key contexts of use: A focused desktop studio for authoring and review; a narrow-width mode for inspecting and presenting a branch.

## Information architecture
- Primary navigation: Studio, review controls, selected branch controls, Design Director controls, and theme setting.
- Core routes/screens: One application workspace that moves from Canvas Studio to Review Workspace; branch previews are contained rather than separate host routes.
- Content hierarchy: Current task and run status first, then the lineage rail and active preview, then supporting canvas context and decision controls.

## Design principles
- Make product sameness visible: Branch comparisons always show the shared spec, state, and interaction context beside the visual difference.
- Treat the shell as equipment: Chrome recedes so canvas artifacts, branch plates, and preview content are the luminous focus.
- Explain every automated decision: Recommendations, matches, licence decisions, and degraded integration paths are legible instead of implied.
- Tradeoffs: Compact professional density is preferred over promotional spaciousness; motion communicates state rather than decorates it.

## Visual language
- Color: Use the Graphite & Lamplight dark token system by default: void `#0A0B0F`, graphite `#14161C`, slate `#1D212A`, edge `#2A2F3B`, mist `#8B93A7`, chalk `#E8EBF2`, lamp `#F0B860`; retain the documented full light theme. Amber means live or awaiting attention only. Status colors are desaturated and functional.
- Typography: Bricolage Grotesque for sparse display labels, Geist Sans for UI and body, Geist Mono for generated identifiers and provenance.
- Spacing/layout rhythm: 4px base unit; constrained panels with no nested decorative cards; desktop review uses canvas / preview / director columns and collapses progressively on narrower displays.
- Shape/radius/elevation: Outer containers 12px, nested cards 8px, controls 6px, chips 4px. Hairlines and restrained elevation; no frosted-glass treatment.
- Motion: 120-160ms utility transitions, 180ms branch-switch crossfade, and event-driven lineage status changes. Honor reduced motion with static or opacity-only alternatives.
- Imagery/iconography: Canvas content and branch previews are primary media. Use Lucide icons for controls; avoid unrelated illustration.

## Components
- Existing components to reuse: Branch token/motion runtime and neutral/expressive pattern adapters in `packages/branch-template/src`.
- New/changed components: Canvas toolbar and accessible element list, generation activity strip, lineage rail, branch cards, preview frame, state and motion controls, recommendation cards, provenance inspector, remix controls, and champion action.
- Variants and states: Default, loading, empty, filtered, selected, modal, drawer, success, error, and narrow viewport states must be visible and comparable where relevant.
- Token/component ownership: Host-shell tokens remain in `apps/web`; generated-branch tokens derive solely from `VariantManifest` through `manifestToCssVariables`.

## Accessibility
- Target standard: WCAG 2.1 AA as the practical MVP floor.
- Keyboard/focus behavior: Every tool, branch, state, selection, dialog, and inspector action is keyboard reachable with a visible focus indicator. Canvas interactions have an accessible DOM-list equivalent.
- Contrast/readability: Body contrast at least 4.5:1; large text and boundaries at least 3:1; never use branch palette as shell control text.
- Screen-reader semantics: Use named landmarks, labels for every control, live status for generation changes, and readable equivalents for canvas/animated stacks.
- Reduced motion and sensory considerations: Do not use animation as the only way to convey a state change; disable cyclical motion and collapse transformations under reduced-motion preference.

## Responsive behavior
- Supported breakpoints/devices: Desktop studio at 1280px and above; tablet and narrow layouts down to 320px.
- Layout adaptations: The three-panel workspace collapses to a sequenced single-column workflow. Preview width control remains available and canvas element controls remain reachable without precision pointer input.
- Touch/hover differences: All primary targets are at least 44px and no information depends on hover.

## Interaction states
- Loading: Show specific generation stages and skeletons, never an unexplained spinner.
- Empty: Explain the missing canvas input or filtered preview content and provide a direct appropriate action.
- Error: Surface concrete validation, generation, match, or sandbox failure with a safe fallback where possible.
- Success: Use brief visible confirmation for applied recommendations, patches, remix creation, and champion selection.
- Disabled: Explain the prerequisite, such as a selected canvas element or a ready branch.
- Offline/slow network: Provide a clearly marked offline-demo path with locally generated branches and identify integrations as simulated/degraded.

## Content voice
- Tone: Clear, studio-like, concise, and candid about automation.
- Terminology: Use Canvas, Screen Spec, Branch, Design Genome, Design Director, provenance, and lineage consistently.
- Microcopy rules: Describe real state and consequence. Prefer direct actions such as "Apply recommendation" and "Select champion" to clever labels.

## Implementation constraints
- Framework/styling system: React 19, Vite, TypeScript, Tailwind v4, Base UI primitives, React Konva, Lucide, and Motion.
- Design-token constraints: Host shell uses only the documented theme tokens; generated branch presentation is driven by validated manifests.
- Performance constraints: Use one active embedded preview in the host and render deterministic local fallbacks for unavailable sandboxes.
- Compatibility constraints: No browser-held credentials or direct browser calls to AI, Nosana, or Daytona. Generated branches stay frontend-only with local fixtures.
- Test/screenshot expectations: Verify keyboard state transitions, canvas serialization, responsive layout, reduced-motion behavior, and a full offline demo flow.

## Open questions
- [ ] Decide whether a live configured integration run should replace or coexist with the offline demo fixture in the initial launcher. Owner: product. Impact: demo framing.
- [ ] Establish the exact Daytona SDK lifecycle calls against the configured snapshot before enabling a credentialed production path. Owner: platform. Impact: live sandbox launch.
