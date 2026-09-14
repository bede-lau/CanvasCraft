import { describe, expect, it } from 'vitest';

import { AiScreenSpecDraft, type CanvasDoc } from '@canvascraft/schema';

import { mergeDraft } from '../ai.js';
import { compileScreenSpec } from '../compiler.js';

const createdAt = '2026-08-29T12:00:00.000Z';

function canvas(): CanvasDoc {
  return {
    version: 1,
    id: 'canvas-dashboard',
    title: 'Account dashboard',
    size: { width: 1200, height: 800 },
    baseImage: null,
    elements: [
      { id: 'nav', kind: 'navbar', bounds: { x: 0, y: 0, width: 1200, height: 72 }, rotation: 0, z: 0, label: 'Workspace', children: [] },
      { id: 'search', kind: 'input', bounds: { x: 80, y: 120, width: 320, height: 48 }, rotation: 0, z: 1, label: 'Filter accounts', children: [] },
      { id: 'table', kind: 'table', bounds: { x: 80, y: 210, width: 780, height: 430 }, rotation: 0, z: 2, label: 'Accounts', children: [] },
      { id: 'modal', kind: 'modal', bounds: { x: 880, y: 210, width: 260, height: 280 }, rotation: 0, z: 3, label: 'Account details', children: [] },
    ],
    arrows: [
      { id: 'open-details', from: 'table', to: 'modal', interaction: 'open-modal', label: 'Open account details', points: [] },
    ],
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
    createdAt,
    updatedAt: createdAt,
  };
}

/**
 * A draft that tries to move everything the model is not allowed to move:
 * layout regions, nesting, state visibility, and the drawn interaction.
 */
function hostileDraft(spec: ReturnType<typeof compileScreenSpec>) {
  return AiScreenSpecDraft.parse({
    name: 'Rewritten dashboard',
    intent: 'A rewritten intent grounded in the notes.',
    audience: 'Customer success teams.',
    regions: spec.regions.map((region, index) => ({
      id: region.id,
      sourceElementId: region.sourceElementId,
      role: region.role,
      // Every one of these is a structural claim the model must not win.
      region: 'footer',
      label: `Renamed ${region.label}`,
      purpose: 'A richer purpose sentence grounded in the canvas.',
      order: 99 - index,
      children: spec.regions.filter((other) => other.id !== region.id).map((other) => other.id),
      visibleInStates: ['error'],
      contentShape: region.contentShape,
    })),
    interactions: [
      {
        id: 'invented-flow',
        sourceArrowId: 'no-such-arrow',
        kind: 'open-drawer',
        fromRegion: spec.regions[0]!.id,
        toRegion: spec.regions[1]!.id,
        fromState: null,
        toState: 'drawer',
        description: 'An interaction nobody drew.',
        auditionable: true,
      },
    ],
    states: spec.states.map((state) => ({
      id: state.id,
      label: state.label,
      description: state.description,
      hiddenRegions: [],
      placeholderRegions: [],
    })),
    fixtures: [],
    ambiguities: [],
    stacksBelowNarrow: [],
    collapsesBelowNarrow: [],
  });
}

