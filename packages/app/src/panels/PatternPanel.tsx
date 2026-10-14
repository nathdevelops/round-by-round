import {
  computeRounds, findPiece, findShape, fusedProfile, inFrameOf, partnerOf, patternLines, patternText, pieceOf, shapeProfile, YARN_PRESETS,
  type FusedPiece, type Project, type ProfilePoint, type RoundingMode, type Shape, type Terms,
} from '@rbr/engine';
import { useDeferredValue, useMemo } from 'react';
import { useEditor } from '../state/editor';

const ROUNDING: { id: RoundingMode; label: string; hint: string }[] = [
  { id: 'classic6', label: 'Classic', hint: 'steps of 6' },
  { id: 'balanced3', label: 'Balanced', hint: 'steps of 3' },
  { id: 'smooth', label: 'Smooth', hint: 'any count' },
];

/** What gets crocheted: a fused piece, or a shape on its own. */
type Item = { kind: 'fused'; piece: FusedPiece } | { kind: 'shape'; shape: Shape };

const itemId = (it: Item) => (it.kind === 'fused' ? it.piece.id : it.shape.id);
const itemName = (it: Item) => (it.kind === 'fused' ? it.piece.name : it.shape.name);
const itemColor = (it: Item) => (it.kind === 'fused' ? it.piece.color : it.shape.color);

function patternOf(p: Project, it: Item) {
  const yarn = YARN_PRESETS.find((y) => y.id === p.settings.yarnId) ?? YARN_PRESETS[3]!;
  let profile: ProfilePoint[];
  let splits: [number, number][] = [];
  if (it.kind === 'fused') {
    const f = measureFused(p.shapes.filter((s) => it.piece.shapeIds.includes(s.id)));
    profile = f.profile;
    splits = f.splits;
  } else profile = shapeProfile(it.shape);
  const piece = computeRounds(profile, { gauge: yarn.gauge, stretch: p.settings.stretch, rounding: p.settings.rounding });
  // Rounds whose height falls inside a split range.
  const splitRounds = piece.rounds.filter((r) => splits.some(([a, b]) => r.z >= a - 0.2 && r.z <= b + 0.2)).map((r) => r.n);
  return { piece, lines: patternLines(piece.rounds, p.settings.terms), splitRounds };
}

/**
 * Measuring a fused shell takes a moment, and moving or turning the piece doesn't change it,
 * so results are kept by the parts' layout relative to each other.
 */
const fusedCache = new Map<string, ReturnType<typeof fusedProfile>>();
function measureFused(shapes: Shape[]) {
  const local = inFrameOf(shapes, shapes[0]!.transform);
  const r3 = (v: number) => Math.round(v * 1e4) / 1e4;
  const key = JSON.stringify(local.map((s) => [s.kind, s.params, s.transform.position.map(r3), s.transform.rotation.map(r3)]));
  let hit = fusedCache.get(key);
  if (!hit) {
    hit = fusedProfile(local);
    fusedCache.set(key, hit);
    if (fusedCache.size > 40) fusedCache.delete(fusedCache.keys().next().value!);
  }
  return hit;
}

/** Everything to crochet: fused pieces, then loose shapes. Mirrored pairs are one entry made twice. */
function items(p: Project): Item[] {
  return [
    ...p.fused.map((piece) => ({ kind: 'fused' as const, piece })),
    ...p.shapes.filter((s) => !pieceOf(p, s.id) && !(s.mirrorOf && findShape(p, s.mirrorOf))).map((shape) => ({ kind: 'shape' as const, shape })),
  ];
}

const span = (ns: number[]) => (ns.length > 1 ? `Rnds ${ns[0]}–${ns[ns.length - 1]}` : `Rnd ${ns[0]}`);

