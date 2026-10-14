import {
  computeRounds, patternLines, patternText, shapeProfile, scaleProfile,
  SHAPE_DEFAULTS, YARN_PRESETS, type RoundingMode, type ShapeKind, type Terms,
} from '@rbr/engine';
import { useMemo, useState } from 'react';

// M1 engine playground: one shape in, one pattern out. The modeling editor arrives in M2.

const SHAPE_LABELS: Record<ShapeKind, string> = {
  sphere: 'Sphere', ellipsoid: 'Ellipsoid', egg: 'Egg', capsule: 'Capsule',
  cylinder: 'Cylinder', cone: 'Cone', teardrop: 'Teardrop', dome: 'Dome',
};

const ROUNDING: { id: RoundingMode; label: string; hint: string }[] = [
  { id: 'classic6', label: 'Classic', hint: 'multiples of 6' },
  { id: 'balanced3', label: 'Balanced', hint: 'steps of 3' },
  { id: 'smooth', label: 'Smooth', hint: 'raw counts' },
];

export function App() {
  const [kind, setKind] = useState<ShapeKind>('sphere');
  const [scale, setScale] = useState(1);
  const [yarnId, setYarnId] = useState('worsted');
  const [stretch, setStretch] = useState(0.1);
  const [rounding, setRounding] = useState<RoundingMode>('classic6');
  const [terms, setTerms] = useState<Terms>('US');

  const yarn = YARN_PRESETS.find((y) => y.id === yarnId)!;
  const result = useMemo(() => {
    const profile = scaleProfile(shapeProfile({ kind, params: SHAPE_DEFAULTS[kind] }), scale);
    const piece = computeRounds(profile, { gauge: yarn.gauge, stretch, rounding });
    const zs = profile.map((p) => p.z);
    return { piece, lines: patternLines(piece.rounds, terms), height: Math.max(...zs) - Math.min(...zs) };
  }, [kind, scale, yarn, stretch, rounding, terms]);

  const stitches = result.piece.rounds.reduce((a, r) => a + r.count, 0);
  const copy = () => navigator.clipboard?.writeText(patternText(result.lines)).catch(() => {});

  return (
    <div className="page">
      <header className="masthead">
        <h1>Round by Round</h1>
        <p>Engine playground · milestone 1</p>
      </header>

      <main className="layout">
        <section className="card controls" aria-label="Settings">
          <label>Shape
            <select value={kind} onChange={(e) => setKind(e.target.value as ShapeKind)}>
              {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((k) => <option key={k} value={k}>{SHAPE_LABELS[k]}</option>)}
            </select>
          </label>
          <label>Size <output>{Math.round(scale * 100)}%</output>
            <input type="range" min={0.5} max={3} step={0.05} value={scale} onChange={(e) => setScale(+e.target.value)} />
          </label>
          <label>Yarn
            <select value={yarnId} onChange={(e) => setYarnId(e.target.value)}>
              {YARN_PRESETS.map((y) => <option key={y.id} value={y.id}>{y.label}, {y.defaultHookMm} mm hook</option>)}
            </select>
          </label>
          <label>Stuffing stretch <output>{Math.round(stretch * 100)}%</output>
            <input type="range" min={0} max={0.2} step={0.01} value={stretch} onChange={(e) => setStretch(+e.target.value)} />
          </label>
          <fieldset>
            <legend>Round shaping</legend>
            {ROUNDING.map((r) => (
              <label key={r.id} className="radio">
                <input type="radio" name="rounding" checked={rounding === r.id} onChange={() => setRounding(r.id)} />
                {r.label} <span className="hint">{r.hint}</span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Terms</legend>
            {(['US', 'UK'] as Terms[]).map((t) => (
              <label key={t} className="radio">
                <input type="radio" name="terms" checked={terms === t} onChange={() => setTerms(t)} /> {t}
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card pattern" aria-label="Pattern">
          <div className="pattern-head">
            <h2>{SHAPE_LABELS[kind]}</h2>
            <button type="button" onClick={copy}>Copy pattern</button>
          </div>
          <p className="meta">
            {result.height.toFixed(1)} cm tall · {result.piece.rounds.length} rounds · {stitches} stitches
          </p>
          <ol className="rows">
            {result.lines.map((l) => (
              <li key={l.label} className={l.kind}>
                <span className="label">{l.label}</span>
                <span className="text">{l.text}</span>
                <span className="count">({l.count})</span>
              </li>
            ))}
          </ol>
          <p className="meta">
            {result.piece.closedEnd ? 'Fasten off and weave the tail through the front loops of the last 6 sts to close.' : 'Fasten off, leaving a long tail for sewing.'}
          </p>
        </section>
      </main>
    </div>
  );
}
