import { describe, expect, it } from 'vitest';

import { findCanvasGuardrails, type CanvasDoc, type CanvasElement } from '../index.js';

const timestamp = '2026-09-07T00:00:00.000Z';

function makeCanvas(elements: CanvasElement[]): CanvasDoc {
  return {
    version: 1,
    id: 'canvas-guardrails',
    title: 'Guardrail fixture',
    size: { width: 1200, height: 800 },
    baseImage: null,
    elements,
    arrows: [],
    notes: [],
    strokes: [],
    designPreferences: {
      archetype: 'application',
      displayFont: 'grotesk',
      bodyFont: 'clean',
      buttonShape: 'soft',
      motionPreset: 'calm',
      motionIntensity: 'moderate',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function element(partial: Partial<CanvasElement> & Pick<CanvasElement, 'id' | 'kind' | 'bounds'>): CanvasElement {
  return { rotation: 0, z: 0, label: '', children: [], ...partial };
}

describe('canvas guardrails (soft, non-blocking)', () => {
  it('flags a structural region drawn inside a leaf control', () => {
    const canvas = makeCanvas([
      element({ id: 'btn', kind: 'button', bounds: { x: 0, y: 0, width: 400, height: 300 } }),
      element({ id: 'tbl', kind: 'table', bounds: { x: 20, y: 20, width: 340, height: 240 } }),
    ]);

    const warnings = findCanvasGuardrails(canvas);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.kind).toBe('containment');
    expect(warnings[0]!.elementIds).toEqual(['tbl', 'btn']);
  });

  it('flags a modal nested inside another modal', () => {
    const canvas = makeCanvas([
      element({ id: 'outer', kind: 'modal', bounds: { x: 0, y: 0, width: 500, height: 500 } }),
      element({ id: 'inner', kind: 'modal', bounds: { x: 40, y: 40, width: 300, height: 300 } }),
    ]);

    const warnings = findCanvasGuardrails(canvas);
    expect(warnings.map((warning) => warning.kind)).toContain('nested-modal');
  });

  it('flags two unscoped navbars competing for the same slot', () => {
    const canvas = makeCanvas([
      element({ id: 'nav-a', kind: 'navbar', bounds: { x: 0, y: 0, width: 800, height: 64 } }),
      element({ id: 'nav-b', kind: 'navbar', bounds: { x: 20, y: 10, width: 800, height: 64 } }),
    ]);

    const warnings = findCanvasGuardrails(canvas);
    expect(warnings.map((warning) => warning.kind)).toContain('duplicate-landmark');
  });

  it('does not flag a duplicate landmark once one is scoped to a state', () => {
    const canvas = makeCanvas([
      element({ id: 'nav-a', kind: 'navbar', bounds: { x: 0, y: 0, width: 800, height: 64 } }),
      element({
        id: 'nav-b',
        kind: 'navbar',
        bounds: { x: 20, y: 10, width: 800, height: 64 },
        intendedState: 'drawer',
      }),
    ]);

    expect(findCanvasGuardrails(canvas)).toHaveLength(0);
  });

  it('leaves an ordinary card-in-card layout alone', () => {
    const canvas = makeCanvas([
      element({ id: 'outer-card', kind: 'card', bounds: { x: 0, y: 0, width: 500, height: 400 } }),
      element({ id: 'inner-card', kind: 'card', bounds: { x: 40, y: 40, width: 300, height: 200 } }),
    ]);

    expect(findCanvasGuardrails(canvas)).toHaveLength(0);
  });
});
