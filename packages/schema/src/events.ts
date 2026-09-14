import { z } from 'zod';
import { BranchStatus } from './branch.js';
import { MatchSource, PatternMatch } from './registry.js';

/**
 * Run events.
 *
 * The append-only log of a generation, streamed to the client over SSE and
 * persisted as `events.ndjson`. A reload replays this file, so the UI never
 * has to reconstruct what happened — it re-reads it.
 *
 * These are also what the audience sees. The PRD asks for visible activity
 * states rather than a spinner, so each stage emits a started/finished pair
 * with enough detail to render a real sentence.
 */

export const RunStage = z.enum([
  'canvas-received',
  'pre-pass',
  'interpreting',
  'awaiting-approval',
  'retrieval-requests',
  'visual-matching',
  'licence-gate',
  'proposing-directions',
  'layout-audit',
  'materialising',
  'sandbox-launch',
  'design-review',
  'ready',
]);
export type RunStage = z.infer<typeof RunStage>;

/** Set when a stage completed but not the way it was meant to. */
export const StageOutcome = z.enum(['ok', 'degraded', 'failed']);
export type StageOutcome = z.infer<typeof StageOutcome>;

const base = {
  id: z.string(),
  runId: z.string(),
  at: z.string(),
};

export const RunEvent = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('run-started'),
    canvasId: z.string(),
    title: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('stage-started'),
    stage: RunStage,
    /** The sentence shown in the activity strip, e.g. "Interpreting wireframe". */
    label: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('stage-finished'),
    stage: RunStage,
    outcome: StageOutcome,
    /** What actually happened, including why an outcome was degraded. */
    detail: z.string(),
    durationMs: z.number().int().nonnegative(),
  }),

  z.object({
    ...base,
    type: z.literal('spec-ready'),
    specId: z.string(),
    specHash: z.string(),
    regionCount: z.number().int(),
    stateCount: z.number().int(),
    interactionCount: z.number().int(),
  }),

  z.object({
    ...base,
    type: z.literal('approval-required'),
    ambiguityId: z.string(),
    question: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('approval-resolved'),
    ambiguityId: z.string(),
    optionId: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('matches-ready'),
    regionId: z.string(),
    matchSource: MatchSource,
    /** Shown as "Matching visual UI patterns" with candidates and confidence. */
    matches: z.array(PatternMatch),
    /** Present when the OpenAI visual ranker was unavailable. Never hidden. */
    degradedReason: z.string().nullable().default(null),
  }),

  z.object({
    ...base,
    type: z.literal('gate-decision'),
    regionId: z.string(),
    recordId: z.string(),
    allowed: z.boolean(),
    reason: z.string().nullable(),
  }),

  z.object({
    ...base,
    type: z.literal('branch-proposed'),
    branchId: z.string(),
    name: z.string(),
    genome: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('branch-status'),
    branchId: z.string(),
    status: BranchStatus,
    detail: z.string().default(''),
  }),

  z.object({
    ...base,
    type: z.literal('branch-preview'),
    branchId: z.string(),
    previewUrl: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('branch-failed'),
    branchId: z.string(),
    error: z.string(),
    logTail: z.array(z.string()).default([]),
  }),

  z.object({
    ...base,
    type: z.literal('recommendation-ready'),
    branchId: z.string(),
    recommendationId: z.string(),
    title: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('patch-applied'),
    branchId: z.string(),
    patchId: z.string(),
    regionId: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('patch-deleted'),
    branchId: z.string(),
    patchId: z.string(),
    regionId: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('champion-selected'),
    branchId: z.string(),
    /** Branch ids stopped or archived as a result. */
    retiredBranchIds: z.array(z.string()),
  }),

  z.object({
    ...base,
    type: z.literal('run-failed'),
    stage: RunStage,
    error: z.string(),
  }),

  z.object({
    ...base,
    type: z.literal('run-finished'),
    branchCount: z.number().int(),
    durationMs: z.number().int().nonnegative(),
  }),
]);
export type RunEvent = z.infer<typeof RunEvent>;

/** The label shown in the activity strip while a stage runs. */
export const STAGE_LABELS: Record<RunStage, string> = {
  'canvas-received': 'Reading canvas',
  'pre-pass': 'Mapping stamps and arrows',
  interpreting: 'Interpreting wireframe',
  'awaiting-approval': 'Waiting on one decision',
  'retrieval-requests': 'Framing pattern queries',
  'visual-matching': 'Matching visual UI patterns',
  'licence-gate': 'Checking licences and compatibility',
  'proposing-directions': 'Proposing three directions',
  'layout-audit': 'Auditing layout',
  materialising: 'Applying design directions',
  'sandbox-launch': 'Starting live branches',
  'design-review': 'Reviewing each branch',
  ready: 'Branches live',
};

/** Which integration owns each stage. Rendered as an attribution in the strip. */
export const STAGE_ACTOR: Record<RunStage, 'canvascraft' | 'ai' | 'daytona'> = {
  'canvas-received': 'canvascraft',
  'pre-pass': 'canvascraft',
  interpreting: 'ai',
  'awaiting-approval': 'canvascraft',
  'retrieval-requests': 'ai',
  'visual-matching': 'ai',
  'licence-gate': 'canvascraft',
  'proposing-directions': 'ai',
  'layout-audit': 'ai',
  materialising: 'canvascraft',
  'sandbox-launch': 'daytona',
  'design-review': 'ai',
  ready: 'canvascraft',
};
