import {
  ArrowRight,
  BringToFront,
  ChevronDown,
  Eraser,
  ImagePlus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  Fragment,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import { Arrow, Image as KonvaImage, Label, Layer, Line, Rect, Stage, Tag, Text, Transformer } from 'react-konva';
import useImage from 'use-image';
import {
  CanvasDesignPreferences,
  CanvasDoc,
  CanvasElement,
  CanvasNote,
  findCanvasGuardrails,
  findCanvasIntegrityIssues,
  summariseCanvasReadiness,
  type InteractionKind,
  type StampKind,
  type StateKind,
} from '@canvascraft/schema';
import Konva from 'konva';
import { STAMPS, KIND_META } from '../lib/stampKinds';

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type CanvasTheme = 'light' | 'dark';

/**
 * Konva paints to a `<canvas>`, not the DOM — CSS custom properties never
 * reach it. This is the canvas-side mirror of the app's `--cc-*` tokens
 * (apps/web/src/styles.css) so the drawing board actually follows the
 * light/dark toggle instead of always rendering the old fixed dark theme
 * regardless of it.
 */
const CANVAS_PALETTE: Record<CanvasTheme, {
  artboard: string;
  grid: string;
  elementFill: string;
  elementFillSelected: string;
  elementStroke: string;
  accent: string;
  accentStrong: string;
  labelText: string;
  drawInk: string;
  eraseGhost: string;
  chipBg: string;
  chipText: string;
}> = {
  dark: {
    artboard: '#0d1015',
    grid: '#252b36',
    elementFill: '#171b22',
    elementFillSelected: '#2a2116',
    elementStroke: '#596173',
    accent: '#f0b860',
    accentStrong: '#ffd487',
    labelText: '#e8ebf2',
    drawInk: '#e8ebf2',
    eraseGhost: 'rgba(232, 235, 242, 0.4)',
    chipBg: '#15130f',
    chipText: '#ffd487',
  },
  light: {
    artboard: '#ffffff',
    grid: '#e7e2d8',
    elementFill: '#f7f5f1',
    elementFillSelected: '#fdf0d9',
    elementStroke: '#c7c0b2',
    // Matches --cc-lamp's light value (apps/web/src/styles.css) — #9a6b18
    // read 3.96:1 on a similar surface, under the 4.5:1 text floor.
    accent: '#875c0d',
    accentStrong: '#6e4c0e',
    labelText: '#211f1b',
    drawInk: '#211f1b',
    eraseGhost: 'rgba(33, 31, 27, 0.35)',
    chipBg: '#fdf0d9',
    chipText: '#6e4c0e',
  },
};

/** Buttons, inputs, and tabs are what the "Buttons" shape control reshapes. */
const SHAPE_TUNABLE_KINDS = new Set<StampKind>(['button', 'input', 'tab']);

function cornerRadiusFor(
  kind: StampKind,
  shape: CanvasDesignPreferences['buttonShape'],
  height: number,
): number {
  if (!SHAPE_TUNABLE_KINDS.has(kind)) return 12;
  if (shape === 'sharp') return 2;
  if (shape === 'pill') return height / 2;
  return 10;
}

/**
 * Konva paints labels straight onto the canvas with nothing to clip an
 * overflowing string, so a long label just spills past its shape. These
 * helpers keep text inside its box: an element label shrinks to fit its
 * fixed control, and a note grows its box down to the text first, only
 * shrinking the font once the box hits its ceiling.
 */
let textMeasurer: Konva.Text | null = null;
function measureTextHeight(
  text: string,
  width: number,
  fontSize: number,
  fontStyle: string,
  lineHeight: number,
  fontFamily: string,
): number {
  if (!textMeasurer) textMeasurer = new Konva.Text();
  textMeasurer.text(text || ' ');
  textMeasurer.width(Math.max(1, width));
  textMeasurer.fontSize(fontSize);
  textMeasurer.fontStyle(fontStyle);
  textMeasurer.fontFamily(fontFamily);
  textMeasurer.lineHeight(lineHeight);
  textMeasurer.wrap('word');
  return textMeasurer.height();
}

const labelFitCache = new Map<string, number>();
/** Largest size in `[min, max]` at which `text` word-wraps within `width × height`. */
function fitLabelFontSize(
  text: string,
  width: number,
  height: number,
  max: number,
  min: number,
  fontStyle: string,
  fontFamily: string,
): number {
  if (!text || width <= 0 || height <= 0) return max;
  const key = `${fontFamily}|${fontStyle}|${max}|${min}|${Math.round(width)}|${Math.round(height)}|${text}`;
  const cached = labelFitCache.get(key);
  if (cached !== undefined) return cached;
  let result = min;
  for (let size = Math.round(max); size >= min; size -= 1) {
    if (measureTextHeight(text, width, size, fontStyle, 1.2, fontFamily) <= height) {
      result = size;
      break;
    }
  }
  if (labelFitCache.size > 600) labelFitCache.clear();
  labelFitCache.set(key, result);
  return result;
}

const NOTE_PAD = 10;
const NOTE_BASE_FONT = 13;
const NOTE_MIN_FONT = 9;
const NOTE_MAX_HEIGHT = 240;
const noteFitCache = new Map<string, { fontSize: number; height: number }>();
/**
 * A note box grows down to fit its text at a comfortable size; once it would
 * pass `NOTE_MAX_HEIGHT` the font shrinks instead. The stored bounds height is
 * a floor, so a deliberately tall note stays tall.
 */
function fitNote(
  text: string,
  boxWidth: number,
  minHeight: number,
  fontFamily: string,
): { fontSize: number; height: number } {
  const innerWidth = Math.max(20, boxWidth - NOTE_PAD * 2);
  const key = `${fontFamily}|${Math.round(innerWidth)}|${Math.round(minHeight)}|${text}`;
  const cached = noteFitCache.get(key);
  if (cached) return cached;
  const grownHeight = measureTextHeight(text, innerWidth, NOTE_BASE_FONT, 'normal', 1.3, fontFamily);
  let fit: { fontSize: number; height: number };
  if (grownHeight + NOTE_PAD * 2 <= NOTE_MAX_HEIGHT) {
    fit = { fontSize: NOTE_BASE_FONT, height: Math.max(minHeight, Math.round(grownHeight + NOTE_PAD * 2)) };
  } else {
    let fontSize = NOTE_MIN_FONT;
    for (let candidate = NOTE_BASE_FONT - 1; candidate > NOTE_MIN_FONT; candidate -= 1) {
      if (measureTextHeight(text, innerWidth, candidate, 'normal', 1.3, fontFamily) + NOTE_PAD * 2 <= NOTE_MAX_HEIGHT) {
        fontSize = candidate;
        break;
      }
    }
    fit = { fontSize, height: Math.max(minHeight, NOTE_MAX_HEIGHT) };
  }
  if (noteFitCache.size > 400) noteFitCache.clear();
  noteFitCache.set(key, fit);
  return fit;
}

type Tool = 'select' | 'draw' | 'erase' | 'arrow' | 'note';

const DISPLAY_FONT_OPTIONS: Array<{ value: CanvasDesignPreferences['displayFont']; label: string }> = [
  { value: 'grotesk', label: 'Grotesk' },
  { value: 'serif', label: 'Editorial serif' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'mono', label: 'Monospace' },
];

const BODY_FONT_OPTIONS: Array<{ value: CanvasDesignPreferences['bodyFont']; label: string }> = [
  { value: 'clean', label: 'Clean sans' },
  { value: 'humanist', label: 'Humanist' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
];

/**
 * CSS stacks so each Heading/Body option renders in the family it names,
 * instead of every choice reading in one UI font. Mirrors the compiler's
 * DISPLAY_FONT_STACKS / BODY_FONT_STACKS (apps/orchestrator/src/compiler.ts) —
 * the generated directions use those exact families. Only the three
 * @fontsource-variable faces (web/src/main.tsx) are bundled; the rest resolve
 * to platform fonts.
 */
const DISPLAY_FONT_PREVIEW: Record<CanvasDesignPreferences['displayFont'], string> = {
  grotesk: '"Bricolage Grotesque Variable", "Avenir Next", Inter, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: '"Arial Rounded MT Bold", "Trebuchet MS", ui-rounded, system-ui, sans-serif',
  mono: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
};

const BODY_FONT_PREVIEW: Record<CanvasDesignPreferences['bodyFont'], string> = {
  clean: '"Geist Variable", Inter, system-ui, sans-serif',
  humanist: '"Segoe UI", "Avenir Next", Candara, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
};

/**
 * The most consequential control on the toolbar.
 *
 * It selects the layout shell, the background treatment, the component
 * vocabulary, and the motion system every generated direction draws from — the
 * three directions then diverge *within* it. Labelled by what the user is
 * building rather than by the enum value, because "ai-native" is a schema term
 * and "AI product" is a thing someone is making.
 */
const ARCHETYPE_OPTIONS: Array<{
  value: CanvasDesignPreferences['archetype'];
  label: string;
  hint: string;
}> = [
  { value: 'marketing', label: 'Landing page', hint: 'Oversized type, gradient ground, scroll reveals' },
  { value: 'application', label: 'App / dashboard', hint: 'Bento panels, real depth, dense data' },
  { value: 'portfolio', label: 'Portfolio', hint: 'Large media, parallax, grain' },
  { value: 'ai-native', label: 'AI product', hint: 'Aurora ground, streaming primitives, glass' },
];

const MOTION_INTENSITIES: CanvasDesignPreferences['motionIntensity'][] = [
  'none',
  'subtle',
  'moderate',
  'expressive',
];

/**
 * State variants a stamp can be scoped to.
 *
 * Leaving this unset is the norm and means "present in every state"; picking one
 * marks the stamp as belonging only to that variant, which is how a modal or an
 * empty state gets drawn without appearing in the default screen. `default` and
 * `narrow` are omitted because every screen always has them.
 */
const STATE_VARIANTS: Array<{ value: StateKind; label: string }> = [
  { value: 'modal', label: 'Modal only' },
  { value: 'drawer', label: 'Drawer only' },
  { value: 'filtered', label: 'Filtered only' },
  { value: 'selected', label: 'Selected only' },
  { value: 'empty', label: 'Empty only' },
  { value: 'loading', label: 'Loading only' },
  { value: 'success', label: 'Success only' },
  { value: 'error', label: 'Error only' },
];

const INTERACTIONS: Array<{ value: InteractionKind; label: string }> = [
  { value: 'navigate-tab', label: 'Navigate tab' },
  { value: 'open-modal', label: 'Open modal' },
  { value: 'open-drawer', label: 'Open drawer' },
  { value: 'show-filtered-state', label: 'Show filtered state' },
  { value: 'select-item', label: 'Select item' },
  { value: 'advance-carousel', label: 'Advance carousel' },
  { value: 'next-step', label: 'Next step' },
  { value: 'submit-with-validation', label: 'Submit with validation' },
  { value: 'show-toast', label: 'Show toast' },
  { value: 'reset-state', label: 'Reset state' },
];

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function canvasClone(doc: CanvasDoc): CanvasDoc {
  return structuredClone(doc);
}

/**
 * The artboard background rect.
 *
 * Named because a pointer event inside the visible artboard lands on this rect,
 * not on the Stage — so a bare `target === stage` test treats every click on the
 * board itself as a click on an element, which is why placing a note only worked
 * in the margin outside the board.
 */
const ARTBOARD_SURFACE = 'artboard-surface';

function BaseImage({ doc }: { doc: CanvasDoc }) {
  const [image] = useImage(doc.baseImage?.src ?? '');
  if (!doc.baseImage || !image) return null;
  return (
    <KonvaImage
      image={image}
      x={doc.baseImage.bounds.x}
      y={doc.baseImage.bounds.y}
      width={doc.baseImage.bounds.width}
      height={doc.baseImage.bounds.height}
      opacity={doc.baseImage.opacity}
      listening={false}
    />
  );
}

export function CanvasStudio({
  value,
  onChange,
  selectedId,
  onSelect,
  theme = 'dark',
  compact = false,
}: {
  value: CanvasDoc;
  onChange: (doc: CanvasDoc) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  theme?: CanvasTheme;
  compact?: boolean;
}) {
  const palette = CANVAS_PALETTE[theme];
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [tool, setTool] = useState<Tool>('select');
  const [scale, setScale] = useState(0.75);
  const [position, setPosition] = useState({ x: 18, y: 18 });
  // Kind badges are DOM overlays placed from element/stage coordinates that
  // only React state carries. During a drag Konva moves the shape on the frame
  // but that state updates a beat later, so the badges trail the sketch. These
  // hold the in-flight positions so the overlay tracks the drag in real time.
  const [liveDrags, setLiveDrags] = useState<Record<string, { x: number; y: number }>>({});
  const [strokeDraft, setStrokeDraft] = useState<number[] | null>(null);
  const [arrowStart, setArrowStart] = useState<string | null>(null);
  const [history, setHistory] = useState<CanvasDoc[]>([]);
  const [future, setFuture] = useState<CanvasDoc[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stampMenuRef = useRef<HTMLDivElement>(null);
  const [stampMenuOpen, setStampMenuOpen] = useState(false);
  const designPreferences = CanvasDesignPreferences.parse(value.designPreferences ?? {});

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 1) {
        setViewportWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage || !selectedId) {
      transformer?.nodes([]);
      return;
    }
    const node = stage.findOne(`#${selectedId}`);
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, value.elements]);

  const commit = (next: CanvasDoc) => {
    setHistory((entries) => [...entries.slice(-24), canvasClone(value)]);
    setFuture([]);
    onChange(CanvasDoc.parse({ ...next, updatedAt: new Date().toISOString() }));
  };

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((entries) => entries.slice(0, -1));
    setFuture((entries) => [canvasClone(value), ...entries].slice(0, 25));
    onChange(previous);
    onSelect(null);
  }, [history, onChange, onSelect, value]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture((entries) => entries.slice(1));
    setHistory((entries) => [...entries, canvasClone(value)].slice(-25));
    onChange(next);
  }, [future, onChange, value]);

  const addStamp = (stamp: (typeof STAMPS)[number]) => {
    const offset = value.elements.length * 18;
    const element = CanvasElement.parse({
      id: uid(stamp.kind),
      kind: stamp.kind,
      bounds: {
        x: 110 + (offset % 280),
        y: 110 + (offset % 220),
        width: stamp.width,
        height: stamp.height,
      },
      label: stamp.label,
      z: value.elements.length + 1,
    });
    commit({ ...value, elements: [...value.elements, element] });
    onSelect(element.id);
    setTool('select');
  };

  const updateDesignPreferences = (patch: Partial<CanvasDesignPreferences>) => {
    commit({
      ...value,
      designPreferences: {
        ...designPreferences,
        ...patch,
      },
    });
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit({
      ...value,
      elements: value.elements.filter((element) => element.id !== selectedId),
      arrows: value.arrows.filter(
        (arrow) => arrow.id !== selectedId && arrow.from !== selectedId && arrow.to !== selectedId,
      ),
      notes: value.notes.filter((note) => note.id !== selectedId && note.anchorElementId !== selectedId),
    });
    onSelect(null);
  }, [onSelect, selectedId, value]);

  useEffect(() => {
    if (compact) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (event.key !== 'Delete') return;
      event.preventDefault();
      deleteSelected();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [compact, deleteSelected, redo, undo]);

  useEffect(() => {
    if (!stampMenuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (event.target instanceof Node && !stampMenuRef.current?.contains(event.target)) {
        setStampMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStampMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [stampMenuOpen]);

  const onStagePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = event.target.getStage();
    if (!stage) return;
    const pointer = stage.getRelativePointerPosition();
    if (!pointer) return;

    if (tool === 'draw' || tool === 'erase') {
      setStrokeDraft([pointer.x, pointer.y]);
      return;
    }
    const onBackground = event.target === stage || event.target.name() === ARTBOARD_SURFACE;

    if (tool === 'note' && onBackground) {
      const note = CanvasNote.parse({
        id: uid('note'),
        text: 'Describe intent…',
        bounds: { x: pointer.x, y: pointer.y, width: 220, height: 92 },
        tone: 'amber',
      });
      commit({ ...value, notes: [...value.notes, note] });
      onSelect(note.id);
      setTool('select');
      return;
    }
    if (onBackground) {
      onSelect(null);
      setArrowStart(null);
    }
  };

  const onStagePointerMove = () => {
    if (!strokeDraft) return;
    const pointer = stageRef.current?.getRelativePointerPosition();
    if (!pointer) return;
    setStrokeDraft([...strokeDraft, pointer.x, pointer.y]);
  };

  const onStagePointerUp = () => {
    if (!strokeDraft) return;
    if (strokeDraft.length >= 4) {
      commit({
        ...value,
        strokes: [
          ...value.strokes,
          {
            id: uid('stroke'),
            points: strokeDraft,
            // Erase strokes composite with destination-out (see the Line
            // below), so their stored color never actually paints anything —
            // only draw strokes need real ink, and it has to be dark-on-light
            // or light-on-dark to stay visible against the current artboard.
            color: tool === 'erase' ? palette.artboard : palette.drawInk,
            width: tool === 'erase' ? 18 : 3,
            mode: tool === 'erase' ? 'erase' : 'draw',
          },
        ],
      });
    }
    setStrokeDraft(null);
  };

  const handleElementClick = (id: string) => {
    if (tool !== 'arrow') {
      onSelect(id);
      return;
    }
    if (!arrowStart) {
      setArrowStart(id);
      onSelect(id);
      return;
    }
    if (arrowStart === id) return;
    const from = value.elements.find((element) => element.id === arrowStart);
    const to = value.elements.find((element) => element.id === id);
    if (!from || !to) return;
    const points = [
      { x: from.bounds.x + from.bounds.width / 2, y: from.bounds.y + from.bounds.height / 2 },
      { x: to.bounds.x + to.bounds.width / 2, y: to.bounds.y + to.bounds.height / 2 },
    ];
    commit({
      ...value,
      arrows: [
        ...value.arrows,
        {
          id: uid('arrow'),
          from: arrowStart,
          to: id,
          interaction: 'open-modal',
          label: 'open modal',
          points,
        },
      ],
    });
    setArrowStart(null);
    setTool('select');
    onSelect(id);
  };

  const updateElementBounds = (id: string, node: Konva.Node) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    commit({
      ...value,
      elements: value.elements.map((element) =>
        element.id === id
          ? {
              ...element,
              bounds: {
                x: node.x(),
                y: node.y(),
                width: Math.max(44, node.width() * scaleX),
                height: Math.max(36, node.height() * scaleY),
              },
              rotation: node.rotation(),
            }
          : element,
      ),
    });
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 8 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      commit({
        ...value,
        baseImage: {
          src: reader.result,
          bounds: { x: 0, y: 0, width: value.size.width, height: value.size.height },
          opacity: 0.52,
        },
      });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const exportPng = () => {
    const transformer = transformerRef.current;
    transformer?.visible(false);
    transformer?.getLayer()?.batchDraw();
    const dataUrl = stageRef.current?.toDataURL({ pixelRatio: 1.5 }) ?? null;
    transformer?.visible(true);
    transformer?.getLayer()?.batchDraw();
    return dataUrl;
  };
  const selectedElement = value.elements.find((element) => element.id === selectedId);
  const selectedNote = value.notes.find((note) => note.id === selectedId);
  const selectedArrow = value.arrows.find((arrow) => arrow.id === selectedId);
  const issues = useMemo(() => findCanvasIntegrityIssues(value), [value]);
  const readiness = useMemo(() => summariseCanvasReadiness(value), [value]);
  const guardrails = useMemo(() => findCanvasGuardrails(value), [value]);
  const guardrailElementIds = useMemo(
    () => new Set(guardrails.flatMap((guardrail) => guardrail.elementIds)),
    [guardrails],
  );
  const stageHeight = compact ? 420 : Math.max(500, Math.min(720, window.innerHeight - 250));
  const fitScale = Math.min((viewportWidth - 36) / value.size.width, (stageHeight - 36) / value.size.height);

  return (
    <section className="canvas-studio" aria-label="Canvas Studio">
      {!compact ? (
        <div className="studio-toolbar" aria-label="Canvas tools">
          <div className="toolbar-group">
            {([
              ['select', MousePointer2, 'Select'],
              ['draw', Pencil, 'Draw'],
              ['erase', Eraser, 'Eraser'],
              ['arrow', ArrowRight, 'Connect'],
              ['note', StickyNote, 'Note'],
            ] as const).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                className={`icon-button ${tool === id ? 'is-active' : ''}`}
                aria-pressed={tool === id}
                aria-label={label}
                title={label}
                onClick={() => {
                  setTool(id);
                  setArrowStart(null);
                }}
              >
                <Icon size={17} />
              </button>
            ))}
          </div>

          <div className="toolbar-divider" />
          <div className="stamp-menu" ref={stampMenuRef}>
            <span>Add stamp</span>
            <button
              type="button"
              className="stamp-trigger"
              aria-expanded={stampMenuOpen}
              aria-haspopup="menu"
              aria-controls="stamp-picker-menu"
              onClick={() => setStampMenuOpen((open) => !open)}
            >
              <Plus size={15} aria-hidden="true" />
              <span>Choose element</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {stampMenuOpen ? (
              <div id="stamp-picker-menu" className="stamp-popover" role="menu" aria-label="Add an element stamp">
                {STAMPS.map((stamp) => {
                  const Icon = stamp.icon;
                  return (
                    <button
                      key={stamp.kind}
                      type="button"
                      role="menuitem"
                      className="stamp-option"
                      onClick={() => {
                        addStamp(stamp);
                        setStampMenuOpen(false);
                      }}
                    >
                      <span className="stamp-option__swatch" style={{ background: stamp.color }} aria-hidden="true">
                        <Icon size={13} strokeWidth={2.25} />
                      </span>
                      <span>{stamp.label}</span>
                      <small>{stamp.width} × {stamp.height}</small>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="design-controls" aria-label="Generated design system">
            <div className="design-control design-select design-select--archetype">
              <label htmlFor="page-archetype">Page</label>
              <select
                id="page-archetype"
                value={designPreferences.archetype}
                title={
                  ARCHETYPE_OPTIONS.find((option) => option.value === designPreferences.archetype)?.hint
                }
                onChange={(event) =>
                  updateDesignPreferences({ archetype: event.target.value as CanvasDesignPreferences['archetype'] })
                }
              >
                {ARCHETYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="design-control design-select">
              <label htmlFor="display-font">Heading</label>
              <select
                id="display-font"
                value={designPreferences.displayFont}
                style={{ fontFamily: DISPLAY_FONT_PREVIEW[designPreferences.displayFont] }}
                onChange={(event) =>
                  updateDesignPreferences({ displayFont: event.target.value as CanvasDesignPreferences['displayFont'] })
                }
              >
                {DISPLAY_FONT_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    style={{ fontFamily: DISPLAY_FONT_PREVIEW[option.value] }}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="design-control design-select">
              <label htmlFor="body-font">Body</label>
              <select
                id="body-font"
                value={designPreferences.bodyFont}
                style={{ fontFamily: BODY_FONT_PREVIEW[designPreferences.bodyFont] }}
                onChange={(event) =>
                  updateDesignPreferences({ bodyFont: event.target.value as CanvasDesignPreferences['bodyFont'] })
                }
              >
                {BODY_FONT_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    style={{ fontFamily: BODY_FONT_PREVIEW[option.value] }}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="design-control shape-control">
              <span>Buttons</span>
              <div role="group" aria-label="Button shape">
                {(['sharp', 'soft', 'pill'] as const).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    className={`shape-option ${designPreferences.buttonShape === shape ? 'is-active' : ''}`}
                    aria-label={`${shape.charAt(0).toUpperCase() + shape.slice(1)} button shape`}
                    aria-pressed={designPreferences.buttonShape === shape}
                    title={`${shape.charAt(0).toUpperCase() + shape.slice(1)} buttons`}
                    onClick={() => updateDesignPreferences({ buttonShape: shape })}
                  >
                    <span className={`shape-swatch is-${shape}`} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <div className="design-control design-select">
              <label htmlFor="motion-preset">Motion</label>
              <select
                id="motion-preset"
                value={designPreferences.motionPreset}
                onChange={(event) =>
                  updateDesignPreferences({ motionPreset: event.target.value as CanvasDesignPreferences['motionPreset'] })
                }
              >
                <option value="calm">Calm</option>
                <option value="playful">Playful</option>
                <option value="editorial">Editorial</option>
              </select>
            </div>
            <label className="design-control intensity-control" htmlFor="motion-intensity">
              <span>
                <SlidersHorizontal size={12} aria-hidden="true" />
                {designPreferences.motionIntensity}
              </span>
              <input
                id="motion-intensity"
                type="range"
                min="0"
                max={MOTION_INTENSITIES.length - 1}
                step="1"
                value={MOTION_INTENSITIES.indexOf(designPreferences.motionIntensity)}
                aria-label="Motion intensity"
                onChange={(event) =>
                  updateDesignPreferences({
                    motionIntensity: MOTION_INTENSITIES[Number(event.target.value)] ?? 'moderate',
                  })
                }
              />
            </label>
          </div>

          <div className="toolbar-spacer" />
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleUpload}
          />
          <button type="button" className="icon-button" title="Upload wireframe" aria-label="Upload wireframe" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Undo"
            aria-label="Undo"
            aria-keyshortcuts="Control+Z"
            disabled={history.length === 0}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Redo"
            aria-label="Redo"
            aria-keyshortcuts="Control+Shift+Z"
            disabled={future.length === 0}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Delete selection"
            aria-label="Delete selection"
            aria-keyshortcuts="Delete"
            disabled={!selectedId}
            onClick={deleteSelected}
          >
            <Trash2 size={17} />
          </button>
          <div className="zoom-control" aria-label="Canvas zoom">
            <button type="button" aria-label="Zoom out" onClick={() => setScale((current) => Math.max(0.35, current - 0.1))}>
              <ZoomOut size={15} />
            </button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" aria-label="Zoom in" onClick={() => setScale((current) => Math.min(1.5, current + 0.1))}>
              <ZoomIn size={15} />
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={`stage-shell ${tool === 'draw' ? 'is-drawing' : ''}`}
        ref={containerRef}
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          setScale((current) => Math.min(1.5, Math.max(0.35, current - event.deltaY * 0.001)));
        }}
      >
        <Stage
          ref={stageRef}
          width={viewportWidth}
          height={stageHeight}
          scaleX={compact ? fitScale : scale}
          scaleY={compact ? fitScale : scale}
          x={compact ? 18 : position.x}
          y={compact ? 18 : position.y}
          draggable={!compact && tool === 'select' && selectedId === null}
          onDragMove={(event) => {
            if (event.target === stageRef.current) setPosition({ x: event.target.x(), y: event.target.y() });
          }}
          onDragEnd={(event) => {
            if (event.target === stageRef.current) setPosition({ x: event.target.x(), y: event.target.y() });
          }}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
        >
          <Layer>
            <Rect
              name={ARTBOARD_SURFACE}
              x={0}
              y={0}
              width={value.size.width}
              height={value.size.height}
              fill={palette.artboard}
              cornerRadius={12}
              shadowBlur={theme === 'light' ? 18 : 30}
              shadowColor={theme === 'light' ? '#00000026' : '#000'}
            />
            <BaseImage doc={value} />
            {Array.from({ length: 22 }, (_, index) => (
              <Line key={`v-${index}`} points={[index * 52, 0, index * 52, value.size.height]} stroke={palette.grid} strokeWidth={1} opacity={0.6} listening={false} />
            ))}
            {Array.from({ length: 14 }, (_, index) => (
              <Line key={`h-${index}`} points={[0, index * 52, value.size.width, index * 52]} stroke={palette.grid} strokeWidth={1} opacity={0.6} listening={false} />
            ))}
            {value.strokes.map((stroke) => (
              <Line
                key={stroke.id}
                points={stroke.points}
                stroke={stroke.color}
                strokeWidth={stroke.width}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={stroke.mode === 'erase' ? 'destination-out' : 'source-over'}
                listening={false}
              />
            ))}
            {strokeDraft ? (
              <Line
                points={strokeDraft}
                stroke={tool === 'erase' ? palette.eraseGhost : palette.accent}
                strokeWidth={tool === 'erase' ? 18 : 3}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            ) : null}
            {value.elements.map((element) => {
              const selected = element.id === selectedId;
              const meta = KIND_META[element.kind];
              const radius = cornerRadiusFor(element.kind, designPreferences.buttonShape, element.bounds.height);
              const labelText = element.label || meta.label;
              const labelStyle = element.kind === 'hero' ? 'bold' : 'normal';
              const labelFontFamily =
                element.kind === 'navbar' || element.kind === 'hero'
                  ? DISPLAY_FONT_PREVIEW[designPreferences.displayFont]
                  : BODY_FONT_PREVIEW[designPreferences.bodyFont];
              const compactLabel = element.bounds.height <= 56;
              const labelWidth = Math.max(20, element.bounds.width - 28);
              const labelHeight = Math.max(14, element.bounds.height - (compactLabel ? 16 : 26));
              const labelFontSize = fitLabelFontSize(
                labelText,
                labelWidth,
                labelHeight,
                element.kind === 'hero' ? 24 : 15,
                element.kind === 'hero' ? 14 : 10,
                labelStyle,
                labelFontFamily,
              );
              const liveElementPos = liveDrags[element.id];
              const elementX = liveElementPos ? liveElementPos.x : element.bounds.x;
              const elementY = liveElementPos ? liveElementPos.y : element.bounds.y;
              return (
                <Fragment key={element.id}>
                  <Rect
                    id={element.id}
                    x={element.bounds.x}
                    y={element.bounds.y}
                    width={element.bounds.width}
                    height={element.bounds.height}
                    rotation={element.rotation}
                    fill={selected ? palette.elementFillSelected : palette.elementFill}
                    stroke={
                      arrowStart === element.id || selected
                        ? palette.accent
                        : hexToRgba(meta.color, theme === 'light' ? 0.55 : 0.6)
                    }
                    strokeWidth={selected ? 2.5 : 1.4}
                    cornerRadius={radius}
                    shadowBlur={selected ? 16 : 0}
                    shadowColor={palette.accent}
                    shadowOpacity={selected ? (theme === 'light' ? 0.35 : 0.55) : 0}
                    draggable={tool === 'select'}
                    onClick={() => handleElementClick(element.id)}
                    onTap={() => handleElementClick(element.id)}
                    onDragMove={(event) => {
                      const node = event.target;
                      setLiveDrags((current) => ({ ...current, [element.id]: { x: node.x(), y: node.y() } }));
                    }}
                    onTransform={(event) => {
                      const node = event.target;
                      setLiveDrags((current) => ({ ...current, [element.id]: { x: node.x(), y: node.y() } }));
                    }}
                    onDragEnd={(event) => {
                      updateElementBounds(element.id, event.target);
                      setLiveDrags((current) => {
                        const { [element.id]: _done, ...rest } = current;
                        return rest;
                      });
                    }}
                    onTransformEnd={(event) => {
                      updateElementBounds(element.id, event.target);
                      setLiveDrags((current) => {
                        const { [element.id]: _done, ...rest } = current;
                        return rest;
                      });
                    }}
                  />
                  <Text
                    x={elementX + 14}
                    y={elementY + (compactLabel ? 8 : 13)}
                    width={labelWidth}
                    height={labelHeight}
                    text={labelText}
                    fontFamily={labelFontFamily}
                    fontSize={labelFontSize}
                    fontStyle={labelStyle}
                    lineHeight={1.2}
                    verticalAlign={compactLabel ? 'middle' : 'top'}
                    wrap="word"
                    ellipsis
                    fill={palette.labelText}
                    listening={false}
                  />
                </Fragment>
              );
            })}
            {/*
              Connectors draw after the elements they join, not before.
              Underneath, an arrow was covered by the two element rects for most
              of its centre-to-centre length, so a click meant to select it
              landed on an element and the inspector never reached the arrow.
            */}
            {value.arrows.map((arrow) => (
              <Fragment key={arrow.id}>
                <Arrow
                  points={arrow.points.flatMap((point) => [point.x, point.y])}
                  stroke={selectedId === arrow.id ? palette.accentStrong : palette.accent}
                  fill={selectedId === arrow.id ? palette.accentStrong : palette.accent}
                  strokeWidth={selectedId === arrow.id ? 3 : 2}
                  pointerLength={9}
                  pointerWidth={9}
                  hitStrokeWidth={18}
                  opacity={0.9}
                  onClick={() => tool === 'select' && onSelect(arrow.id)}
                  onTap={() => tool === 'select' && onSelect(arrow.id)}
                />
                {/*
                  Label+Tag give the caption an opaque backing, so it stays
                  readable over the grid, another shape, or a connector line
                  regardless of theme — bare Text here used to just be
                  amber-on-whatever's-underneath, which on a white light-mode
                  artboard was often amber-on-white at ~2:1.
                */}
                <Label
                  x={((arrow.points[0]?.x ?? 0) + (arrow.points.at(-1)?.x ?? 0)) / 2 - 75}
                  y={((arrow.points[0]?.y ?? 0) + (arrow.points.at(-1)?.y ?? 0)) / 2 - 28}
                  listening={false}
                >
                  <Tag fill={palette.chipBg} stroke={palette.accent} strokeWidth={1} cornerRadius={4} />
                  <Text
                    width={150}
                    align="center"
                    text={arrow.label || arrow.interaction.replaceAll('-', ' ')}
                    fontFamily="Geist Mono Variable"
                    fontSize={11}
                    fill={palette.chipText}
                    padding={4}
                  />
                </Label>
              </Fragment>
            ))}
            {value.notes.map((note) => {
              const noteFontFamily = BODY_FONT_PREVIEW[designPreferences.bodyFont];
              const noteFit = fitNote(note.text, note.bounds.width, note.bounds.height, noteFontFamily);
              const liveNotePos = liveDrags[note.id];
              const noteX = liveNotePos ? liveNotePos.x : note.bounds.x;
              const noteY = liveNotePos ? liveNotePos.y : note.bounds.y;
              return (
                <Fragment key={note.id}>
                  <Rect
                    id={note.id}
                    x={note.bounds.x}
                    y={note.bounds.y}
                    width={note.bounds.width}
                    height={noteFit.height}
                    fill={note.tone === 'amber' ? '#c99a4e' : note.tone === 'mint' ? '#6ea97f' : '#8f82a8'}
                    opacity={selectedId === note.id ? 1 : 0.92}
                    cornerRadius={6}
                    draggable={tool === 'select'}
                    onClick={() => onSelect(note.id)}
                    onDragMove={(event) => {
                      const node = event.target;
                      setLiveDrags((current) => ({ ...current, [note.id]: { x: node.x(), y: node.y() } }));
                    }}
                    onDragEnd={(event) => {
                      commit({
                        ...value,
                        notes: value.notes.map((entry) =>
                          entry.id === note.id
                            ? { ...entry, bounds: { ...entry.bounds, x: event.target.x(), y: event.target.y() } }
                            : entry,
                        ),
                      });
                      setLiveDrags((current) => {
                        const { [note.id]: _done, ...rest } = current;
                        return rest;
                      });
                    }}
                  />
                  <Text
                    x={noteX + NOTE_PAD}
                    y={noteY + NOTE_PAD}
                    width={note.bounds.width - NOTE_PAD * 2}
                    height={noteFit.height - NOTE_PAD * 2}
                    text={note.text}
                    fontFamily={noteFontFamily}
                    fontSize={noteFit.fontSize}
                    lineHeight={1.3}
                    verticalAlign="middle"
                    wrap="word"
                    ellipsis
                    fill="#14120e"
                    listening={false}
                  />
                </Fragment>
              );
            })}
            {!compact ? (
              <Transformer
                ref={transformerRef}
                rotateEnabled
                anchorSize={8}
                borderStroke={palette.accent}
                borderStrokeWidth={2}
                anchorStroke={palette.accent}
                anchorFill={palette.chipBg}
                anchorCornerRadius={4}
              />
            ) : null}
          </Layer>
        </Stage>

        {!compact ? (
          <div className="kind-badge-layer" aria-hidden="true">
            {value.elements.map((element) => {
              const meta = KIND_META[element.kind];
              const Icon = meta.icon;
              const flagged = guardrailElementIds.has(element.id);
              const live = liveDrags[element.id];
              const badgeX = live ? live.x : element.bounds.x;
              const badgeY = live ? live.y : element.bounds.y;
              const style: CSSProperties = {
                left: position.x + badgeX * scale,
                top: position.y + badgeY * scale,
                background: meta.color,
              };
              return (
                <div key={element.id} className="kind-badge" style={style} title={meta.label}>
                  <Icon size={12} strokeWidth={2.25} />
                  {flagged ? <span className="kind-badge__flag" /> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {tool === 'arrow' ? (
          <div className="canvas-tip" role="status">
            <ArrowRight size={15} />
            {arrowStart ? 'Choose a destination element' : 'Choose a source element'}
          </div>
        ) : null}
      </div>

      {!compact ? (
        <div className="studio-footer">
          <div className="readiness">
            <span className={`status-dot ${readiness.ready && issues.length === 0 ? 'is-live' : 'is-warn'}`} />
            <strong>{readiness.ready ? 'Canvas ready' : 'Needs input'}</strong>
            <span>{value.elements.length} stamps · {new Set(value.elements.map((entry) => entry.kind)).size} types · {value.arrows.length} flows · {value.notes.length} notes</span>
          </div>
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              const png = exportPng();
              if (!png) return;
              const link = document.createElement('a');
              link.href = png;
              link.download = `${value.title.replace(/\s+/g, '-').toLowerCase()}.png`;
              link.click();
            }}
          >
            <BringToFront size={15} />
            Export canvas
          </button>
        </div>
      ) : null}

      {!compact && (selectedElement || selectedNote || selectedArrow) ? (
        <div className="selection-inspector">
          {selectedArrow ? (
            <>
              <label>
                <span>Interaction label</span>
                <input
                  value={selectedArrow.label}
                  maxLength={200}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      arrows: value.arrows.map((entry) =>
                        entry.id === selectedArrow.id ? { ...entry, label: event.target.value } : entry,
                      ),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                />
              </label>
              <label>
                <span>Interaction kind</span>
                <select
                  value={selectedArrow.interaction}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      arrows: value.arrows.map((entry) =>
                        entry.id === selectedArrow.id
                          ? { ...entry, interaction: event.target.value as InteractionKind }
                          : entry,
                      ),
                      updatedAt: new Date().toISOString(),
                    })
                  }
                >
                  {INTERACTIONS.map((interaction) => (
                    <option key={interaction.value} value={interaction.value}>{interaction.label}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                <span>{selectedElement ? 'Element label' : 'Note text'}</span>
                <input
                  value={selectedElement?.label ?? selectedNote?.text ?? ''}
                  maxLength={selectedElement ? 200 : 2000}
                  onChange={(event) => {
                    if (selectedElement) {
                      onChange({
                        ...value,
                        elements: value.elements.map((entry) =>
                          entry.id === selectedElement.id ? { ...entry, label: event.target.value } : entry,
                        ),
                        updatedAt: new Date().toISOString(),
                      });
                    } else if (selectedNote) {
                      onChange({
                        ...value,
                        notes: value.notes.map((entry) =>
                          entry.id === selectedNote.id ? { ...entry, text: event.target.value } : entry,
                        ),
                        updatedAt: new Date().toISOString(),
                      });
                    }
                  }}
                />
              </label>
              {selectedElement ? (
                <label>
                  <span>Appears in</span>
                  <select
                    value={selectedElement.intendedState ?? ''}
                    onChange={(event) => {
                      const state = event.target.value;
                      onChange({
                        ...value,
                        elements: value.elements.map((entry) => {
                          if (entry.id !== selectedElement.id) return entry;
                          // Dropping the key, rather than storing an empty
                          // string, is what "present in every state" means.
                          const { intendedState: _previous, ...rest } = entry;
                          return state ? { ...rest, intendedState: state as StateKind } : rest;
                        }),
                        updatedAt: new Date().toISOString(),
                      });
                    }}
                  >
                    <option value="">Every state</option>
                    {STATE_VARIANTS.map((state) => (
                      <option key={state.value} value={state.value}>{state.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
