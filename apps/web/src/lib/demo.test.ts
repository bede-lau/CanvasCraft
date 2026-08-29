import { describe, expect, it } from 'vitest';
import { CanvasDoc, VariantManifest } from '@canvascraft/schema';
import { DEFAULT_CANVAS, INITIAL_MANIFESTS, createRemix } from './demo';

describe('offline demo contracts', () => {
  it('keeps canvas arrows in the shared point-object shape', () => {
    const parsed = CanvasDoc.parse(DEFAULT_CANVAS);
    expect(parsed.arrows).toHaveLength(2);
    expect(parsed.arrows[0]?.points[0]).toEqual({ x: 610, y: 500 });
  });

  it('uses only visibly labelled local pattern matches', () => {
    const selections = INITIAL_MANIFESTS.flatMap((manifest) => manifest.selections);
    expect(selections.length).toBeGreaterThan(0);
    expect(selections.every((selection) => selection.matchSource === 'local')).toBe(true);
    expect(selections.every((selection) => selection.recordId.length > 0)).toBe(true);
  });

  it('creates a schema-valid remix without merging source files', () => {
    const [calm, playful, editorial] = INITIAL_MANIFESTS;
    const remix = createRemix('Verified Remix', {
      palette: calm!,
      typography: editorial!,
      form: calm!,
      controls: editorial!,
      motion: playful!,
      selections: calm!,
    });

    expect(() => VariantManifest.parse(remix)).not.toThrow();
    expect(remix.lineage.parentBranchIds).toEqual([
      calm!.id,
      editorial!.id,
      playful!.id,
    ]);
  });
});
