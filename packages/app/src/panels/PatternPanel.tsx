import {
  computeRounds, findShape, partnerOf, patternLines, patternText, shapeProfile, YARN_PRESETS,
  type Project, type RoundingMode, type Shape, type Terms,
} from '@rbr/engine';
import { useMemo } from 'react';
import { useEditor } from '../state/editor';

const ROUNDING: { id: RoundingMode; label: string; hint: string }[] = [
  { id: 'classic6', label: 'Classic', hint: 'steps of 6' },
  { id: 'balanced3', label: 'Balanced', hint: 'steps of 3' },
  { id: 'smooth', label: 'Smooth', hint: 'any count' },
];

function piecePattern(p: Project, s: Shape) {
  const yarn = YARN_PRESETS.find((y) => y.id === p.settings.yarnId) ?? YARN_PRESETS[3]!;
  const piece = computeRounds(shapeProfile(s), { gauge: yarn.gauge, stretch: p.settings.stretch, rounding: p.settings.rounding });
  return { piece, lines: patternLines(piece.rounds, p.settings.terms) };
}

/** Pieces are listed one per shape for now; mirrored pairs are one entry made twice. */
function pieces(p: Project): Shape[] {
  return p.shapes.filter((s) => !(s.mirrorOf && findShape(p, s.mirrorOf)));
}

export function PatternPanel() {
  const ed = useEditor();
  const { project } = ed;
  const set = (patch: Partial<Project['settings']>) => ed.edit({ ...project, settings: { ...project.settings, ...patch } });
  const yarn = YARN_PRESETS.find((y) => y.id === project.settings.yarnId) ?? YARN_PRESETS[3]!;

  const sel = ed.selected ? findShape(project, ed.selected) : undefined;
  const shown = sel && sel.mirrorOf ? findShape(project, sel.mirrorOf) ?? sel : sel;
  const result = useMemo(() => (shown ? piecePattern(project, shown) : null), [project, shown]);
  const summary = useMemo(() => pieces(project).map((s) => {
    const { piece } = piecePattern(project, s);
    return { s, rounds: piece.rounds.length, make: partnerOf(project, s.id) ? 2 : 1 };
  }), [project]);

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

      {shown && result ? (
        <>
          <div className="pattern-head">
            <h2>{shown.name}</h2>
            <button type="button" className="btn quiet small" onClick={(e) => {
              const btn = e.currentTarget;
              const done = () => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1400); };
              navigator.clipboard?.writeText(`${shown.name}\n${patternText(result.lines)}`).then(done, () => {});
            }}>Copy</button>
          </div>
          <p className="meta">
            {partnerOf(project, shown.id) ? 'Make 2 · ' : ''}{yarn.label} · {result.piece.rounds.length} rounds · {result.piece.rounds.reduce((a, r) => a + r.count, 0)} stitches
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
          <p className="note">
            {shown.hostId && findShape(project, shown.hostId) ? `sew onto ${findShape(project, shown.hostId)!.name}` : result.piece.closedEnd ? 'stuff, then close the last 6' : 'leave a long tail'}
          </p>
          <p className="meta">Each shape is worked on its own for now. Trimming at seams and fused pieces come in the next milestones.</p>
        </>
      ) : (
        <>
          <h2>Pieces</h2>
          {summary.length ? (
            <ul className="piece-list">
              {summary.map(({ s, rounds, make }) => (
                <li key={s.id}>
                  <button type="button" className="link" onClick={() => ed.select(s.id)}>
                    <i style={{ background: s.color }} aria-hidden="true" />{s.name}
                  </button>
                  <span className="meta">{make > 1 ? 'make 2 · ' : ''}{rounds} rnds</span>
                </li>
              ))}
            </ul>
          ) : <p className="meta">Add a shape to see its pattern.</p>}
        </>
      )}
    </section>
  );
}
