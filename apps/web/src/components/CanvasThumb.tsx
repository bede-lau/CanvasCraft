import type { CanvasDoc } from '@canvascraft/schema';
import { KIND_META } from '../lib/stampKinds';

/**
 * A miniature, to-scale trace of a canvas's elements, coloured by the same
 * kind → colour mapping the canvas itself uses (see stampKinds.ts). Not a
 * screenshot of anything real — just enough shape and colour rhythm that a
 * layout's proportions are legible before committing to it. Shared by the
 * template picker and the workspace picker, which both trace a `CanvasDoc`
 * the same way.
 */
export function CanvasThumb({ doc }: { doc: CanvasDoc }) {
  const ordered = [...doc.elements].sort((a, b) => a.z - b.z);
  const layout = ordered.filter((el) => el.kind !== 'modal');
  const overlays = ordered.filter((el) => el.kind === 'modal');
  return (
    <svg className="template-thumb" viewBox={`0 0 ${doc.size.width} ${doc.size.height}`} role="presentation" aria-hidden="true">
      <rect x={0} y={0} width={doc.size.width} height={doc.size.height} className="template-thumb__board" />
      {layout.map((el) => (
        <rect
          key={el.id}
          x={el.bounds.x}
          y={el.bounds.y}
          width={el.bounds.width}
          height={el.bounds.height}
          rx={10}
          fill={KIND_META[el.kind].color}
          opacity={0.82}
        />
      ))}
      {/* A modal is an overlay, not another tile in the grid: dim the layout
         behind it and give the dialog a lifted, bright-edged surface so the
         overlap reads as intentional depth rather than two components colliding. */}
      {overlays.length > 0 && (
        <rect x={0} y={0} width={doc.size.width} height={doc.size.height} className="template-thumb__scrim" />
      )}
      {overlays.map((el) => (
        <g key={el.id}>
          <rect
            x={el.bounds.x + 6}
            y={el.bounds.y + 10}
            width={el.bounds.width}
            height={el.bounds.height}
            rx={16}
            className="template-thumb__overlay-shadow"
          />
          <rect
            x={el.bounds.x}
            y={el.bounds.y}
            width={el.bounds.width}
            height={el.bounds.height}
            rx={16}
            fill={KIND_META[el.kind].color}
            className="template-thumb__overlay"
          />
        </g>
      ))}
    </svg>
  );
}
