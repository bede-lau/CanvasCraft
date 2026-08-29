import { z } from 'zod';
import { Bounds, InteractionKind, StampKind, StateKind } from './primitives.js';

/**
 * The Canvas Document.
 *
 * This is the source of truth for generation whenever it exists. The rendered
 * PNG is a corroborating input for the vision model, never a replacement — if
 * the two disagree, this wins.
 */

/** A placed UI stamp. */
export const CanvasElement = z.object({
  id: z.string().min(1),
  kind: StampKind,
  bounds: Bounds,
  /** Rotation in degrees. Stamps are usually axis-aligned but sketches are not. */
  rotation: z.number().default(0),
  /** Draw order. Higher paints later. */
  z: z.number().int().default(0),
  /** What the user typed on the stamp, e.g. "Revenue" or "Search projects". */
  label: z.string().max(200).default(''),
  /**
   * Which local state this element belongs to, when the user drew a state
   * variant explicitly. Unset means "present in every state".
   */
  intendedState: StateKind.optional(),
  /** Element ids this one visually contains, resolved at serialisation time. */
  children: z.array(z.string()).default([]),
});
export type CanvasElement = z.infer<typeof CanvasElement>;

/** A labelled interaction arrow between two elements. */
export const CanvasArrow = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  /**
   * The intended outcome. Free-text arrow labels are classified into this
   * closed set by the deterministic pre-pass before the model sees them.
   */
  interaction: InteractionKind,
  /** The user's own words, preserved for the model and for the UI. */
  label: z.string().max(200).default(''),
  /** Control points for the drawn curve, in canvas coordinates. */
  points: z.array(z.object({ x: z.number(), y: z.number() })).default([]),
});
export type CanvasArrow = z.infer<typeof CanvasArrow>;

/** A sticky note carrying plain-language intent. */
export const CanvasNote = z.object({
  id: z.string().min(1),
  text: z.string().max(2000),
  bounds: Bounds,
  /** Element this note is about, when the user anchored it. */
  anchorElementId: z.string().optional(),
  /** User-chosen sticky colour. Purely visual; carries no semantics. */
  tone: z.enum(['amber', 'mint', 'lilac', 'slate']).default('amber'),
});
export type CanvasNote = z.infer<typeof CanvasNote>;

/** A freehand mark. Kept for the render and for unclassified regions. */
export const CanvasStroke = z.object({
  id: z.string().min(1),
  /** Flattened [x0, y0, x1, y1, …] as Konva expects. */
  points: z.array(z.number()),
  color: z.string().default('#e8ebf2'),
  width: z.number().positive().default(2),
  /** Eraser strokes composite differently but serialise the same way. */
  mode: z.enum(['draw', 'erase']).default('draw'),
});
export type CanvasStroke = z.infer<typeof CanvasStroke>;

/** An uploaded wireframe photo or screenshot used as the canvas base layer. */
export const CanvasBaseImage = z.object({
  /** Relative path inside the run directory, or a data URL during editing. */
  src: z.string().min(1),
  bounds: Bounds,
  /** 0–1. Users dim the photo to mark it up. */
  opacity: z.number().min(0).max(1).default(1),
});
export type CanvasBaseImage = z.infer<typeof CanvasBaseImage>;

export const CanvasDoc = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  title: z.string().max(120).default('Untitled wireframe'),
  /** Logical canvas size. The viewport pans and zooms over this. */
  size: z.object({ width: z.number().positive(), height: z.number().positive() }),
  baseImage: CanvasBaseImage.nullable().default(null),
  elements: z.array(CanvasElement).default([]),
  arrows: z.array(CanvasArrow).default([]),
  notes: z.array(CanvasNote).default([]),
  strokes: z.array(CanvasStroke).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CanvasDoc = z.infer<typeof CanvasDoc>;

/**
 * Referential integrity. Zod cannot express "arrow.from must name an element",
 * so it is checked here and reported as a list rather than thrown, because the
 * UI shows these as fixable warnings while the user is still drawing.
 */
export function findCanvasIntegrityIssues(doc: CanvasDoc): string[] {
  const issues: string[] = [];
  const elementIds = new Set(doc.elements.map((element) => element.id));

  for (const arrow of doc.arrows) {
    if (!elementIds.has(arrow.from)) {
      issues.push(`Arrow ${arrow.id} starts at "${arrow.from}", which is not on the canvas.`);
    }
    if (!elementIds.has(arrow.to)) {
      issues.push(`Arrow ${arrow.id} ends at "${arrow.to}", which is not on the canvas.`);
    }
    if (arrow.from === arrow.to) {
      issues.push(`Arrow ${arrow.id} points at its own source.`);
    }
  }

  for (const note of doc.notes) {
    if (note.anchorElementId && !elementIds.has(note.anchorElementId)) {
      issues.push(`Note ${note.id} is anchored to an element that is no longer on the canvas.`);
    }
  }

  for (const element of doc.elements) {
    for (const childId of element.children) {
      if (!elementIds.has(childId)) {
        issues.push(`Element ${element.id} contains "${childId}", which is not on the canvas.`);
      }
    }
  }

  return issues;
}

/**
 * Does the canvas carry enough intent to generate from?
 *
 * The acceptance criteria expect at least six stamp *types*, but that is the
 * demo bar, not the generation bar. One stamp is generatable; the UI nudges
 * toward richer input instead of blocking.
 */
export function summariseCanvasReadiness(doc: CanvasDoc): {
  ready: boolean;
  stampKinds: number;
  reasons: string[];
} {
  const stampKinds = new Set(doc.elements.map((element) => element.kind)).size;
  const reasons: string[] = [];

  if (doc.elements.length === 0 && !doc.baseImage) {
    reasons.push('Draw at least one element, or upload a wireframe to mark up.');
  }
  if (doc.elements.length > 0 && doc.arrows.length === 0) {
    reasons.push('Add an interaction arrow so the branches share a drawn flow.');
  }
  if (doc.notes.length === 0) {
    reasons.push('Add a note to say what this screen is for.');
  }

  return {
    ready: doc.elements.length > 0 || doc.baseImage !== null,
    stampKinds,
    reasons,
  };
}
