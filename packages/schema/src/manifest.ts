import { z } from 'zod';
import {
  BackdropTreatment,
  ButtonShape,
  GENOME_MAX_LENGTH,
  HexColor,
  LicenseId,
  MotionLanguage,
  MotionPreset,
  PageArchetype,
  PatternSource,
  Slug,
  SurfaceTreatment,
  type MotionIntensity,
  type RiskLevel,
  type SemanticRole,
} from './primitives.js';
import { MatchSource } from './registry.js';
import type { ScreenSpec } from './screen-spec.js';

/**
 * The Variant Manifest.
 *
 * Everything here is FREE TO VARY between branches. There is deliberately no
 * field capable of expressing a layout change, a new interaction, or different
 * content — drift is unrepresentable rather than merely discouraged. ADR 0008.
 *
 * The manifest is also the unit of Trait Remix: each trait group below is
 * independently valid, so composing groups from different branches yields a
 * manifest that is valid by construction. No source files are ever merged.
 */

/** Trait group: colour. */
export const PaletteTraits = z.object({
  name: z.string().max(60),
  background: HexColor,
  surface: HexColor,
  surfaceRaised: HexColor,
  border: HexColor,
  textPrimary: HexColor,
  textSecondary: HexColor,
  accent: HexColor,
  accentContrast: HexColor,
  positive: HexColor,
  critical: HexColor,
  /** Dark or light base. Affects the branch's own shadow and glow treatment. */
  scheme: z.enum(['light', 'dark']),
  /**
   * What sits behind the page. Lives in the palette group because it is made
   * entirely of these colours — the renderer derives every gradient stop from
   * `background`, `surfaceRaised`, and `accent` rather than inventing hues, so
   * a Trait Remix that takes this palette takes a coherent backdrop with it.
   */
  backdrop: BackdropTreatment,
});
export type PaletteTraits = z.infer<typeof PaletteTraits>;

/** Trait group: typography. */
export const TypographyTraits = z.object({
  /** CSS font stack for headings. Must resolve from the pre-baked snapshot. */
  displayFamily: z.string().max(200),
  bodyFamily: z.string().max(200),
  monoFamily: z.string().max(200),
  /** Ratio between adjacent steps of the type scale, e.g. 1.25. */
  scaleRatio: z.number().min(1.05).max(1.7),
  baseSizePx: z.number().min(13).max(18),
  displayWeight: z.number().int().min(300).max(900),
  bodyWeight: z.number().int().min(300).max(600),
  displayTrackingEm: z.number().min(-0.06).max(0.08),
  /** Unitless line height for body copy. */
  bodyLeading: z.number().min(1.2).max(1.9),
});
export type TypographyTraits = z.infer<typeof TypographyTraits>;

/** Trait group: density and shape. */
export const FormTraits = z.object({
  /** 4 or 8 px base unit. Drives every gap and pad in the branch. */
  spaceUnitPx: z.number().min(2).max(10),
  density: z.enum(['compact', 'regular', 'roomy']),
  radiusOuterPx: z.number().min(0).max(28),
  /** Inner radii are derived, so corners stay concentric. ADR 0007. */
  radiusStepPx: z.number().min(0).max(8),
  borderWidthPx: z.number().min(0.5).max(2),
  elevation: z.enum(['flat', 'hairline', 'raised', 'lifted']),
  /**
   * How a panel is filled. Orthogonal to `elevation`: elevation is how far a
   * panel sits off the page, this is what it is made of. Glass needs a backdrop
   * worth blurring, which is why the compiler pairs the two.
   */
  surface: SurfaceTreatment,
});
export type FormTraits = z.infer<typeof FormTraits>;

/** Trait group: control treatment. */
export const ControlTraits = z.object({
  buttonShape: ButtonShape,
  buttonFill: z.enum(['solid', 'tonal', 'outline', 'ghost']),
  inputStyle: z.enum(['outlined', 'filled', 'underlined']),
  iconWeight: z.enum(['light', 'regular', 'bold']),
  iconSizePx: z.number().min(14).max(24),
  focusRing: z.enum(['ring', 'outline', 'underglow']),
});
export type ControlTraits = z.infer<typeof ControlTraits>;

