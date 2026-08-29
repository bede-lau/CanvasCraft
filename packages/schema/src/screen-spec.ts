import { z } from 'zod';
import {
  Bounds,
  InteractionKind,
  LayoutRegion,
  SemanticRole,
  Slug,
  StateKind,
} from './primitives.js';

/**
 * The Screen Spec.
 *
 * Produced once per run and handed identically to every branch. Everything in
 * here is LOCKED: if a property can differ between branches, it does not belong
 * in this file — it belongs in the Variant Manifest. See ADR 0008.
 */

/** One addressable region of the screen. Branches restyle these; none may drop one. */
export const SpecRegion = z.object({
  /** Stable across regeneration so canvas→preview traceability survives edits. */
  id: Slug,
  /** The canvas element this came from, for highlight-on-select. */
  sourceElementId: z.string().nullable(),
  role: SemanticRole,
  region: LayoutRegion,
  /** The visible label or heading. Locked: branches restyle it, never rewrite it. */
  label: z.string().max(200),
  /** What this region is for, in one sentence. Drives pattern retrieval. */
  purpose: z.string().max(400),
  /** Approximate position on the drawn canvas, for the retrieval crop. */
  sourceBounds: Bounds.nullable(),
  /** Order within its layout region. Locked. */
  order: z.number().int().min(0),
  /** Region ids nested inside this one. */
  children: z.array(Slug).default([]),
  /** Which local states this region is visible in. Empty means all of them. */
  visibleInStates: z.array(StateKind).default([]),
  /**
   * The kind of content this region holds. The materialiser uses this to pick a
   * fixture shape, so meaning stays identical across branches even though
   * presentation does not.
   */
  contentShape: z.enum([
    'none',
    'text',
    'metric',
    'record-list',
    'record-table',
    'media-grid',
    'form-fields',
    'nav-items',
  ]),
});
export type SpecRegion = z.infer<typeof SpecRegion>;

/** A drawn interaction, resolved into a local state transition. */
export const SpecInteraction = z.object({
  id: Slug,
  sourceArrowId: z.string().nullable(),
  kind: InteractionKind,
  /** Region that triggers it. */
  fromRegion: Slug,
  /** Region it affects. */
  toRegion: Slug,
  /** State the screen is in before. `null` means "any state". */
  fromState: StateKind.nullable(),
  /** State the screen enters. This is what makes the flow comparable. */
  toState: StateKind,
  /** User-facing description, shown in Motion Audition. */
  description: z.string().max(300),
  /** Whether Motion Audition can replay this across branches. */
  auditionable: z.boolean().default(true),
});
export type SpecInteraction = z.infer<typeof SpecInteraction>;

/** One local UI state every branch must implement. */
export const SpecState = z.object({
  id: StateKind,
  /** Shown in the State-Locked Comparison control. */
  label: z.string().max(80),
  /** What the user should see. Locked so branches cannot reinterpret it. */
  description: z.string().max(400),
  /** Region ids hidden while this state is active. */
  hiddenRegions: z.array(Slug).default([]),
  /** Region ids replaced by a skeleton or placeholder while active. */
  placeholderRegions: z.array(Slug).default([]),
});
export type SpecState = z.infer<typeof SpecState>;

/** Seeded mock content. Identical in every branch, so comparison is fair. */
export const SpecFixture = z.object({
  /** Region this fixture feeds. */
  regionId: Slug,
  /** Realistic seeded values. Meaning is locked; rendering is not. */
  records: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .max(24),
});
export type SpecFixture = z.infer<typeof SpecFixture>;

/** An ambiguity the compiler could not resolve alone. */
export const SpecAmbiguity = z.object({
  id: Slug,
  /** The question, in the user's terms. */
  question: z.string().max(300),
  /** Why it changes the screen materially. Only material questions get asked. */
  impact: z.string().max(300),
  options: z
    .array(
      z.object({
        id: Slug,
        label: z.string().max(80),
        description: z.string().max(240),
      }),
    )
    .min(2)
    .max(4),
  /** Set once the user answers. Never asked again — see ADR 0008. */
  resolvedOptionId: Slug.nullable().default(null),
  /** Which option the compiler would pick unattended. */
  defaultOptionId: Slug,
});
export type SpecAmbiguity = z.infer<typeof SpecAmbiguity>;

/** The accessibility floor. Identical in every branch; ADR 0007 §baseline. */
export const SpecAccessibility = z.object({
  minBodyContrast: z.number().min(4.5).default(4.5),
  minLargeTextContrast: z.number().min(3).default(3),
  minTouchTargetPx: z.number().min(44).default(44),
  requiresVisibleFocus: z.literal(true).default(true),
  requiresKeyboardPath: z.literal(true).default(true),
  requiresReducedMotionFallback: z.literal(true).default(true),
  /** Landmarks the branch must render, e.g. banner, navigation, main. */
  landmarks: z.array(z.string().min(1)).min(1).default(['banner', 'main']),
});
export type SpecAccessibility = z.infer<typeof SpecAccessibility>;

