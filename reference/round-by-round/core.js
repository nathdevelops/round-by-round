// ---- Pattern core: profile -> rounds -> written pattern ----
const TAU = Math.PI * 2;

// Catmull-Rom through control points, sampled densely
function smoothCurve(pts, per = 20) {
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let t = 0; t < 1; t += 1 / per) {
      const t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ r: Math.max(0, f(p0.r, p1.r, p2.r, p3.r)), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...pts[pts.length - 1] });
  return out;
}

function withArc(curve) {
  let s = 0;
  return curve.map((p, i) => {
    if (i) s += Math.hypot(p.r - curve[i - 1].r, p.z - curve[i - 1].z);
    return { ...p, s };
  });
}

function pointAt(c, s) {
  if (s <= 0) return c[0];
  for (let i = 1; i < c.length; i++) {
    if (c[i].s >= s) {
      const a = c[i - 1], b = c[i], t = (s - a.s) / (b.s - a.s || 1);
      return { r: a.r + (b.r - a.r) * t, z: a.z + (b.z - a.z) * t, s };
    }
  }
  return c[c.length - 1];
}

function snapCount(target, prev, mult6, minCount) {
  const lo = prev ? Math.ceil(prev / 2) : minCount, hi = prev ? prev * 2 : 99999;
  let n = Math.max(minCount, Math.round(target));
  if (mult6) n = Math.max(6, Math.round(n / 6) * 6);
  n = Math.min(hi, Math.max(lo, n));
  if (mult6 && n % 6) { // re-snap inside the allowed band
    const up = Math.ceil(n / 6) * 6, dn = Math.floor(n / 6) * 6;
    n = up <= hi ? up : dn >= lo && dn >= 6 ? dn : n;
  }
  return Math.max(minCount, n);
}

// Returns rounds with stitch counts plus reconstructed geometry
function computeRounds(part, gauge, scale, mult6) {
  const pts = part.points.map((p) => ({ r: p.r * scale, z: p.z * scale }));
  const curve = withArc(smoothCurve(pts));
  const L = curve[curve.length - 1].s;
  const effW = gauge.w * (1 + gauge.stretch);
  const closed = pts[pts.length - 1].r < 0.12 * scale;
  let n = Math.max(3, Math.round(L / gauge.h));
  const hh = L / n;
  const rounds = [];
  let prev = 0;
  const bodyN = closed ? n - 1 : n;
  for (let k = 1; k <= bodyN; k++) {
    const p = pointAt(curve, k * hh);
    const target = (TAU * p.r) / effW;
    const count = k === 1 ? 6 : snapCount(target, prev, mult6, 6);
    rounds.push({ count, prev, z: p.z, rTarget: p.r, s: k * hh });
    prev = count;
  }
  if (closed) { // decrease down to 6, spread over the last stretch of surface
    const last = rounds[rounds.length - 1];
    const extra = [];
    let c = prev;
    while (c > 6) {
      let nx = Math.max(6, Math.ceil(c / 2));
      if (mult6 && c % 6 === 0) nx = Math.max(6, Math.ceil(nx / 6) * 6);
      if (nx >= c) nx = c - 6;
      extra.push((c = nx));
    }
    extra.forEach((cnt, i) => {
      const s = last.s + ((L - last.s) * (i + 1)) / (extra.length + 1);
      const p = pointAt(curve, s);
      rounds.push({ count: cnt, prev: rounds[rounds.length - 1].count, z: p.z, rTarget: p.r, s });
    });
  }
  rounds.forEach((r, i) => {
    r.n = i + 1;
    r.d = i === 0 ? 0 : r.count - r.prev;
    r.r = (r.count * effW) / TAU; // radius the crocheted round will actually have
  });
  return { rounds, closed, rowH: hh, length: L, curve, pts };
}

const rep = (grp, times) => (times === 1 ? grp : grp.includes(',') ? `(${grp}) x${times}` : `${grp} x${times}`);
const scTxt = (g) => (g === 0 ? '' : g === 1 ? 'sc, ' : `${g} sc, `);

