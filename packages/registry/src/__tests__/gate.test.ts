import { describe, expect, it } from 'vitest';

import { REGISTRY_RECORDS } from '../catalogue.js';
import { assessRecord, findPatternCandidates, matchLocally, validateRegistry } from '../gate.js';

describe('component intelligence registry', () => {
  it('contains a reviewable 8-12 pattern catalogue', () => {
    expect(REGISTRY_RECORDS.length).toBeGreaterThanOrEqual(8);
    expect(REGISTRY_RECORDS.length).toBeLessThanOrEqual(12);
    expect(validateRegistry()).toEqual([]);
  });

  it('keeps third-party records preview-only', () => {
    for (const record of REGISTRY_RECORDS.filter((entry) => entry.source !== 'canvascraft')) {
      expect(record.allowedForExport).toBe(false);
      expect(assessRecord(record).allowed).toBe(true);
    }
  });

  it('returns a labelled local fallback when matching without Nosana', () => {
    const candidates = findPatternCandidates({ role: 'dialog', intentTags: ['modal'] });
    expect(candidates.map((record) => record.id)).toContain('coss-ui-dialog');

    const matches = matchLocally({ role: 'dialog', intentTags: ['modal'] });
    expect(matches[0]?.matchSource).toBe('local');
  });
});