/** The responsive contract. Locked so "narrow" means the same thing everywhere. */
export const SpecResponsive = z.object({
  narrowBreakpointPx: z.number().int().default(640),
  wideBreakpointPx: z.number().int().default(1280),
  /** Regions that stack rather than sit side by side below the breakpoint. */
  stacksBelowNarrow: z.array(Slug).default([]),
  /** Regions that collapse into a disclosure below the breakpoint. */
  collapsesBelowNarrow: z.array(Slug).default([]),
}).superRefine((responsive, context) => {
  if (responsive.wideBreakpointPx <= responsive.narrowBreakpointPx) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['wideBreakpointPx'],
      message: 'wideBreakpointPx must be greater than narrowBreakpointPx.',
    });
  }
});
export type SpecResponsive = z.infer<typeof SpecResponsive>;

export const ScreenSpec = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  /** The canvas doc this was compiled from. */
  canvasId: z.string().min(1),
  /** Screen name, e.g. "Portfolio insights dashboard". */
  name: z.string().max(120),
  /** One sentence on what the screen is for. Feeds every downstream prompt. */
  intent: z.string().max(600),
  /** Who this screen is for, inferred from notes. Shapes copy and density. */
  audience: z.string().max(200).default(''),
  regions: z.array(SpecRegion).min(1),
  interactions: z.array(SpecInteraction).default([]),
  states: z.array(SpecState).min(1),
  fixtures: z.array(SpecFixture).default([]),
  ambiguities: z.array(SpecAmbiguity).default([]),
  accessibility: SpecAccessibility,
  responsive: SpecResponsive,
  createdAt: z.string(),
});
export type ScreenSpec = z.infer<typeof ScreenSpec>;

/**
 * Structural checks Zod cannot express. These are hard failures: a spec that
 * fails one of them would let branches diverge, which is the one thing the
 * product cannot allow.
 */
export function findSpecIntegrityIssues(spec: ScreenSpec): string[] {
  const issues: string[] = [];
  const regionIds = new Set(spec.regions.map((region) => region.id));
  const stateIds = new Set(spec.states.map((state) => state.id));

  if (!stateIds.has('default')) {
    issues.push('Every screen needs a "default" state.');
  }
  if (!stateIds.has('narrow')) {
    issues.push('Every screen needs a "narrow" state — the responsive contract is locked.');
  }
  if (stateIds.size !== spec.states.length) {
    issues.push('Every screen state id must be unique.');
  }

  const seenRegionIds = new Set<string>();
  for (const region of spec.regions) {
    if (seenRegionIds.has(region.id)) {
      issues.push(`Duplicate region id "${region.id}".`);
    }
    seenRegionIds.add(region.id);

    for (const childId of region.children) {
      if (!regionIds.has(childId)) {
        issues.push(`Region "${region.id}" nests unknown region "${childId}".`);
      }
    }
    for (const stateId of region.visibleInStates) {
      if (!stateIds.has(stateId)) {
        issues.push(`Region "${region.id}" references undeclared state "${stateId}".`);
      }
    }
  }

  for (const interaction of spec.interactions) {
    if (!regionIds.has(interaction.fromRegion)) {
      issues.push(`Interaction "${interaction.id}" starts at unknown region "${interaction.fromRegion}".`);
    }
    if (!regionIds.has(interaction.toRegion)) {
      issues.push(`Interaction "${interaction.id}" targets unknown region "${interaction.toRegion}".`);
    }
    if (!stateIds.has(interaction.toState)) {
      issues.push(
        `Interaction "${interaction.id}" enters state "${interaction.toState}", which the screen does not declare.`,
      );
    }
    if (interaction.fromState && !stateIds.has(interaction.fromState)) {
      issues.push(
        `Interaction "${interaction.id}" starts from state "${interaction.fromState}", which the screen does not declare.`,
      );
    }
  }

  for (const state of spec.states) {
    for (const regionId of [...state.hiddenRegions, ...state.placeholderRegions]) {
      if (!regionIds.has(regionId)) {
        issues.push(`State "${state.id}" references unknown region "${regionId}".`);
      }
    }
  }

  for (const fixture of spec.fixtures) {
    if (!regionIds.has(fixture.regionId)) {
      issues.push(`Fixture targets unknown region "${fixture.regionId}".`);
    }
  }

  for (const ambiguity of spec.ambiguities) {
    const optionIds = new Set(ambiguity.options.map((option) => option.id));
    if (!optionIds.has(ambiguity.defaultOptionId)) {
      issues.push(`Ambiguity "${ambiguity.id}" defaults to an option it does not offer.`);
    }
    if (ambiguity.resolvedOptionId && !optionIds.has(ambiguity.resolvedOptionId)) {
      issues.push(`Ambiguity "${ambiguity.id}" resolved to an option it does not offer.`);
    }
  }

  return issues;
}

/** Ambiguities still waiting on the user. Drives the Approval Card queue. */
export function unresolvedAmbiguities(spec: ScreenSpec): SpecAmbiguity[] {
  return spec.ambiguities.filter((ambiguity) => ambiguity.resolvedOptionId === null);
}
