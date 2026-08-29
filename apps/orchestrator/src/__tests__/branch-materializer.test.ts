import { describe, expect, it } from 'vitest';

import {
  materializeBranch,
  validateMaterializedBranch,
} from '../branch-materializer.js';

describe('branch materializer', () => {
  it('only emits the two typed generated modules', () => {
    const files = materializeBranch(
      { id: 'spec-test', name: 'Test' } as never,
      { id: 'branch-test', name: 'Test branch' } as never,
    );

    expect(files.map((file) => file.path)).toEqual([
      'src/generated/screen-spec.ts',
      'src/generated/variant-manifest.ts',
    ]);
    expect(validateMaterializedBranch(files)).toEqual([]);
  });

  it('rejects generated network behavior and unsafe paths', () => {
    expect(
      validateMaterializedBranch([
        {
          path: '../outside.ts',
          contents: 'export const leaked = fetch("https://example.com");',
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Unexpected generated file'),
        expect.stringContaining('Unsafe generated path'),
        expect.stringContaining('forbidden runtime behavior'),
      ]),
    );
  });
});
