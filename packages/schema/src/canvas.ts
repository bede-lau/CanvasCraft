import { z } from 'zod';
import {
  Bounds,
  ButtonShape,
  InteractionKind,
  MotionIntensity,
  MotionPreset,
  PageArchetype,
  StampKind,
  StateKind,
} from './primitives.js';

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

/**
 * Curated visual preferences applied consistently to every generated direction.
 * They deliberately steer a limited design system rather than expose arbitrary
 * CSS values, keeping the branch comparison contract intact.
 */
export const CanvasDesignPreferences = z.object({
  /**
   * What kind of page this is. The most consequential control on the toolbar:
   * it selects the layout shell, the background treatment, the component
   * vocabulary, and the motion system every direction may draw from. The three
   * directions then diverge *within* it.
   */
  archetype: PageArchetype.default('application'),
  displayFont: z.enum(['grotesk', 'serif', 'rounded', 'mono']).default('grotesk'),
  bodyFont: z.enum(['clean', 'humanist', 'serif', 'mono']).default('clean'),
  buttonShape: ButtonShape.default('soft'),
  motionPreset: MotionPreset.default('calm'),
  motionIntensity: MotionIntensity.default('moderate'),
});
export type CanvasDesignPreferences = z.infer<typeof CanvasDesignPreferences>;

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
  designPreferences: CanvasDesignPreferences.default({
    archetype: 'application',
    displayFont: 'grotesk',
    bodyFont: 'clean',
    buttonShape: 'soft',
    motionPreset: 'calm',
    motionIntensity: 'moderate',
  }),
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
 * Kinds that render as one small, atomic control. Compiling a screen never
 * gives a stamp a slot *inside* another stamp — every stamp becomes its own
 * flat region (see `compileScreenSpec`'s `children: []`) — so drawing a
 * structural region on top of a leaf control does not nest it, it just
 * detaches it into an independent region at generation time.
 */
const LEAF_KINDS = new Set<StampKind>(['button', 'input', 'tab']);

/** Kinds that represent a whole region, not a single control. */
const STRUCTURAL_KINDS = new Set<StampKind>(['navbar', 'hero', 'table', 'sidebar', 'modal']);

/** Kinds a screen normally has exactly one of. */
const SINGLETON_KINDS = new Set<StampKind>(['navbar', 'hero']);

function boundsArea(bounds: Bounds): number {
  return bounds.width * bounds.height;
}

function boundsIntersection(a: Bounds, b: Bounds): Bounds | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** What fraction of `inner` sits inside `outer`, 0–1. */
function containmentRatio(inner: Bounds, outer: Bounds): number {
  const overlap = boundsIntersection(inner, outer);
  if (!overlap) return 0;
  return boundsArea(overlap) / boundsArea(inner);
}

/** A drawing-time nudge: never blocks generation, only explains a risk. */
export interface CanvasGuardrail {
  id: string;
  elementIds: string[];
  kind: 'containment' | 'duplicate-landmark' | 'nested-modal';
  message: string;
}

/**
 * Soft, geometry-only guardrails over stamp placement.
 *
 * These are deliberately not validation errors — nothing here stops
 * generation, because a sketch is allowed to be wrong on purpose. They exist
 * so the two ways a drawn nesting silently fails to reach the generated page
 * (flattening, and two singleton landmarks competing for one slot) are
 * visible while the user is still drawing, not after the branches come back
 * looking nothing like the sketch.
 */
export function findCanvasGuardrails(doc: CanvasDoc): CanvasGuardrail[] {
  const warnings: CanvasGuardrail[] = [];
  const elements = doc.elements;

  for (const inner of elements) {
    for (const outer of elements) {
      if (inner.id === outer.id) continue;
      if (containmentRatio(inner.bounds, outer.bounds) < 0.85) continue;

      if (inner.kind === 'modal' && outer.kind === 'modal') {
        warnings.push({
          id: `nested-modal-${inner.id}-${outer.id}`,
          elementIds: [inner.id, outer.id],
          kind: 'nested-modal',
          message: `"${inner.label || 'Modal'}" sits inside "${outer.label || 'Modal'}" — two overlays can't both be on top. Give one its own state (Appears in → Modal only) or move them apart.`,
        });
        continue;
      }

      if (STRUCTURAL_KINDS.has(inner.kind) && LEAF_KINDS.has(outer.kind)) {
        warnings.push({
          id: `containment-${inner.id}-${outer.id}`,
          elementIds: [inner.id, outer.id],
          kind: 'containment',
          message: `"${inner.label || inner.kind}" is drawn inside "${outer.label || outer.kind}" — a ${outer.kind} renders as one small control, so it won't hold a ${inner.kind}. It'll come back as its own separate region instead of nested.`,
        });
      }
    }
  }

  for (const kind of SINGLETON_KINDS) {
    const candidates = elements.filter((element) => element.kind === kind && !element.intendedState);
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const a = candidates[i]!;
        const b = candidates[j]!;
        const overlap = boundsIntersection(a.bounds, b.bounds);
        if (!overlap) continue;
        const ratio = boundsArea(overlap) / Math.min(boundsArea(a.bounds), boundsArea(b.bounds));
        if (ratio < 0.3) continue;
        warnings.push({
          id: `duplicate-${kind}-${a.id}-${b.id}`,
          elementIds: [a.id, b.id],
          kind: 'duplicate-landmark',
          message: `Two ${kind}s overlap and neither is scoped to a state — only one will win. Scope one under "Appears in" if that's intentional.`,
        });
      }
    }
  }

  return warnings;
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
