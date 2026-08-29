import {
  ArrowRight,
  BringToFront,
  ChevronDown,
  Eraser,
  ImagePlus,
  MousePointer2,
  Pencil,
  Redo2,
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
} from 'react';
import { Arrow, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import useImage from 'use-image';
import {
  CanvasDoc,
  CanvasElement,
  CanvasNote,
  findCanvasIntegrityIssues,
  summariseCanvasReadiness,
  type InteractionKind,
  type StampKind,
} from '@canvascraft/schema';
import type Konva from 'konva';

const STAMPS: Array<{ kind: StampKind; label: string; width: number; height: number }> = [
  { kind: 'navbar', label: 'Navbar', width: 520, height: 64 },
  { kind: 'hero', label: 'Hero', width: 440, height: 120 },
  { kind: 'card', label: 'Card', width: 280, height: 150 },
  { kind: 'button', label: 'Button', width: 150, height: 48 },
  { kind: 'input', label: 'Input', width: 260, height: 48 },
  { kind: 'table', label: 'Table', width: 430, height: 210 },
  { kind: 'tab', label: 'Tabs', width: 310, height: 48 },
  { kind: 'media', label: 'Media', width: 300, height: 190 },
  { kind: 'modal', label: 'Modal', width: 360, height: 220 },
  { kind: 'sidebar', label: 'Sidebar', width: 190, height: 440 },
];

type Tool = 'select' | 'draw' | 'erase' | 'arrow' | 'note';

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
  compact = false,
}: {
  value: CanvasDoc;
  onChange: (doc: CanvasDoc) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [viewportWidth, setViewportWidth] = useState(900);
  const [tool, setTool] = useState<Tool>('select');
  const [scale, setScale] = useState(0.75);
  const [position, setPosition] = useState({ x: 18, y: 18 });
  const [strokeDraft, setStrokeDraft] = useState<number[] | null>(null);
  const [arrowStart, setArrowStart] = useState<string | null>(null);
  const [history, setHistory] = useState<CanvasDoc[]>([]);
  const [future, setFuture] = useState<CanvasDoc[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const onStagePointerDown = (event: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = event.target.getStage();
    if (!stage) return;
    const pointer = stage.getRelativePointerPosition();
    if (!pointer) return;

    if (tool === 'draw' || tool === 'erase') {
      setStrokeDraft([pointer.x, pointer.y]);
      return;
    }
    if (tool === 'note' && event.target === stage) {
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
    if (event.target === stage) {
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
            color: tool === 'erase' ? '#0d1015' : '#e8ebf2',
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
          <div className="stamp-menu">
            <label htmlFor="stamp-select">Add stamp</label>
            <div className="select-wrap">
              <select
                id="stamp-select"
                value=""
                onChange={(event) => {
                  const stamp = STAMPS.find((entry) => entry.kind === event.target.value);
                  if (stamp) addStamp(stamp);
                }}
              >
                <option value="" disabled>
                  Choose element
                </option>
                {STAMPS.map((stamp) => (
                  <option key={stamp.kind} value={stamp.kind}>
                    {stamp.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
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
          onDragEnd={(event) => {
            if (event.target === stageRef.current) setPosition({ x: event.target.x(), y: event.target.y() });
          }}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
        >
          <Layer>
            <Rect x={0} y={0} width={value.size.width} height={value.size.height} fill="#0d1015" cornerRadius={12} shadowBlur={30} shadowColor="#000" />
            <BaseImage doc={value} />
            {Array.from({ length: 22 }, (_, index) => (
              <Line key={`v-${index}`} points={[index * 52, 0, index * 52, value.size.height]} stroke="#252b36" strokeWidth={1} opacity={0.42} listening={false} />
            ))}
            {Array.from({ length: 14 }, (_, index) => (
              <Line key={`h-${index}`} points={[0, index * 52, value.size.width, index * 52]} stroke="#252b36" strokeWidth={1} opacity={0.42} listening={false} />
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
                stroke={tool === 'erase' ? '#0d1015' : '#f0b860'}
                strokeWidth={tool === 'erase' ? 18 : 3}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            ) : null}
            {value.arrows.map((arrow) => (
              <Fragment key={arrow.id}>
                <Arrow
                  points={arrow.points.flatMap((point) => [point.x, point.y])}
                  stroke={selectedId === arrow.id ? '#ffd487' : '#f0b860'}
                  fill={selectedId === arrow.id ? '#ffd487' : '#f0b860'}
                  strokeWidth={selectedId === arrow.id ? 3 : 2}
                  pointerLength={9}
                  pointerWidth={9}
                  hitStrokeWidth={18}
                  opacity={0.9}
                  onClick={() => tool === 'select' && onSelect(arrow.id)}
                  onTap={() => tool === 'select' && onSelect(arrow.id)}
                />
                <Text
                  x={((arrow.points[0]?.x ?? 0) + (arrow.points.at(-1)?.x ?? 0)) / 2}
                  y={((arrow.points[0]?.y ?? 0) + (arrow.points.at(-1)?.y ?? 0)) / 2 - 20}
                  width={150}
                  text={arrow.label || arrow.interaction.replaceAll('-', ' ')}
                  fontFamily="Geist Mono Variable"
                  fontSize={11}
                  fill="#f0b860"
                  padding={4}
                  listening={false}
                />
              </Fragment>
            ))}
            {value.elements.map((element) => {
              const selected = element.id === selectedId;
              return (
                <Fragment key={element.id}>
                  <Rect
                    id={element.id}
                    x={element.bounds.x}
                    y={element.bounds.y}
                    width={element.bounds.width}
                    height={element.bounds.height}
                    rotation={element.rotation}
                    fill={selected ? '#252a34' : '#171b22'}
                    stroke={arrowStart === element.id ? '#f0b860' : selected ? '#f0b860' : '#596173'}
                    strokeWidth={selected ? 2 : 1}
                    cornerRadius={element.kind === 'button' || element.kind === 'input' ? 8 : 12}
                    shadowBlur={selected ? 14 : 0}
                    shadowColor="#f0b860"
                    draggable={tool === 'select'}
                    onClick={() => handleElementClick(element.id)}
                    onTap={() => handleElementClick(element.id)}
                    onDragEnd={(event) => updateElementBounds(element.id, event.target)}
                    onTransformEnd={(event) => updateElementBounds(element.id, event.target)}
                  />
                  <Text
                    x={element.bounds.x + 14}
                    y={element.bounds.y + 13}
                    width={Math.max(20, element.bounds.width - 28)}
                    text={element.label || element.kind}
                    fontFamily="Geist Variable"
                    fontSize={element.kind === 'hero' ? 24 : 15}
                    fontStyle={element.kind === 'hero' ? 'bold' : 'normal'}
                    fill="#e8ebf2"
                    listening={false}
                  />
                  <Text
                    x={element.bounds.x + 14}
                    y={element.bounds.y + element.bounds.height - 25}
                    width={element.bounds.width - 28}
                    text={element.kind.toUpperCase()}
                    fontFamily="Geist Mono Variable"
                    fontSize={10}
                    fill="#8b93a7"
                    listening={false}
                  />
                </Fragment>
              );
            })}
            {value.notes.map((note) => (
              <Fragment key={note.id}>
                <Rect
                  id={note.id}
                  x={note.bounds.x}
                  y={note.bounds.y}
                  width={note.bounds.width}
                  height={note.bounds.height}
                  fill={note.tone === 'amber' ? '#c99a4e' : note.tone === 'mint' ? '#6ea97f' : '#8f82a8'}
                  opacity={selectedId === note.id ? 1 : 0.92}
                  cornerRadius={6}
                  draggable={tool === 'select'}
                  onClick={() => onSelect(note.id)}
                  onDragEnd={(event) =>
                    commit({
                      ...value,
                      notes: value.notes.map((entry) =>
                        entry.id === note.id
                          ? { ...entry, bounds: { ...entry.bounds, x: event.target.x(), y: event.target.y() } }
                          : entry,
                      ),
                    })
                  }
                />
                <Text
                  x={note.bounds.x + 12}
                  y={note.bounds.y + 12}
                  width={note.bounds.width - 24}
                  height={note.bounds.height - 24}
                  text={note.text}
                  fontFamily="Geist Variable"
                  fontSize={14}
                  lineHeight={1.25}
                  fill="#14120e"
                  listening={false}
                />
              </Fragment>
            ))}
            {!compact ? <Transformer ref={transformerRef} rotateEnabled anchorSize={8} borderStroke="#f0b860" anchorFill="#f0b860" /> : null}
          </Layer>
        </Stage>

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
          )}
        </div>
      ) : null}
    </section>
  );
}
