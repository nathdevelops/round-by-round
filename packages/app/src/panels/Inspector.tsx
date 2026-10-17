import {
  addMirror, canSew, eyesOf, findPiece, findShape, fuseShapes, hostOf, itemFor, listItems, nextId, nextPieceId, partnerOf, pieceOf,
  separatePiece, setEyes, sewOnto, shapeHeight, shapeRadius, updatePiece, updateShape, SHAPE_NAMES, YARN_COLORS,
  type FusedPiece, type Project, type Quat, type Shape, type Vec3,
} from '@rbr/engine';
import { useEffect, useState, type CSSProperties } from "react";
import { Euler, MathUtils, Quaternion } from 'three';
import { placeShape, removeSelection, selectedShapes } from '../state/actions';
import { usePlan } from '../state/plan';
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
const SHIFT_TIP = <p className="tip"><kbd>Shift</kbd> + click to select several shapes, then fuse them into one piece or sew one onto another.</p>;

/** Pick the piece this one is sewn onto. Sewn pieces are trimmed where they sink in and end in an open edge. */
function SewControl({ ed, id }: { ed: Editor; id: string }) {
  const { project } = ed;
  const host = hostOf(project, id);
  const options = listItems(project).filter((it) => it.id === host || canSew(project, id, it.id));
  const partner = findShape(project, id) && partnerOf(project, id);
  return (
    <div className="group sew-onto">
      <label className="field" htmlFor="sew-onto">
        <span className="field-label">Sewn onto</span>
        <select id="sew-onto" value={host ?? ''} onChange={(e) => ed.edit(sewOnto(project, id, e.target.value || null))}>
          <option value="">Nothing: its own piece</option>
          {options.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
        </select>
      </label>
      <p className="meta">
        {host
          ? `Crocheted separately, trimmed where it sinks into ${itemFor(project, host)?.name}, and sewn on along the open edge.${partner ? ' Its mirror is sewn on the same way.' : ''}`
          : 'Push it into another piece with the move tool, then pick that piece here to sew it on.'}
      </p>
    </div>
  );
}

/** Safety eyes, placed the way a pattern says it: between two rounds, so many stitches apart. */
function EyesControl({ ed, id }: { ed: Editor; id: string }) {
  const { project } = ed;
  const plan = usePlan();
  const eyes = eyesOf(project, id);
  const rounds = plan.pieces.find((x) => x.id === id)?.rounds.rounds.length ?? 0;
  if (rounds < 4) return null;
  const change = (patch: Partial<{ round: number; apart: number; sizeMm: number }>) =>
    ed.edit(setEyes(project, id, { round: eyes?.round ?? Math.round(rounds / 2), apart: eyes?.apart ?? 6, sizeMm: eyes?.sizeMm ?? 9, ...patch }));
  if (!eyes) {
    return (
      <div className="group">
        <span className="field-label">Safety eyes</span>
        <div><button type="button" id="add-eyes" className="btn quiet small" onClick={() => change({})}>Add eyes</button></div>
      </div>
    );
  }
  return (
    <div className="group eyes">
      <span className="field-label">Safety eyes</span>
      <label className="slider" htmlFor="eyes-round">
        <span className="slider-head">Between rounds <output>{eyes.round} and {eyes.round + 1}</output></span>
        <input id="eyes-round" type="range" min={1} max={rounds - 1} step={1} value={Math.min(eyes.round, rounds - 1)} onChange={(e) => change({ round: +e.target.value })} />
      </label>
      <label className="slider" htmlFor="eyes-apart">
        <span className="slider-head">Stitches apart <output>{eyes.apart}</output></span>
        <input id="eyes-apart" type="range" min={1} max={16} step={1} value={eyes.apart} onChange={(e) => change({ apart: +e.target.value })} />
      </label>
      <div className="joined">
        <label className="field" htmlFor="eyes-size">
          <select id="eyes-size" value={eyes.sizeMm} onChange={(e) => change({ sizeMm: +e.target.value })} aria-label="Eye size">
            {[6, 8, 9, 10, 12, 15].map((mm) => <option key={mm} value={mm}>{mm} mm eyes</option>)}
          </select>
        </label>
        <button type="button" className="link" onClick={() => ed.edit(setEyes(project, id, null))}>Remove eyes</button>
      </div>
    </div>
  );
}

/** With two pieces picked, offer to sew the smaller onto the bigger (or the other way). */
function sewPair(p: Project, ids: string[]): { child: string; host: string; childName: string; hostName: string }[] {
  const items = [...new Set(ids.map((id) => itemFor(p, id)?.id).filter((x): x is string => !!x))].map((id) => itemFor(p, id)!);
  if (items.length !== 2) return [];
  const bulk = (shapes: Shape[]) => shapes.reduce((a, s) => a + shapeRadius(s) ** 2 * shapeHeight(s), 0);
  const [a, b] = bulk(items[0]!.shapes) <= bulk(items[1]!.shapes) ? [items[0]!, items[1]!] : [items[1]!, items[0]!];
  return ([[a, b], [b, a]] as const)
    .filter(([c, h]) => canSew(p, c.id, h.id))
    .map(([c, h]) => ({ child: c.id, host: h.id, childName: c.name, hostName: h.name }));
}

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
      <p className="meta">Move and turn them together. When they overlap the way you want, fuse them into one shell crocheted as one piece, or sew one onto the other.</p>
      <div className="actions">
        <button type="button" className="btn" onClick={fuse} disabled={shapes.length < 2}>Fuse into one piece</button>
        {sewPair(project, selected).map((o, i) => (
          <button key={o.child} type="button" className={`btn${i ? ' quiet small' : ''}`} id={i ? 'sew-swapped' : 'sew-pair'}
            onClick={() => { ed.edit(sewOnto(project, o.child, o.host), [o.child]); ed.setMulti(false); }}>
            Sew {o.childName} onto {o.hostName}
          </button>
        ))}
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
      <SewControl ed={ed} id={piece.id} />
      <EyesControl ed={ed} id={piece.id} />
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
  const setPos = (i: number, v: number) => ed.edit(placeShape(project, s.id, { ...s.transform, position: pos.map((x, j) => (j === i ? v : x)) as Vec3 }));
  const setRot = (i: number, v: number) => ed.edit(placeShape(project, s.id, { ...s.transform, rotation: fromEulerDeg(rot.map((x, j) => (j === i ? v : x)) as Vec3) }));

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
      {!piece && <SewControl ed={ed} id={s.id} />}
      {!piece && !s.mirrorOf && <EyesControl ed={ed} id={s.id} />}

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
            {ed.multi ? 'Now click the other shapes…' : 'Fuse or sew with other shapes…'}
          </button>
        </div>
      )}
    </section>
  );
}