/** Trait group: motion. A named preset plus bounded tuning. */
export const MotionTraits = z.object({
  preset: MotionPreset,
  /**
   * The mechanism, where `preset` is the tempo.
   *
   * Two directions on the same preset but different languages read as two
   * different products; two directions on the same language differ only in
   * pacing. This is the axis the toolbar deliberately does not lock.
   */
  language: MotionLanguage,
  /**
   * Base duration for a standard transition.
   *
   * The ceiling is 900ms rather than 600 because a scroll-driven reveal or a
   * pinned hero legitimately runs longer than a button hover, and clamping
   * those down to 600 flattened every direction onto the same timing.
   */
  durationMs: z.number().int().min(80).max(900),
  /** CSS timing function or a Motion spring descriptor. */
  easing: z.string().max(120),
  /**
   * Stagger between sibling items entering. 0 disables staggering. The ceiling
   * matches the compiler's own clamp; they disagreed before, so an expressive
   * cascade could be built and then rejected by this schema.
   */
  staggerMs: z.number().int().min(0).max(240),
  /** Scale of the entrance transform, 0–1. 0 means opacity only. */
  travel: z.number().min(0).max(1),
  /**
   * What the branch does under prefers-reduced-motion. Locked to a safe set:
   * the accessibility contract is shared, only the treatment varies.
   */
  reducedMotion: z.enum(['fade-only', 'instant']),
});
export type MotionTraits = z.infer<typeof MotionTraits>;

/** The pattern chosen for one region, with its provenance. */
export const RegionSelection = z.object({
  /** Region id from the Screen Spec. Every region must appear exactly once. */
  regionId: Slug,
  /** Registry record id, or a CanvasCraft neutral fallback. */
  recordId: Slug,
  source: PatternSource,
  sourceUrl: z.string().url(),
  license: LicenseId,
  /** Notice copied into the sandbox project when required. */
  licenseNotice: z.string().nullable().default(null),
  /** Similarity score that produced this choice. */
  matchScore: z.number().min(0).max(1),
  matchSource: MatchSource,
  /** Why this pattern fits this region. Shown verbatim in the Design Director. */
  whyItFits: z.string().max(400),
  /** Set when the gate rejected the top match and a fallback was used. */
  fallbackReason: z.string().max(200).nullable().default(null),
});
export type RegionSelection = z.infer<typeof RegionSelection>;

/** Where this branch came from. Real stored data, not a reconstruction. */
export const Lineage = z.object({
  /** Screen Spec id this branch was built from. */
  specId: z.string().min(1),
  /**
   * SHA-256 of the canonicalised spec. The materialiser refuses to build a
   * branch whose hash does not match the run's current spec.
   */
  specHash: z.string().length(64),
  /** Branch ids this one was remixed from. Empty for an original direction. */
  parentBranchIds: z.array(z.string()).default([]),
  /**
   * For a remix: which parent branch each trait group came from. All null for an
   * original direction. Spelled out rather than kept as a map so a remix cannot
   * leave a group unattributed.
   */
  traitOrigins: z
    .object({
      palette: z.string().nullable(),
      typography: z.string().nullable(),
      form: z.string().nullable(),
      controls: z.string().nullable(),
      motion: z.string().nullable(),
      selections: z.string().nullable(),
    })
    .default({
      palette: null,
      typography: null,
      form: null,
      controls: null,
      motion: null,
      selections: null,
    }),
  /** Registry version the selections were made against. */
  registryVersion: z.string(),
});
export type Lineage = z.infer<typeof Lineage>;

