import { itemFor, planText, YARN_PRESETS, type PiecePlan, type Project, type RoundingMode, type Terms } from '@rbr/engine';
import { useEditor } from '../state/editor';
import { usePlan } from '../state/plan';

const ROUNDING: { id: RoundingMode; label: string; hint: string }[] = [
  { id: 'classic6', label: 'Classic', hint: 'steps of 6' },
  { id: 'balanced3', label: 'Balanced', hint: 'steps of 3' },
  { id: 'smooth', label: 'Smooth', hint: 'any count' },
];

const span = (ns: number[]) => (ns.length > 1 ? `Rnds ${ns[0]}–${ns[ns.length - 1]}` : `Rnd ${ns[0]}`);

function CopyButton({ text, label = 'Copy' }: { text: () => string; label?: string }) {
  return (
    <button type="button" className="btn quiet small" onClick={(e) => {
      const btn = e.currentTarget;
      const done = () => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = label), 1400); };
      navigator.clipboard?.writeText(text()).then(done, () => {});
    }}>{label}</button>
  );
}

export function PatternPanel() {
  const ed = useEditor();
  const plan = usePlan();
  const { project } = ed;
  const set = (patch: Partial<Project['settings']>) => ed.edit({ ...project, settings: { ...project.settings, ...patch } });
  const yarn = YARN_PRESETS.find((y) => y.id === project.settings.yarnId) ?? YARN_PRESETS[3]!;

  // Show the pattern of whatever single thing is selected; a part shows its whole piece,
  // and a mirrored copy shows the pattern it shares with its partner.
  let shown: PiecePlan | undefined;
  if (ed.selected.length === 1) {
    const it = itemFor(project, ed.selected[0]!);
    const id = it?.kind === 'shape' && it.shape.mirrorOf && !plan.pieces.some((x) => x.id === it.id) ? it.shape.mirrorOf : it?.id;
    shown = plan.pieces.find((x) => x.id === id);
  }
  const nameOf = (id: string) => plan.pieces.find((x) => x.id === id)?.name ?? itemFor(project, id)?.name ?? '';

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
        <div className="pattern-head">
          <span className="eyebrow">Pieces, in making order</span>
          {plan.pieces.length > 0 && <CopyButton label="Copy all" text={() => planText(project, plan)} />}
        </div>
        {plan.pieces.length ? (
          <ul className="piece-list">
            {plan.pieces.map((pc) => (
              <li key={pc.id} className={`${ed.selected.includes(pc.id) ? 'on' : ''}${pc.hostId ? ' sewn' : ''}`}>
                <button type="button" className="link" onClick={(e) => ed.select(pc.id, e.shiftKey || e.ctrlKey || e.metaKey)}>
                  <i style={{ background: pc.color }} aria-hidden="true" />{pc.name}
                </button>
                <span className="meta">
                  {pc.item.kind === 'fused' ? 'fused · ' : ''}{pc.make > 1 ? 'make 2 · ' : ''}{pc.hostId ? `sewn to ${nameOf(pc.hostId)} · ` : ''}{pc.rounds.rounds.length} rnds
                  {pc.issues.length > 0 && <b className="flag" title={pc.issues.join(' ')}> !</b>}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="meta">Add a shape to see its pattern.</p>}
      </div>

      {shown && (
        <>
          <div className="pattern-head">
            <h2>{shown.name}</h2>
            <CopyButton text={() => [shown!.name, ...shown!.lines.map((l) => `${l.label}: ${l.text} (${l.count})`), ...shown!.finish].join('\n')} />
          </div>
          <p className="meta">
            {shown.item.kind === 'fused' ? `One piece from ${shown.item.shapes.length} shapes · ` : shown.make > 1 ? 'Make 2 · ' : ''}
            {yarn.label} · {shown.rounds.rounds.length} rounds · {shown.rounds.rounds.reduce((a, r) => a + r.count, 0)} stitches
          </p>
          <ol className="rows">
            {shown.lines.map((l) => (
              <li key={l.label} className={l.kind}>
                <span className="lbl">{l.label}</span>
                <span className="txt">{l.text}</span>
                <span className="cnt">({l.count})</span>
              </li>
            ))}
          </ol>
          {shown.finish.map((f) => <p key={f} className="finish">{f}</p>)}
          {shown.seam && <p className="seam-note"><span className="eyebrow">Sewing on</span>{shown.seam.text}</p>}
          {shown.splitRounds.length > 0 && (
            <p className="warn" role="note">
              <b>{span(shown.splitRounds)} split into separate tubes.</b> The shapes don’t overlap there, so that stretch can’t be worked as one round. Move them closer, or separate them.
            </p>
          )}
          {shown.issues.map((t) => <p key={t} className="warn" role="note">{t}</p>)}
        </>
      )}

      {plan.assembly.length > 0 && (
        <div className="assembly">
          <span className="eyebrow">Assembly</span>
          <ol>{plan.assembly.map((a) => <li key={a}>{a}</li>)}</ol>
        </div>
      )}
    </section>
  );
}