describe('AI enrichment is content-only', () => {
  it('keeps every region\'s bounds, order, and layout region from the deterministic compiler', () => {
    const doc = canvas();
    const spec = compileScreenSpec(doc);
    const merged = mergeDraft(doc, spec, hostileDraft(spec));

    expect(merged.regions).toHaveLength(spec.regions.length);
    for (const [index, region] of merged.regions.entries()) {
      const original = spec.regions[index]!;
      expect(region.id).toBe(original.id);
      expect(region.sourceElementId).toBe(original.sourceElementId);
      expect(region.region).toBe(original.region);
      expect(region.order).toBe(original.order);
      expect(region.sourceBounds).toEqual(original.sourceBounds);
      expect(region.children).toEqual(original.children);
      expect(region.visibleInStates).toEqual(original.visibleInStates);
    }
  });

  it('still adopts the naming and meaning the model is asked for', () => {
    const doc = canvas();
    const spec = compileScreenSpec(doc);
    const merged = mergeDraft(doc, spec, hostileDraft(spec));

    expect(merged.name).toBe('Rewritten dashboard');
    expect(merged.intent).toBe('A rewritten intent grounded in the notes.');
    expect(merged.regions.every((region) => region.label.startsWith('Renamed '))).toBe(true);
  });

  it('drops an interaction whose sourceArrowId is not on the canvas', () => {
    const doc = canvas();
    const spec = compileScreenSpec(doc);
    const merged = mergeDraft(doc, spec, hostileDraft(spec));

    expect(merged.interactions.map((interaction) => interaction.sourceArrowId)).toEqual(['open-details']);
    expect(merged.interactions.every((interaction) => interaction.id !== 'invented-flow')).toBe(true);
    expect(merged.interactions[0]!.kind).toBe('open-modal');
  });

  it('lets the model reword a drawn interaction without moving it', () => {
    const doc = canvas();
    const spec = compileScreenSpec(doc);
    const draft = hostileDraft(spec);
    const deterministic = spec.interactions[0]!;
    draft.interactions = [
      {
        id: 'reworded',
        sourceArrowId: 'open-details',
        kind: 'open-drawer',
        fromRegion: deterministic.toRegion,
        toRegion: deterministic.fromRegion,
        fromState: null,
        toState: 'drawer',
        description: 'Opens the full account record.',
        auditionable: false,
      },
    ];
    const merged = mergeDraft(doc, spec, draft);

    expect(merged.interactions).toHaveLength(1);
    expect(merged.interactions[0]!.description).toBe('Opens the full account record.');
    expect(merged.interactions[0]!.auditionable).toBe(false);
    // Direction, kind, and target state stay as drawn.
    expect(merged.interactions[0]!.kind).toBe(deterministic.kind);
    expect(merged.interactions[0]!.fromRegion).toBe(deterministic.fromRegion);
    expect(merged.interactions[0]!.toRegion).toBe(deterministic.toRegion);
    expect(merged.interactions[0]!.toState).toBe(deterministic.toState);
  });
});

describe('deterministic region order follows the drawing, not placement order', () => {
  it('orders regions by drawn position even when z contradicts it', () => {
    const doc = canvas();
    // Placement order is the reverse of reading order: the lowest element on the
    // canvas was stamped first, so z ascends as y descends.
    doc.elements = [
      { id: 'bottom', kind: 'card', bounds: { x: 80, y: 600, width: 200, height: 80 }, rotation: 0, z: 1, label: 'Bottom', children: [] },
      { id: 'middle', kind: 'card', bounds: { x: 80, y: 300, width: 200, height: 80 }, rotation: 0, z: 2, label: 'Middle', children: [] },
      { id: 'top', kind: 'card', bounds: { x: 80, y: 100, width: 200, height: 80 }, rotation: 0, z: 3, label: 'Top', children: [] },
    ];
    doc.arrows = [];

    const spec = compileScreenSpec(doc);
    expect(spec.regions.map((region) => region.sourceElementId)).toEqual(['top', 'middle', 'bottom']);
    expect(spec.regions.map((region) => region.order)).toEqual([0, 1, 2]);
  });

  it('reads left to right when two elements sit on the same row', () => {
    const doc = canvas();
    doc.elements = [
      { id: 'right', kind: 'card', bounds: { x: 600, y: 200, width: 200, height: 80 }, rotation: 0, z: 1, label: 'Right', children: [] },
      { id: 'left', kind: 'card', bounds: { x: 80, y: 200, width: 200, height: 80 }, rotation: 0, z: 2, label: 'Left', children: [] },
    ];
    doc.arrows = [];

    const spec = compileScreenSpec(doc);
    expect(spec.regions.map((region) => region.sourceElementId)).toEqual(['left', 'right']);
  });

  it('falls back to z only for stamps drawn at the same point', () => {
    const doc = canvas();
    doc.elements = [
      { id: 'over', kind: 'card', bounds: { x: 80, y: 200, width: 200, height: 80 }, rotation: 0, z: 9, label: 'Over', children: [] },
      { id: 'under', kind: 'card', bounds: { x: 80, y: 200, width: 200, height: 80 }, rotation: 0, z: 2, label: 'Under', children: [] },
    ];
    doc.arrows = [];

    const spec = compileScreenSpec(doc);
    expect(spec.regions.map((region) => region.sourceElementId)).toEqual(['under', 'over']);
  });
});
