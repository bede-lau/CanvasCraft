import { describe, expect, it } from 'vitest';

import type { RegionCandidates } from '@canvascraft/schema';

import { applyOpenAiRankings } from '../visual-ranker.js';

const candidates: RegionCandidates[] = [
  {
    regionId: 'account-table',
    rejected: [],
    matches: [
      {
        recordId: 'canvascraft-neutral-shell',
        score: 0.58,
        matchSource: 'local',
        rationale: 'Local metadata match.',
      },
      {
        recordId: 'reui-data-table',
        score: 0.72,
        matchSource: 'local',
        rationale: 'Local role-compatible fallback.',
      },
    ],
  },
];

describe('OpenAI visual ranking', () => {
  it('accepts only a complete candidate set and records OpenAI as the source', () => {
    const ranked = applyOpenAiRankings(candidates, [
      {
        regionId: 'account-table',
        matches: [
          { recordId: 'canvascraft-neutral-shell', score: 0.51, rationale: 'A neutral shell is a partial visual fit.' },
          { recordId: 'reui-data-table', score: 0.93, rationale: 'The dense tabular treatment matches the sketched account list.' },
        ],
      },
    ]);

    expect(ranked[0]!.matches.map((match) => match.recordId)).toEqual([
      'reui-data-table',
      'canvascraft-neutral-shell',
    ]);
    expect(ranked[0]!.matches.every((match) => match.matchSource === 'openai')).toBe(true);
    expect(ranked[0]!.matches[0]!.rationale).toContain('tabular');
  });

  it('rejects incomplete model rankings so the caller can retain local matches', () => {
    expect(() =>
      applyOpenAiRankings(candidates, [
        {
          regionId: 'account-table',
          matches: [{ recordId: 'reui-data-table', score: 0.93, rationale: 'A good table fit.' }],
        },
      ]),
    ).toThrow('invalid candidate set');
  });
});
