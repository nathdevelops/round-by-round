import {
  addMirror, findPiece, findShape, fuseShapes, nextId, nextPieceId, partnerOf, pieceOf, separatePiece,
  updatePiece, updateShape, SHAPE_NAMES, YARN_COLORS, type FusedPiece, type Quat, type Shape, type Vec3,
} from '@rbr/engine';
import { useEffect, useState, type CSSProperties } from "react";
import { Euler, MathUtils, Quaternion } from 'three';
import { removeSelection, selectedShapes } from '../state/actions';
import { useEditor, type Editor } from '../state/editor';

const PARAM_UI: Record<string, { label: string; min: number; max: number; step: number; unit?: string; pct?: boolean }> = {
  radius: { label: 'Radius', min: 0.3, max: 12, step: 0.1, unit: 'cm' },
  height: { label: 'Height', min: 0.5, max: 25, step: 0.1, unit: 'cm' },
  length: { label: 'Length', min: 0.5, max: 25, step: 0.1, unit: 'cm' },
  edge: { label: 'Edge rounding', min: 0, max: 3, step: 0.05, unit: 'cm' },
  taper: { label: 'Taper', min: 0, max: 0.6, step: 0.01, pct: true },
  baseRadius: { label: 'Base radius', min: 0.3, max: 12, step: 0.1, unit: 'cm' },
  tipRadius: { label: 'Tip radius', min: 0, max: 5, step: 0.05, unit: 'cm' },
  flatness: { label: 'Height of dome', min: 0.15, max: 1, step: 0.01, pct: true },
};

const fmt = (v: number, ui: (typeof PARAM_UI)[string]) => (ui.pct ? `${Math.round(v * 100)}%` : `${v.toFixed(1)} ${ui.unit}`);

/** A number field that edits on Enter or when you leave it, so typing "1" on the way to "12" isn't an undo step. */
function NumberField({ id, value, onCommit, step = 0.1, label }: { id: string; value: number; onCommit(v: number): void; step?: number; label: string }) {
  const show = (v: number) => String(Math.round(v * 100) / 100);
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const done = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v) && show(v) !== show(value)) onCommit(v);
    else setText(show(value));
  };
  return (
    <label className="num" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="number" step={step} value={text} onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => e.key === 'Enter' && done()} />
    </label>
  );
}

const toEulerDeg = (q: Quat): Vec3 => {
  const e = new Euler().setFromQuaternion(new Quaternion(...q), 'XYZ');
  return [e.x, e.y, e.z].map((r) => Math.round(MathUtils.radToDeg(r) * 10) / 10) as Vec3;
};
const fromEulerDeg = (d: Vec3): Quat => new Quaternion().setFromEuler(new Euler(...d.map(MathUtils.degToRad) as Vec3, 'XYZ')).toArray() as Quat;

function YarnPicker({ value, onPick }: { value: string; onPick(hex: string): void }) {
  return (
    <div className="group">
      <span className="field-label">Yarn colour</span>
      <div className="yarns" role="radiogroup" aria-label="Yarn colour">
        {YARN_COLORS.map((c) => (
          <button
            key={c.hex} type="button" role="radio" aria-checked={value === c.hex} title={c.name}
            className={`yarn${value === c.hex ? ' on' : ''}`} style={{ '--c': c.hex } as CSSProperties}
            onClick={() => onPick(c.hex)}
          ><span className="sr">{c.name}</span></button>
        ))}
      </div>
    </div>
  );
}

const KEYS = <p className="meta keys">F fuse · M move · T turn · Del remove · Ctrl+Z undo</p>;
const SHIFT_TIP = <p className="tip"><kbd>Shift</kbd> + click to select several shapes, then fuse them into one piece.</p>;

export function Inspector() {
  const ed = useEditor();
  const { project, selected } = ed;
  if (!selected.length) {
    return (
      <section className="paper card inspector" aria-label="Selection">
        <span className="eyebrow">Nothing selected</span>
        <p className="meta">Click a shape to change it. Drag the stage to look around, scroll to zoom.</p>
        {SHIFT_TIP}
        {KEYS}
      </section>
    );
  }
  if (selected.length > 1) return <ManyInspector ed={ed} />;
  const piece = findPiece(project, selected[0]!);
  if (piece) return <PieceInspector ed={ed} piece={piece} />;
  const s = findShape(project, selected[0]!);
  return s ? <ShapeInspector ed={ed} s={s} /> : null;
}

function ManyInspector({ ed }: { ed: Editor }) {
  const { project, selected } = ed;
  const shapes = selectedShapes(project, selected);
  const fuse = () => {
    const { project: next, id } = fuseShapes(project, shapes.map((s) => s.id), nextPieceId(project));
    if (id) { ed.edit(next, [id]); ed.setMulti(false); }
  };
  return (
    <section className="paper card inspector" aria-label="Selection">
      <span className="eyebrow">{selected.length} picked · {shapes.length} shapes</span>
      <p className="meta">Move and turn them together. When they overlap the way you want, fuse them: the outside of all of them becomes one shell, crocheted as one piece.</p>
      <div className="actions">
        <button type="button" className="btn" onClick={fuse} disabled={shapes.length < 2}>Fuse into one piece</button>
        <button type="button" className="btn quiet small danger" onClick={() => ed.edit(removeSelection(project, selected), [])}>Remove</button>
      </div>
      {KEYS}
    </section>
  );
}

