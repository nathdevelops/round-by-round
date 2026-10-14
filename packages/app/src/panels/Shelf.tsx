import { SHAPE_KINDS, SHAPE_NAMES, type ShapeKind } from '@rbr/engine';
import { addShapeOf } from '../state/actions';
import type { ReactElement } from 'react';
import { useEditor } from '../state/editor';
import { SHAPE_DRAG_TYPE } from '../editor/Stage';

const ICONS: Record<ShapeKind, ReactElement> = {
  sphere: <circle cx="8" cy="8" r="6" />,
  ellipsoid: <ellipse cx="8" cy="8" rx="4.6" ry="6.4" />,
  egg: <path d="M8 1.6c3 0 5 4.4 5 7.6a5 5 0 0 1-10 0c0-3.2 2-7.6 5-7.6z" />,
  capsule: <rect x="4.5" y="1.5" width="7" height="13" rx="3.5" />,
  cylinder: <rect x="3" y="3" width="10" height="10.5" rx="1.5" />,
  cone: <path d="M8 2 L13.5 14 H2.5 Z" />,
  teardrop: <path d="M8 1.5 C9.5 5 13 7.5 13 10.2 a5 5 0 0 1-10 0 C3 7.5 6.5 5 8 1.5z" />,
  dome: <path d="M2 12 A6 6 0 0 1 14 12 Z" />,
};

/** The pegboard of shapes. Drag one onto the table, or tap to add it beside the others. */
export function Shelf() {
  const ed = useEditor();
  const add = (kind: ShapeKind) => {
    const { project, id } = addShapeOf(ed.project, kind);
    ed.edit(project, [id]);
  };
  return (
    <nav className="shelf" aria-label="Shapes">
      <span className="eyebrow">Shapes</span>
      <div className="shelf-pegs">
        {SHAPE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className="tag shape-tag"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(SHAPE_DRAG_TYPE, k); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => add(k)}
            title={`Add a ${SHAPE_NAMES[k].toLowerCase()}`}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">{ICONS[k]}</svg>
            {SHAPE_NAMES[k]}
          </button>
        ))}
      </div>
      <p className="note shelf-note">drag one onto the table, then move it into place</p>
    </nav>
  );
}
