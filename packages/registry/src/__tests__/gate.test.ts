import { describe, expect, it } from 'vitest';

import { REGISTRY_RECORDS } from '../catalogue.js';
import { assessRecord, findPatternCandidates, matchLocally, validateRegistry } from '../gate.js';

describe('component intelligence registry', () => {
  it('contains a reviewable 8-20 pattern catalogue', () => {
    expect(REGISTRY_RECORDS.length).toBeGreaterThanOrEqual(8);
    expect(REGISTRY_RECORDS.length).toBeLessThanOrEqual(20);
    expect(validateRegistry()).toEqual([]);
  });

  it('offers every archetype composition a role-compatible candidate', () => {
    // The archetype vocabulary is only real if the matcher can actually reach
    // it. A record whose roles nobody queries is a record that never ships.
    const reachable = new Set(
      REGISTRY_RECORDS.flatMap((record) =>
        record.roles.flatMap((role) => findPatternCandidates({ role, limit: 20 }).map((entry) => entry.id)),
      ),
    );

    for (const id of [
      'canvascraft-bento-grid',
      'canvascraft-display-hero',
      'canvascraft-logo-marquee',
      'canvascraft-aurora-panel',
      'canvascraft-stream-output',
    ]) {
      expect(reachable, `${id} is unreachable from every role query`).toContain(id);
    }
  });

  it('keeps third-party records preview-only', () => {
    for (const record of REGISTRY_RECORDS.filter((entry) => entry.source !== 'canvascraft')) {
      expect(record.allowedForExport).toBe(false);
      expect(assessRecord(record).allowed).toBe(true);
    }
  });

  it('returns a labelled local fallback when visual ranking is unavailable', () => {
    const candidates = findPatternCandidates({ role: 'dialog', intentTags: ['modal'] });
    expect(candidates.map((record) => record.id)).toContain('coss-ui-dialog');

    const matches = matchLocally({ role: 'dialog', intentTags: ['modal'] });
    expect(matches[0]?.matchSource).toBe('local');
  });
});
