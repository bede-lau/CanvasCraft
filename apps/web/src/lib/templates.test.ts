import { describe, expect, it } from 'vitest';
import { CanvasDoc, findCanvasGuardrails, findCanvasIntegrityIssues } from '@canvascraft/schema';
import { CANVAS_TEMPLATES } from './templates';

describe('canvas templates', () => {
  it.each(CANVAS_TEMPLATES)('$name is a schema-valid, self-consistent canvas', (template) => {
    const doc = template.build();
    expect(() => CanvasDoc.parse(doc)).not.toThrow();
    expect(doc.designPreferences.archetype).toBe(template.archetype);
    expect(findCanvasIntegrityIssues(doc)).toHaveLength(0);
    expect(findCanvasGuardrails(doc)).toHaveLength(0);
    expect(doc.elements.length).toBeGreaterThan(0);
    expect(doc.arrows.length).toBeGreaterThan(0);
    expect(doc.notes.length).toBeGreaterThan(0);
  });

  it('builds a fresh id and timestamp each time, so picking twice never aliases state', () => {
    const first = CANVAS_TEMPLATES[0]!.build();
    const second = CANVAS_TEMPLATES[0]!.build();
    expect(first.id).not.toBe(second.id);
  });

  it('covers every page archetype exactly once', () => {
    const archetypes = CANVAS_TEMPLATES.map((template) => template.archetype).sort();
    expect(archetypes).toEqual(['ai-native', 'application', 'marketing', 'portfolio']);
  });
});