export function PatternPanel() {
  const ed = useEditor();
  // Fused patterns take a moment to measure, so follow drags a beat behind.
  const project = useDeferredValue(ed.project);
  const set = (patch: Partial<Project['settings']>) => ed.edit({ ...ed.project, settings: { ...ed.project.settings, ...patch } });
  const yarn = YARN_PRESETS.find((y) => y.id === project.settings.yarnId) ?? YARN_PRESETS[3]!;

  // Show the pattern of whatever single thing is selected; a part shows its whole piece.
  const shown: Item | null = useMemo(() => {
    if (ed.selected.length !== 1) return null;
    const id = ed.selected[0]!;
    const piece = findPiece(project, id) ?? pieceOf(project, id);
    if (piece) return { kind: 'fused', piece };
    const s = findShape(project, id);
    if (!s) return null;
    return { kind: 'shape', shape: s.mirrorOf ? findShape(project, s.mirrorOf) ?? s : s };
  }, [project, ed.selected]);
  const result = useMemo(() => (shown ? patternOf(project, shown) : null), [project, shown]);
  const summary = useMemo(() => items(project).map((it) => ({
    it, rounds: patternOf(project, it).piece.rounds.length,
    make: it.kind === 'shape' && partnerOf(project, it.shape.id) ? 2 : 1,
  })), [project]);

  return (
    <section className="paper card pattern" aria-label="Pattern">
      <div className="settings">
        <label className="field" htmlFor="yarn">
          <span className="field-label">Yarn</span>
          <select id="yarn" value={project.settings.yarnId} onChange={(e) => set({ yarnId: e.target.value })}>
            {YARN_PRESETS.map((y) => <option key={y.id} value={y.id}>{y.label}, {y.defaultHookMm} mm hook</option>)}
          </select>
        </label>
        <fieldset className="buttons" aria-label="Round shaping">
          {ROUNDING.map((r) => (
            <label key={r.id} className="sew">
              <input type="radio" name="rounding" id={`round-${r.id}`} checked={project.settings.rounding === r.id} onChange={() => set({ rounding: r.id })} />
              <span className="disc" />{r.label}<small>{r.hint}</small>
            </label>
          ))}
        </fieldset>
        <div className="seg" role="radiogroup" aria-label="Terms">
          {(['US', 'UK'] as Terms[]).map((t) => (
            <label key={t}><input type="radio" name="terms" id={`terms-${t}`} checked={project.settings.terms === t} onChange={() => set({ terms: t })} />{t} terms</label>
          ))}
        </div>
      </div>

      <div className="pieces">
        <span className="eyebrow">Pieces · shift-click to pick several</span>
        {summary.length ? (
          <ul className="piece-list">
            {summary.map(({ it, rounds, make }) => (
              <li key={itemId(it)} className={ed.selected.includes(itemId(it)) ? 'on' : ''}>
                <button type="button" className="link" onClick={(e) => ed.select(itemId(it), e.shiftKey || e.ctrlKey || e.metaKey)}>
                  <i style={{ background: itemColor(it) }} aria-hidden="true" />{itemName(it)}
                </button>
                <span className="meta">{it.kind === 'fused' ? 'fused · ' : ''}{make > 1 ? 'make 2 · ' : ''}{rounds} rnds</span>
              </li>
            ))}
          </ul>
        ) : <p className="meta">Add a shape to see its pattern.</p>}
      </div>
      {shown && result && (
        <>
          <div className="pattern-head">
            <h2>{itemName(shown)}</h2>
            <button type="button" className="btn quiet small" onClick={(e) => {
              const btn = e.currentTarget;
              const done = () => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1400); };
              navigator.clipboard?.writeText(`${itemName(shown)}\n${patternText(result.lines)}`).then(done, () => {});
            }}>Copy</button>
          </div>
          <p className="meta">
            {shown.kind === 'fused' ? `One piece from ${shown.piece.shapeIds.length} shapes · ` : partnerOf(project, shown.shape.id) ? 'Make 2 · ' : ''}{yarn.label} · {result.piece.rounds.length} rounds · {result.piece.rounds.reduce((a, r) => a + r.count, 0)} stitches
          </p>
          <ol className="rows">
            {result.lines.map((l) => (
              <li key={l.label} className={l.kind}>
                <span className="lbl">{l.label}</span>
                <span className="txt">{l.text}</span>
                <span className="cnt">({l.count})</span>
              </li>
            ))}
          </ol>
          {result.splitRounds.length > 0 && (
            <p className="warn" role="note">
              <b>{span(result.splitRounds)} split into separate tubes.</b> The shapes don’t overlap there, so that stretch can’t be worked as one round. Move them closer, or separate them.
            </p>
          )}
          <p className="note">{result.piece.closedEnd ? 'stuff, then close the last 6' : 'leave a long tail'}</p>
        </>
      )}
    </section>
  );
}