function spread(P, units, kind, stagger) {
  const plain = kind === 'inc' ? P - units : P - 2 * units;
  const gaps = [];
  for (let i = 0; i < units; i++) gaps.push(Math.floor(((i + 1) * plain) / units) - Math.floor((i * plain) / units));
  const allSame = gaps.every((g) => g === gaps[0]);
  if (allSame) {
    const g = gaps[0];
    if (stagger && g >= 2 && units > 1) {
      const a = Math.floor(g / 2), b = g - a;
      return `${a === 1 ? 'sc' : a + ' sc'}, ${kind}, ${rep(scTxt(g) + kind, units - 1)}, ${b === 1 ? 'sc' : b + ' sc'}`;
    }
    return rep(scTxt(g) + kind, units);
  }
  for (let p = 2; p <= 3; p++) {
    if (units % p) continue;
    if (gaps.every((g, i) => g === gaps[i % p])) {
      const grp = gaps.slice(0, p).map((g) => scTxt(g) + kind).join(', ');
      return rep(grp, units / p);
    }
  }
  const q = Math.min(...gaps), big = gaps.filter((g) => g > q).length;
  return `${rep(scTxt(q) + kind, units - big)}, ${rep(scTxt(q + 1) + kind, big)}`;
}

function roundText(r, incIdx) {
  if (r.n === 1) return '6 sc in a magic ring';
  if (r.d === 0) return 'sc in each st around';
  if (r.d > 0) return spread(r.prev, r.d, 'inc', incIdx % 2 === 1);
  return spread(r.prev, -r.d, 'dec', false);
}

function patternLines(rounds) {
  const lines = [];
  let incIdx = 0;
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    if (r.d === 0 && r.n > 1) {
      let j = i;
      while (j + 1 < rounds.length && rounds[j + 1].d === 0) j++;
      lines.push({ label: j > i ? `Rnds ${r.n}–${rounds[j].n}` : `Rnd ${r.n}`, text: 'sc in each st around', count: r.count, kind: 'plain', from: r.n, to: rounds[j].n });
      i = j;
      continue;
    }
    if (r.d > 0) incIdx++;
    lines.push({ label: `Rnd ${r.n}`, text: roundText(r, incIdx), count: r.count, kind: r.n === 1 ? 'start' : r.d > 0 ? 'inc' : 'dec', from: r.n, to: r.n });
  }
  return lines;
}

function partTips(part, res, gauge) {
  const tips = [];
  const R = res.rounds;
  const maxIdx = R.reduce((m, r, i) => (r.count > R[m].count ? i : m), 0);
  if (Math.abs(res.rowH - gauge.h) / gauge.h > 0.08)
    tips.push(`Rows were stretched to ${res.rowH.toFixed(2)} cm tall to fit the shape evenly. Your gauge says ${gauge.h} cm, so the finished piece may come out slightly ${res.rowH > gauge.h ? 'shorter' : 'taller'}.`);
  const after = R[maxIdx + 1];
  if (after && after.d <= -Math.max(5, after.prev * 0.15))
    tips.push(`Work Rnd ${after.n} in back loops only. The surface turns sharply there, and BLO gives a crisp edge.`);
  if (R.some((r) => r.d < 0)) tips.push('Use the invisible decrease (front loops only) so decreases blend in.');
  if (part.face) {
    const eye = R[Math.round(R.length * 0.55)] || R[R.length - 1];
    tips.push(`Insert safety eyes between Rnds ${eye.n} and ${eye.n + 1}, about ${Math.max(3, Math.round(eye.count * 0.2))} sts apart, before stuffing.`);
  }
  if (res.closed) {
    const st = R.find((r, i) => i > maxIdx && r.count <= Math.max(18, R[maxIdx].count / 2));
    if (st) tips.push(`Start stuffing around Rnd ${st.n} and keep adding as the opening closes.`);
    tips.push('Fasten off, weave the tail through the front loops of the last 6 sts, and pull closed.');
  } else {
    tips.push('Fasten off, leaving a long tail for sewing. Stuff firmly before attaching.');
  }
  if (part.note) tips.push(part.note);
  return tips;
}

if (typeof module !== 'undefined') module.exports = { computeRounds, patternLines, partTips, spread };