export const VariantManifest = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  /** Branch name, e.g. "Calm Trust". Shown on the plate. */
  name: z.string().max(60),
  /**
   * The kind of page every direction in this run is building.
   *
   * Deliberately *not* a trait group: it is chosen once in the canvas toolbar
   * and shared, exactly like the Screen Spec, because three directions for
   * three different kinds of website compare nothing. It sits here rather than
   * only in the spec because the renderer needs it to pick a layout shell, and
   * the renderer only ever receives the manifest.
   */
  archetype: PageArchetype,
  /**
   * The Design Genome: a one-line human summary such as
   * "Midnight palette · rounded controls · calm motion", with the locked
   * toolbar axes appended by the compiler.
   */
  genome: z.string().max(GENOME_MAX_LENGTH),
  /** One sentence on what this direction is arguing for. */
  rationale: z.string().max(400),

  palette: PaletteTraits,
  typography: TypographyTraits,
  form: FormTraits,
  controls: ControlTraits,
  motion: MotionTraits,
  selections: z.array(RegionSelection),

  lineage: Lineage,
  createdAt: z.string(),
});
export type VariantManifest = z.infer<typeof VariantManifest>;

/** The trait groups Trait Remix can compose. */
export const TRAIT_GROUPS = [
  'palette',
  'typography',
  'form',
  'controls',
  'motion',
  'selections',
] as const;
export type TraitGroup = (typeof TRAIT_GROUPS)[number];

/**
 * Coverage check. A manifest that resolves fewer regions than the spec declares
 * would silently drop a drawn flow, which is the failure the whole
 * spec/manifest split exists to prevent.
 */
export function findManifestIntegrityIssues(
  manifest: VariantManifest,
  spec: ScreenSpec,
  specHash: string,
): string[] {
  const issues: string[] = [];

  if (manifest.lineage.specId !== spec.id) {
    issues.push(
      `Branch "${manifest.name}" was built from spec ${manifest.lineage.specId}, but the run's spec is ${spec.id}.`,
    );
  }
  if (manifest.lineage.specHash !== specHash) {
    issues.push(
      `Branch "${manifest.name}" is stale: its spec hash does not match the current Screen Spec.`,
    );
  }

  const specRegionIds = new Set(spec.regions.map((region) => region.id));
  const selected = new Map<string, number>();
  for (const selection of manifest.selections) {
    selected.set(selection.regionId, (selected.get(selection.regionId) ?? 0) + 1);
    if (!specRegionIds.has(selection.regionId)) {
      issues.push(`Branch "${manifest.name}" selects a pattern for unknown region "${selection.regionId}".`);
    }
  }

  for (const region of spec.regions) {
    const count = selected.get(region.id) ?? 0;
    if (count === 0) {
      issues.push(`Branch "${manifest.name}" does not resolve region "${region.id}".`);
    } else if (count > 1) {
      issues.push(`Branch "${manifest.name}" resolves region "${region.id}" ${count} times.`);
    }
  }

  return issues;
}

/**
 * Roles whose region is dense body content a reader scans rather than a
 * showcase. An `expressive`-motion pattern in one of these is the shape of
 * every "component overlaps / is truncated / animates on load" bug a generated
 * page ships: it overflows its box, cycles content mid-read, or starts moving
 * before the reader has looked at it.
 *
 * Canonical here: the orchestrator's selection guard imports this same set, so
 * the pattern it keeps out of the candidate list and the pattern this backstop
 * rejects can never drift apart.
 */
export const BODY_CONTENT_ROLES: ReadonlySet<SemanticRole> = new Set<SemanticRole>([
  'insight-card',
  'metric-tile',
  'list-row',
  'data-table',
  'form-field',
  'search-control',
  'filter-control',
  'tab-strip',
]);

/** The registry facts this backstop needs about one selected pattern. */
export interface ManifestPatternContext {
  name: string;
  motionIntensity: MotionIntensity;
  mobileRisk: RiskLevel;
  fallbackId: string | null;
}

/**
 * Run-blocking backstop for a manifest whose pattern selections fight their
 * context.
 *
 * The orchestrator's `buildCandidates` already keeps these patterns out of the
 * candidate list, so a deterministic direction can never reach this. It exists
 * for the paths that bypass the candidate list — an AI-authored direction, a
 * Trait Remix, a hand-edited manifest — where a wrong selection would otherwise
 * only be caught by a person looking at the rendered branch.
 *
 * `resolvePattern` is supplied by the caller (which owns the registry) so this
 * module stays registry-free. A selection whose record cannot be resolved is
 * left alone: unknown records are already `findManifestIntegrityIssues`' job.
 */
