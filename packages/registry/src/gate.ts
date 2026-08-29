import type {
  GateVerdict,
  IntentTag,
  PatternMatch,
  PrimitiveStack,
  RegistryRecord,
  SemanticRole,
} from '@canvascraft/schema';
import { THIRD_PARTY_SOURCES } from '@canvascraft/schema';

import { REGISTRY_MANIFEST, REGISTRY_RECORDS } from './catalogue.js';

export interface PatternQuery {
  role: SemanticRole;
  intentTags?: readonly IntentTag[];
  wantsMotion?: boolean;
  limit?: number;
}

export function getRegistryRecord(id: string): RegistryRecord | undefined {
  return REGISTRY_RECORDS.find((record) => record.id === id);
}

export function assessRecord(record: RegistryRecord, allowedStack: PrimitiveStack = REGISTRY_MANIFEST.allowedStack): GateVerdict {
  if (!record.allowedForPreview) {
    return { recordId: record.id, allowed: false, reason: 'This pattern is not permitted inside a CanvasCraft preview.' };
  }
  if (record.allowedForExport && THIRD_PARTY_SOURCES.includes(record.source)) {
    return {
      recordId: record.id,
      allowed: false,
      reason: 'Third-party source export is forbidden by the CanvasCraft registry policy.',
    };
  }
  if (record.stack === 'radix') {
    return { recordId: record.id, allowed: false, reason: 'Radix patterns cannot enter the Base UI generated-app stack.' };
  }
  if (record.stack !== allowedStack && record.stack !== 'headless-none') {
    return {
      recordId: record.id,
      allowed: false,
      reason: `Pattern requires ${record.stack}, but generated branches use ${allowedStack}.`,
    };
  }
  return { recordId: record.id, allowed: true, reason: null };
}

export function findPatternCandidates(query: PatternQuery): RegistryRecord[] {
  const tags = new Set(query.intentTags ?? []);
  const matching = REGISTRY_RECORDS.filter((record) => {
    if (!record.roles.includes(query.role)) return false;
    return assessRecord(record).allowed;
  });

  return [...matching]
    .sort((left, right) => {
      const leftTags = left.intentTags.filter((tag) => tags.has(tag)).length;
      const rightTags = right.intentTags.filter((tag) => tags.has(tag)).length;
      const leftMotion = query.wantsMotion && left.motionIntensity !== 'none' ? 1 : 0;
      const rightMotion = query.wantsMotion && right.motionIntensity !== 'none' ? 1 : 0;
      return rightTags + rightMotion - (leftTags + leftMotion) || left.id.localeCompare(right.id);
    })
    .slice(0, query.limit ?? 5);
}

/**
 * Offline matcher: a transparent semantic fallback for an unavailable Nosana
 * endpoint. It ranks reviewed metadata and always identifies itself as local.
 */
export function matchLocally(query: PatternQuery): PatternMatch[] {
  const candidates = findPatternCandidates(query);
  const tags = new Set(query.intentTags ?? []);
  return candidates.map((record, index) => {
    const overlap = record.intentTags.filter((tag) => tags.has(tag)).length;
    const score = Math.max(0.35, Math.min(0.97, 0.58 + overlap * 0.12 - index * 0.06));
    return {
      recordId: record.id,
      score: Number(score.toFixed(2)),
      matchSource: 'local',
      rationale:
        overlap > 0
          ? `Local metadata match on ${overlap} compatible intent tag${overlap === 1 ? '' : 's'}.`
          : 'Local role-compatible fallback.',
    };
  });
}

export function validateRegistry(): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();

  for (const record of REGISTRY_RECORDS) {
    if (ids.has(record.id)) issues.push(`Duplicate registry record id "${record.id}".`);
    ids.add(record.id);

    const verdict = assessRecord(record);
    if (!verdict.allowed) issues.push(`${record.id}: ${verdict.reason ?? 'rejected by licence gate'}`);

    if (THIRD_PARTY_SOURCES.includes(record.source)) {
      if (record.allowedForExport) issues.push(`${record.id}: third-party records must not allow source export.`);
      if (!record.licenseNotice) issues.push(`${record.id}: third-party record is missing its licence notice.`);
    }
    if (!record.thumbnail.startsWith('data/thumbnails/')) {
      issues.push(`${record.id}: thumbnail must live below data/thumbnails/.`);
    }
    if (record.fallbackId && !getRegistryRecord(record.fallbackId)) {
      issues.push(`${record.id}: fallback "${record.fallbackId}" does not exist.`);
    }
  }

  if (REGISTRY_RECORDS.length < 8 || REGISTRY_RECORDS.length > 12) {
    issues.push(`Registry must contain 8-12 reviewed records; found ${REGISTRY_RECORDS.length}.`);
  }

  return issues;
}
