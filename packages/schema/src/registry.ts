import { z } from 'zod';
import {
  LicenseId,
  MotionIntensity,
  PatternSource,
  PrimitiveStack,
  RiskLevel,
  SemanticRole,
  Slug,
} from './primitives.js';

/**
 * Component Intelligence Registry records.
 *
 * A record is *metadata plus a small adapter*, never a vendored copy of a
 * library. See ADR 0006 for the licence position that shapes these fields.
 */

/** Intent tags used for semantic retrieval, alongside Nosana's visual match. */
export const IntentTag = z.enum([
  'card-stack',
  'dashboard-shell',
  'search-control',
  'filter-control',
  'modal',
  'drawer',
  'tabbed-view',
  'loading-state',
  'empty-state',
  'toast-feedback',
  'ai-recommendation',
  'ai-thinking',
  'ai-task-list',
  'diff-review',
  'stepper',
  'timeline',
  'data-table',
  'metric-tiles',
  'media-gallery',
  'form-group',
  'app-frame',
  'marketing-hero',
]);
export type IntentTag = z.infer<typeof IntentTag>;

export const RegistryRecord = z.object({
  /** Stable id, e.g. "react-bits-card-swap". Referenced by manifests forever. */
  id: Slug,
  /** Display name as the source calls it. */
  name: z.string().max(120),
  source: PatternSource,
  /** Canonical documentation URL. Required — provenance is a product surface. */
  sourceUrl: z.string().url(),
  /** The identifier the source itself uses, e.g. "CardSwap" or "Group". */
  componentId: z.string().max(120),

  intentTags: z.array(IntentTag).min(1),
  /** Semantic roles this pattern can serve. Drives compatibility filtering. */
  roles: z.array(SemanticRole).min(1),

  /** Primitive stack this pattern belongs to. Mixing stacks is forbidden. */
  stack: PrimitiveStack,
  /** npm packages the pattern needs inside a generated branch. */
  dependencies: z.array(z.string()).default([]),

  license: LicenseId,
  /**
   * The notice that must travel with substantial copied code. Required for any
   * licence that demands attribution; the validator enforces this.
   */
  licenseNotice: z.string().nullable().default(null),
  /** May this pattern render inside a sandbox preview we operate? */
  allowedForPreview: z.boolean(),
  /**
   * May its source be handed to a user as a download?
   *
   * False for every third-party record in this MVP. Commons Clause turns
   * exactly on this distinction, which is why it is a separate flag.
   */
  allowedForExport: z.boolean(),

  motionIntensity: MotionIntensity,
  /** Risk that this pattern behaves badly on a narrow viewport. */
  mobileRisk: RiskLevel,
  /** Concrete a11y guidance the Design Director surfaces verbatim. */
  accessibilityNote: z.string().max(400),
  /** Registry id of the neutral pattern to use when this one is gated out. */
  fallbackId: Slug.nullable(),

  /** Path to the thumbnail, relative to the registry package. Used by Nosana. */
  thumbnail: z.string().min(1),
  /** One sentence on when to reach for this. Shown in the Design Director. */
  usagePattern: z.string().max(400),
  /** Why a generator would pick this. Feeds the retrieval prompt. */
  whenToUse: z.string().max(400),
  /** Registry version this record was introduced in. */
  since: z.string().default('0.1.0'),
});
export type RegistryRecord = z.infer<typeof RegistryRecord>;

export const RegistryManifest = z.object({
  version: z.string(),
  updatedAt: z.string(),
  /** The one stack a generated branch is allowed to use. */
  allowedStack: PrimitiveStack,
  records: z.array(RegistryRecord),
});
export type RegistryManifest = z.infer<typeof RegistryManifest>;

/** A pre-computed thumbnail embedding, produced by the Nosana CLIP service. */
export const EmbeddingIndex = z.object({
  /** Exact model id used. A mismatch invalidates every comparison. */
  model: z.string(),
  dimensions: z.number().int().positive(),
  createdAt: z.string(),
  /** Registry version the thumbnails came from. */
  registryVersion: z.string(),
  vectors: z.record(z.string(), z.array(z.number())),
});
export type EmbeddingIndex = z.infer<typeof EmbeddingIndex>;

/** Where a similarity score came from. Rendered in the UI; never faked. */
export const MatchSource = z.enum(['nosana', 'local']);
export type MatchSource = z.infer<typeof MatchSource>;

/** One ranked candidate for one screen region. */
export const PatternMatch = z.object({
  recordId: Slug,
  /** Cosine similarity, 0–1. */
  score: z.number().min(0).max(1),
  matchSource: MatchSource,
  /** Why this survived the gate, or why it is only a partial fit. */
  rationale: z.string().max(300).default(''),
});
export type PatternMatch = z.infer<typeof PatternMatch>;

/** The gate's verdict on one record for one region. */
export const GateVerdict = z.object({
  recordId: Slug,
  allowed: z.boolean(),
  /** Present when `allowed` is false. Surfaced in provenance, not hidden. */
  reason: z.string().max(200).nullable().default(null),
});
export type GateVerdict = z.infer<typeof GateVerdict>;

/**
 * Licences whose terms require the notice to travel with substantial copied
 * code. Enforced by `pnpm registry:validate`.
 */
export const LICENSES_REQUIRING_NOTICE: readonly LicenseId[] = [
  'mit',
  'mit-commons-clause',
  'apache-2.0',
] as const;

/** Third-party sources. CanvasCraft's own patterns are the only exception. */
export const THIRD_PARTY_SOURCES: readonly PatternSource[] = [
  'react-bits',
  'beautiful-ui',
  'coss-ui',
  'reui',
] as const;