function PieceInspector({ ed, piece }: { ed: Editor; piece: FusedPiece }) {
  const { project } = ed;
  const parts = project.shapes.filter((s) => piece.shapeIds.includes(s.id));
  return (
    <section className="paper card inspector" aria-label="Fused piece">
      <div className="insp-head">
        <span className="eyebrow">Fused piece · {parts.length} shapes</span>
        <input type="text" id="piece-name" aria-label="Name" className="name-field" value={piece.name}
          onChange={(e) => ed.preview(updatePiece(project, piece.id, { name: e.target.value }))} onBlur={() => ed.settle()} />
        <p className="meta">Crocheted as one shell around all its shapes. It moves as one; pick a part below to adjust it.</p>
      </div>
      <YarnPicker value={piece.color} onPick={(hex) => ed.edit(updatePiece(project, piece.id, { color: hex }))} />
      <div className="group">
        <span className="field-label">Parts</span>
        <ul className="parts">
          {parts.map((s) => (
            <li key={s.id}><button type="button" className="link" onClick={() => ed.setSelection([s.id])}>{s.name}</button><span className="meta">{SHAPE_NAMES[s.kind]}</span></li>
          ))}
        </ul>
      </div>
      <div className="actions">
        <button type="button" className="btn quiet small" onClick={() => ed.edit(separatePiece(project, piece.id), piece.shapeIds)}>Separate</button>
        <button type="button" className="btn quiet small danger" onClick={() => ed.edit(removeSelection(project, [piece.id]), [])}>Remove</button>
      </div>
    </section>
  );
}

function ShapeInspector({ ed, s }: { ed: Editor; s: Shape }) {
  const { project } = ed;
  const partner = partnerOf(project, s.id);
  const piece = pieceOf(project, s.id);
  const patch = (p: Parameters<typeof updateShape>[2]) => ed.edit(updateShape(project, s.id, p));
  const previewParam = (k: string, v: number) => ed.preview(updateShape(project, s.id, { params: { [k]: v } }));
  const pos = s.transform.position;
  const rot = toEulerDeg(s.transform.rotation);
  const setPos = (i: number, v: number) => patch({ transform: { ...s.transform, position: pos.map((x, j) => (j === i ? v : x)) as Vec3 } });
  const setRot = (i: number, v: number) => patch({ transform: { ...s.transform, rotation: fromEulerDeg(rot.map((x, j) => (j === i ? v : x)) as Vec3) } });

  return (
    <section className="paper card inspector" aria-label="Shape">
      <div className="insp-head">
        <span className="eyebrow">{piece ? `Part of ${piece.name}` : 'Selected'} · {SHAPE_NAMES[s.kind]}</span>
        <input type="text" id="shape-name" aria-label="Name" className="name-field" value={s.name} onChange={(e) => ed.preview(updateShape(project, s.id, { name: e.target.value }))} onBlur={() => ed.settle()} />
        {piece && <p className="meta"><button type="button" className="link" onClick={() => ed.setSelection([piece.id])}>Back to {piece.name}</button></p>}
        {partner && <p className="meta">Mirrored with {partner.name}. Changes apply to both.</p>}
      </div>

      <div className="group">
        {Object.keys(s.params).filter((k) => PARAM_UI[k]).map((k) => {
          const ui = PARAM_UI[k]!;
          const v = s.params[k]!;
          return (
            <label key={k} className="slider" htmlFor={`p-${k}`}>
              <span className="slider-head">{ui.label} <output>{fmt(v, ui)}</output></span>
              <input
                id={`p-${k}`} type="range" min={ui.min} max={ui.max} step={ui.step} value={v}
                onChange={(e) => previewParam(k, +e.target.value)}
                onPointerUp={() => ed.settle()} onKeyUp={() => ed.settle()} onBlur={() => ed.settle()}
              />
            </label>
          );
        })}
      </div>

      {!piece && <YarnPicker value={s.color} onPick={(hex) => patch({ color: hex })} />}

      <div className="group">
        <span className="field-label">Position <span className="meta">cm</span></span>
        <div className="triple">
          {(['x', 'y', 'z'] as const).map((a, i) => <NumberField key={a} id={`pos-${a}`} label={a} value={pos[i]!} onCommit={(v) => setPos(i, v)} />)}
        </div>
        <span className="field-label">Tilt <span className="meta">degrees</span></span>
        <div className="triple">
          {(['x', 'y', 'z'] as const).map((a, i) => <NumberField key={a} id={`rot-${a}`} label={a} step={5} value={rot[i]!} onCommit={(v) => setRot(i, v)} />)}
        </div>
      </div>

      <div className="actions">
        <button type="button" className="btn quiet small" disabled={!!partner} onClick={() => {
          const id = nextId(project, `${s.kind}`);
          ed.edit(addMirror(project, s.id, id), [id]);
        }} title={partner ? 'Already mirrored' : 'Make a linked copy on the other side'}>Mirror</button>
        <button type="button" className="btn quiet small danger" onClick={() => ed.edit(removeSelection(project, [s.id]), [])}>Remove</button>
      </div>
      {!piece && SHIFT_TIP}
      {!piece && (
        <div className="actions">
          <button type="button" className="btn small" onClick={() => ed.setMulti(true)} disabled={ed.multi}>
            {ed.multi ? 'Now click the other shapes…' : 'Fuse with other shapes…'}
          </button>
        </div>
      )}
    </section>
  );
}

