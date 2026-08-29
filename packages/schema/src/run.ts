import { z } from 'zod';
import { BranchRecord } from './branch.js';
import { CanvasDoc } from './canvas.js';
import { PatchInstruction, Recommendation } from './director.js';
import { RunStage } from './events.js';
import { PatternMatch } from './registry.js';
import { ScreenSpec } from './screen-spec.js';
import { Slug } from './primitives.js';

/** The whole state of one generation, as the client sees it. */

export const RunStatus = z.enum([
  'draft',
  'running',
  'awaiting-approval',
  'ready',
  'failed',
]);
export type RunStatus = z.infer<typeof RunStatus>;

/** Candidates offered for one region, kept for the provenance panel. */
export const RegionCandidates = z.object({
  regionId: Slug,
  matches: z.array(PatternMatch),
  /** Ids the gate rejected, with the reason. Shown, not hidden. */
  rejected: z.array(z.object({ recordId: Slug, reason: z.string() })),
});
export type RegionCandidates = z.infer<typeof RegionCandidates>;

export const RunRecord = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  status: RunStatus,
  /** The stage currently in flight, or the last one reached. */
  stage: RunStage,
  canvas: CanvasDoc,
  spec: ScreenSpec.nullable(),
  specHash: z.string().nullable(),
  candidates: z.array(RegionCandidates).default([]),
  branches: z.array(BranchRecord).default([]),
  recommendations: z.array(Recommendation).default([]),
  patches: z.array(PatchInstruction).default([]),
  /** What separates the three directions. From the AI, shown in the workspace. */
  contrastSummary: z.string().default(''),
  championBranchId: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RunRecord = z.infer<typeof RunRecord>;

/** Request body for starting a generation. */
export const GenerateRequest = z.object({
  canvas: CanvasDoc,
  /** PNG data URL of the canvas render, for the vision call. */
  canvasImage: z.string().nullable(),
  /** Branch count is fixed at three for the MVP; extras queue. See PRD §2. */
  branchCount: z.literal(3).default(3),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

export const ResolveAmbiguityRequest = z.object({
  ambiguityId: Slug,
  optionId: Slug,
});
export type ResolveAmbiguityRequest = z.infer<typeof ResolveAmbiguityRequest>;

export const RemixRequest = z.object({
  name: z.string().max(60),
  /** Trait group -> source branch id. Every group must be assigned. */
  sources: z.object({
    palette: z.string(),
    typography: z.string(),
    form: z.string(),
    controls: z.string(),
    motion: z.string(),
    selections: z.string(),
  }),
});
export type RemixRequest = z.infer<typeof RemixRequest>;

export const PatchRequest = z.object({
  branchId: z.string(),
  regionId: Slug,
  request: z.string().max(500),
});
export type PatchRequest = z.infer<typeof PatchRequest>;

export const ApplyRecommendationRequest = z.object({
  recommendationId: z.string(),
  /** False reverts a previously applied recommendation. */
  apply: z.boolean(),
});
export type ApplyRecommendationRequest = z.infer<typeof ApplyRecommendationRequest>;

export const SelectChampionRequest = z.object({
  branchId: z.string(),
  /** Stop and archive the others. False keeps everything running. */
  retireOthers: z.boolean().default(true),
});
export type SelectChampionRequest = z.infer<typeof SelectChampionRequest>;
