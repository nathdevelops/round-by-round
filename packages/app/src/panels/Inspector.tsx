import {
  addMirror, clearJoin, findShape, joinBetween, nextId, partnerOf, removeShape, setJoin, updateShape,
  SHAPE_NAMES, YARN_COLORS, type Quat, type Vec3,
} from '@rbr/engine';
import { useEffect, useState, type CSSProperties } from "react";
import { Euler, MathUtils, Quaternion } from 'three';
import { useEditor } from '../state/editor';

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

export function Inspector() {
  const ed = useEditor();
  const { project } = ed;
  const s = ed.selected ? findShape(project, ed.selected) : undefined;
  if (!s) {
    return (
      <section className="paper card inspector" aria-label="Shape">
        <span className="eyebrow">Nothing selected</span>
        <p className="meta">Click a shape to change its size, colour and how it joins. Drag the stage to look around, scroll to zoom.</p>
        <p className="meta keys">M move · T turn · Del remove · Ctrl+Z undo · Ctrl+Shift+Z redo</p>
      </section>
    );
  }
  const partner = partnerOf(project, s.id);
  const host = s.hostId ? findShape(project, s.hostId) : undefined;
  const join = host ? joinBetween(project, s.id, host.id) : undefined;
  const patch = (p: Parameters<typeof updateShape>[2]) => ed.edit(updateShape(project, s.id, p));
  const previewParam = (k: string, v: number) => ed.preview(updateShape(project, s.id, { params: { [k]: v } }));
  const pos = s.transform.position;
  const rot = toEulerDeg(s.transform.rotation);
  const setPos = (i: number, v: number) => patch({ transform: { ...s.transform, position: pos.map((x, j) => (j === i ? v : x)) as Vec3 } });
  const setRot = (i: number, v: number) => patch({ transform: { ...s.transform, rotation: fromEulerDeg(rot.map((x, j) => (j === i ? v : x)) as Vec3) } });

  return (
    <section className="paper card inspector" aria-label="Shape">
      <div className="insp-head">
        <span className="eyebrow">Selected · {SHAPE_NAMES[s.kind]}</span>
        <input type="text" id="shape-name" aria-label="Name" className="name-field" value={s.name} onChange={(e) => ed.preview(updateShape(project, s.id, { name: e.target.value }))} onBlur={() => ed.settle()} />
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

      <div className="group">
        <span className="field-label">Yarn colour</span>
        <div className="yarns" role="radiogroup" aria-label="Yarn colour">
          {YARN_COLORS.map((c) => (
            <button
              key={c.hex} type="button" role="radio" aria-checked={s.color === c.hex} title={c.name}
              className={`yarn${s.color === c.hex ? ' on' : ''}`} style={{ '--c': c.hex } as CSSProperties}
              onClick={() => patch({ color: c.hex })}
            ><span className="sr">{c.name}</span></button>
          ))}
        </div>
      </div>

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

      <div className="group">
        <span className="field-label">Joined to</span>
        {host ? (
          <>
            <p className="joined"><b>{host.name}</b> <button type="button" className="link" onClick={() => ed.edit(clearJoin(updateShape(project, s.id, { hostId: undefined }), s.id, host.id))}>unhook</button></p>
            <div className="seg" role="radiogroup" aria-label="Join">
              <label><input type="radio" name="join" id="join-sew" checked={join?.mode !== 'fuse'} onChange={() => ed.edit(setJoin(project, s.id, host.id, 'sew'))} />Sew</label>
              <label><input type="radio" name="join" id="join-fuse" checked={join?.mode === 'fuse'} onChange={() => ed.edit(setJoin(project, s.id, host.id, 'fuse'))} />Fuse</label>
            </div>
            <p className="meta">{join?.mode === 'fuse' ? 'Crocheted as one piece with its host.' : 'Crocheted separately, then sewn on.'}</p>
          </>
        ) : (
          <p className="meta">Standing on its own. Use “Move onto a shape” or drop shapes onto it.</p>
        )}
      </div>

      <div className="actions">
        <button type="button" className="btn small" onClick={() => ed.setPlacing(!ed.placing)} aria-pressed={ed.placing}>
          {ed.placing ? 'Pick a shape…' : 'Move onto a shape'}
        </button>
        <button type="button" className="btn quiet small" disabled={!!partner} onClick={() => {
          const id = nextId(project, `${s.kind}`);
          ed.edit(addMirror(project, s.id, id), id);
        }} title={partner ? 'Already mirrored' : 'Make a linked copy on the other side'}>Mirror</button>
        <button type="button" className="btn quiet small danger" onClick={() => ed.edit(removeShape(project, s.id), null)}>Remove</button>
      </div>
    </section>
  );
}