export function findManifestContextIssues(
  manifest: VariantManifest,
  spec: ScreenSpec,
  resolvePattern: (recordId: string) => ManifestPatternContext | undefined,
): string[] {
  const issues: string[] = [];
  const roleByRegion = new Map(spec.regions.map((region) => [region.id, region.role]));

  for (const selection of manifest.selections) {
    const record = resolvePattern(selection.recordId);
    const role = roleByRegion.get(selection.regionId);
    if (!record || !role) continue;

    if (record.motionIntensity === 'expressive' && BODY_CONTENT_ROLES.has(role)) {
      issues.push(
        `Branch "${manifest.name}" puts the expressive-motion pattern "${record.name}" on "${selection.regionId}" (${role}), which is scanned content and needs a still treatment.`,
      );
    } else if (
      record.motionIntensity === 'expressive' &&
      manifest.archetype === 'application' &&
      role !== 'hero-statement'
    ) {
      issues.push(
        `Branch "${manifest.name}" is an application surface but places the expressive-motion pattern "${record.name}" on "${selection.regionId}" (${role}); only a hero region may carry that motion here.`,
      );
    }

    if (record.mobileRisk === 'high' && record.fallbackId === null) {
      issues.push(
        `Branch "${manifest.name}" selects "${record.name}" for "${selection.regionId}", which is high mobile risk with no declared narrow-width fallback.`,
      );
    }
  }

  return issues;
}

/**
 * Compose a new manifest from trait groups taken from parent manifests.
 *
 * This is the whole of Trait Remix. It operates on validated data, never on
 * generated source files, which is why the PRD's "never merge arbitrary source"
 * rule is trivially satisfied: no such code path exists.
 */
export function composeRemix(args: {
  id: string;
  name: string;
  genome: string;
  rationale: string;
  createdAt: string;
  /** Trait group -> the parent manifest it is taken from. */
  sources: Record<TraitGroup, VariantManifest>;
}): VariantManifest {
  const { sources } = args;
  const parentSpecs = new Set(
    TRAIT_GROUPS.map((group) => `${sources[group].lineage.specId}:${sources[group].lineage.specHash}`),
  );
  if (parentSpecs.size !== 1) {
    throw new Error('Trait Remix requires every parent manifest to belong to the same Screen Spec.');
  }
  // Archetype is shared per run, so parents can only disagree if a manifest was
  // hand-edited or came from another run. Composing across archetypes would
  // hand the renderer a marketing motion language inside a dashboard shell.
  const parentArchetypes = new Set(TRAIT_GROUPS.map((group) => sources[group].archetype));
  if (parentArchetypes.size !== 1) {
    throw new Error('Trait Remix requires every parent manifest to share one page archetype.');
  }

  const traitOrigins: Lineage['traitOrigins'] = {
    palette: sources.palette.id,
    typography: sources.typography.id,
    form: sources.form.id,
    controls: sources.controls.id,
    motion: sources.motion.id,
    selections: sources.selections.id,
  };

  const parentBranchIds = [...new Set(TRAIT_GROUPS.map((group) => sources[group].id))];
  const anchor = sources.selections;

  return {
    version: 1,
    id: args.id,
    name: args.name,
    archetype: anchor.archetype,
    genome: args.genome,
    rationale: args.rationale,
    palette: sources.palette.palette,
    typography: sources.typography.typography,
    form: sources.form.form,
    controls: sources.controls.controls,
    motion: sources.motion.motion,
    selections: anchor.selections,
    lineage: {
      specId: anchor.lineage.specId,
      specHash: anchor.lineage.specHash,
      parentBranchIds,
      traitOrigins,
      registryVersion: anchor.lineage.registryVersion,
    },
    createdAt: args.createdAt,
  };
}
