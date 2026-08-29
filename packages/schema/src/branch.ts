import { z } from 'zod';
import { StateKind } from './primitives.js';
import { VariantManifest } from './manifest.js';

/**
 * Branch and sandbox state.
 *
 * Statuses are deliberately granular: the branch strip is one of the two places
 * a judge sees Daytona actually working, so "starting" and "installing" and
 * "serving" must be distinguishable rather than all being "loading".
 */

export const BranchStatus = z.enum([
  'queued',
  'creating',
  'writing',
  'starting',
  'serving',
  'failed',
  'stopped',
  'archived',
]);
export type BranchStatus = z.infer<typeof BranchStatus>;

export const BranchOrigin = z.enum(['direction', 'remix']);
export type BranchOrigin = z.infer<typeof BranchOrigin>;

export const BranchRecord = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  name: z.string().max(60),
  origin: BranchOrigin,
  status: BranchStatus,
  manifest: VariantManifest,

  /** Daytona sandbox id. Null until the sandbox is created. */
  sandboxId: z.string().nullable().default(null),
  /** Same-origin orchestrator preview route exposed to the browser. */
  previewUrl: z.string().nullable().default(null),
  /** Signed upstream preview capability held only by the orchestrator. */
  previewToken: z.string().nullable().default(null),

  /** Set when status is 'failed'. Shown on the card, never swallowed. */
  error: z.string().nullable().default(null),
  /** Tail of the dev server log, for the failure card. */
  logTail: z.array(z.string()).default([]),

  /** True for the branch the user selected. Survives cleanup. */
  isChampion: z.boolean().default(false),

  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BranchRecord = z.infer<typeof BranchRecord>;

/**
 * Commands the host sends into a running preview over postMessage.
 *
 * This is how State-Locked Comparison and Motion Audition work: the host asks
 * every branch to enter the same state or replay the same interaction, and the
 * branches obey identically because the contract is in the shared Screen Spec.
 */
export const PreviewCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-state'), state: StateKind }),
  z.object({ type: z.literal('replay-interaction'), interactionId: z.string() }),
  z.object({ type: z.literal('set-viewport'), width: z.enum(['desktop', 'mobile']) }),
  z.object({ type: z.literal('highlight-region'), regionId: z.string().nullable() }),
  z.object({ type: z.literal('set-reduced-motion'), enabled: z.boolean() }),
  z.object({ type: z.literal('ping') }),
]);
export type PreviewCommand = z.infer<typeof PreviewCommand>;

/** Messages a running preview sends back to the host. */
export const PreviewMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), branchId: z.string() }),
  z.object({ type: z.literal('state-changed'), state: StateKind }),
  z.object({ type: z.literal('interaction-complete'), interactionId: z.string() }),
  z.object({ type: z.literal('region-clicked'), regionId: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type PreviewMessage = z.infer<typeof PreviewMessage>;

/** Namespace on every postMessage payload, so unrelated frames are ignored. */
export const PREVIEW_CHANNEL = 'canvascraft:preview' as const;

export const PreviewEnvelope = z.object({
  channel: z.literal(PREVIEW_CHANNEL),
  branchId: z.string(),
  payload: z.unknown(),
});
export type PreviewEnvelope = z.infer<typeof PreviewEnvelope>;
