// Amigurumi pattern engine (prototype).
// A piece is a surface of revolution described by a profile polyline of
// [r, z] points in millimetres, walked in the direction you crochet.
// We slice the profile by arc length at one row height per round, turn each
// slice's circumference into a stitch count, and write the inc/dec rounds.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Amigurumi = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Gauge from a 10 cm swatch: stitches and rows per 10 cm.
  function gaugeFromSwatch(stsPer10cm, rowsPer10cm) {
    return { stitchW: 100 / stsPer10cm, rowH: 100 / rowsPer10cm };
  }

  // ---------- geometry ----------
  function arcTable(profile) {
    const s = [0];
    for (let i = 1; i < profile.length; i++) {
      const [r0, z0] = profile[i - 1], [r1, z1] = profile[i];
      s.push(s[i - 1] + Math.hypot(r1 - r0, z1 - z0));
    }
    return s;
  }

  function sampleAt(profile, table, s) {
    let i = 1;
    while (i < table.length - 1 && table[i] < s) i++;
    const t = (s - table[i - 1]) / ((table[i] - table[i - 1]) || 1);
    const [r0, z0] = profile[i - 1], [r1, z1] = profile[i];
    return { r: r0 + (r1 - r0) * t, z: z0 + (z1 - z0) * t, seg: i - 1 };
  }

  // Turning angle (degrees) of the profile between arc positions a and b.
  function turnBetween(profile, table, a, b) {
    const dir = (seg) => {
      const [r0, z0] = profile[seg], [r1, z1] = profile[seg + 1];
      return Math.atan2(z1 - z0, r1 - r0);
    };
    const sa = sampleAt(profile, table, a).seg, sb = sampleAt(profile, table, b).seg;
    let d = Math.abs(dir(sb) - dir(sa)) * 180 / Math.PI;
    if (d > 180) d = 360 - d;
    return d;
  }

  // ---------- stitch counts ----------
  // Raw count = circumference / stitch width, then snapped so each round
  // changes by 0 or a multiple of 6 (the classic amigurumi rhythm).
  function roundCounts(piece, gauge) {
    const { profile } = piece;
    const table = arcTable(profile);
    const total = table[table.length - 1];
    const startsClosed = profile[0][0] < 1e-6;
    const endsClosed = profile[profile.length - 1][0] < 1e-6;
    const rounds = [];
    let prev = 0;
    const n = Math.max(1, Math.round(total / gauge.rowH));
    const step = total / n; // stretch rows slightly so the piece ends on a round
    for (let k = 1; k <= n; k++) {
      const s = startsClosed ? k * step : (k - 0.5) * step;
      const p = sampleAt(profile, table, Math.min(s, total));
      let target = Math.max(0, (2 * Math.PI * p.r) / gauge.stitchW);
      let count;
      if (k === 1 && startsClosed) count = 6;
      else if (k === 1) count = Math.max(6, Math.round(target));
      else {
        // pick the change that lands closest to the target from 0 or a
        // multiple of 6, so every round splits into even repeats. ±3 is only
        // for tiny pieces, or to get back onto a multiple of 6.
        const raw = target - prev;
        const options = [0];
        if (prev < 18 || prev % 6 === 3) options.push(3, -3);
        for (let m = 6; m <= Math.abs(raw) + 6; m += 6) options.push(m, -m);
        let d = 0;
        for (const o of options) if (Math.abs(raw - o) < Math.abs(raw - d) - 1e-9) d = o;
        count = prev + d;
        count = Math.min(count, prev * 2);
        count = Math.max(count, Math.ceil(prev / 2), 6);
      }
      const corner = k > 1 && turnBetween(profile, table, s - step, s) > 55;
      rounds.push({ n: k, count, s, r: p.r, z: p.z, corner });
      prev = count;
    }
    if (endsClosed) {
      // keep decreasing in sixes until we can close cleanly
      while (prev > 6) {
        const count = Math.max(6, prev - 6);
        const last = rounds[rounds.length - 1];
        rounds.push({ n: last.n + 1, count, s: total, r: 0, z: last.z, corner: false });
        prev = count;
      }
    }
    return { rounds, total, startsClosed, endsClosed };
  }

  // ---------- round instructions ----------
  function rle(units) {
    const out = [];
    for (const u of units) {
      const last = out[out.length - 1];
      if (last && last.u === u) last.n++;
      else out.push({ u, n: 1 });
    }
    return out.map(({ u, n }) => (u === 'sc' ? `sc ${n}` : n === 1 ? u : `${u} ${n}`)).join(', ');
  }

  // Which of the `units` stitches worked this round get the inc/dec.
  // stagger shifts them on alternate rounds so the piece stays round
  // instead of growing hexagon corners.
  function specialPositions(units, k, stagger) {
    const pos = [];
    if (units % k === 0) {
      const g = units / k;
      const h = stagger ? Math.max(0, Math.floor(g / 2) - 1) : g - 1;
      for (let i = 0; i < k; i++) pos.push(i * g + h);
    } else {
      for (let i = 0; i < k; i++) pos.push(Math.max(0, Math.floor(((i + (stagger ? 0.5 : 1)) * units) / k) - 1));
    }
    return pos;
  }

  // Write the round going from `prev` to `count` stitches.
  function instruction(prev, count, stagger) {
    if (count === prev) return { text: 'sc in each st around', inc: 0, dec: 0 };
    const isInc = count > prev;
    const k = Math.abs(count - prev);
    const special = isInc ? 'inc' : 'dec';
    const units = isInc ? prev : prev - k; // stitches worked this round
    const res = { inc: isInc ? k : 0, dec: isInc ? 0 : k };
    if (units === k) return { ...res, text: isInc ? 'inc in each st around' : 'dec around' };
    if (units % k === 0) {
      const plain = units / k - 1;
      const h = specialPositions(units, k, stagger)[0];
      let text;
      if (k === 1) text = h === plain ? `sc ${plain}, ${special}` : `sc ${h}, ${special}, sc ${plain - h}`;
      else if (h === plain) text = `(sc ${plain}, ${special}) x${k}`;
      else if (h === 0) text = `(${special}, sc ${plain}) x${k}`;
      else if (k === 2) text = `sc ${h}, ${special}, sc ${plain}, ${special}, sc ${plain - h}`;
      else text = `sc ${h}, ${special}, (sc ${plain}, ${special}) x${k - 1}, sc ${plain - h}`;
      return { ...res, text };
    }
    const seq = new Array(units).fill('sc');
    for (const p of specialPositions(units, k, stagger)) seq[p] = special;
    return { ...res, text: rle(seq) };
  }

  // Each finished stitch of the round, tagged sc / inc / dec, for the preview.
  function stitchMarks(prev, count, stagger) {
    if (count === prev) return new Array(count).fill('sc');
    const isInc = count > prev;
    const k = Math.abs(count - prev);
    const units = isInc ? prev : prev - k;
    const sp = new Set(specialPositions(units, k, stagger));
    const marks = [];
    for (let j = 0; j < units; j++) {
      if (!sp.has(j)) marks.push('sc');
      else if (isInc) marks.push('inc', 'inc');
      else marks.push('dec');
    }
    return marks;
  }

  // ---------- full piece ----------
  function buildPiece(piece, gauge) {
    const { rounds, total, startsClosed, endsClosed } = roundCounts(piece, gauge);
    const lines = [];
    let prev = 0;
    rounds.forEach((rd, i) => {
      let text, inc = 0, dec = 0;
      if (i === 0 && startsClosed) {
        text = `6 sc in magic ring`;
      } else if (i === 0) {
        text = `ch ${rd.count}, join to form a ring, sc in each ch`;
      } else {
        ({ text, inc, dec } = instruction(prev, rd.count, i % 2 === 1));
      }
      let note = '';
      if (rd.corner) note = 'in back loops only';
      lines.push({ n: rd.n, text, count: rd.count, inc, dec, note,
        marks: i === 0 ? new Array(rd.count).fill('sc') : stitchMarks(prev, rd.count, i % 2 === 1),
        s: rd.s, r: rd.r, z: rd.z, color: colorAt(piece, rd.s / total) });
      prev = rd.count;
    });
    // collapse runs of identical "sc in each st around" rounds
    const grouped = [];
    for (const l of lines) {
      const g = grouped[grouped.length - 1];
      if (g && g.text === l.text && l.text === 'sc in each st around' && g.count === l.count && !l.note && !g.note && g.color === l.color) {
        g.to = l.n;
      } else grouped.push({ ...l, from: l.n, to: l.n });
    }
    const totalStitches = lines.reduce((a, l) => a + l.count, 0);
    return { name: piece.name, color: piece.color, lines, grouped, rounds: lines.length,
      totalStitches, startsClosed, endsClosed, profile: piece.profile, totalLength: total,
      finish: piece.finish, start: piece.start };
  }

  function colorAt(piece, t) {
    if (!piece.colorChanges) return piece.color;
    let c = piece.color;
    for (const cc of piece.colorChanges) if (t >= cc.at) c = cc.color;
    return c;
  }

  function formatPiece(p) {
    const out = [];
    out.push(`${p.name.toUpperCase()} (${p.color.name}, ${p.rounds} rounds)`);
    if (p.start) out.push(p.start);
    let lastColor = p.lines[0].color.name;
    for (const g of p.grouped) {
      if (g.color.name !== lastColor) { out.push(`Change to ${g.color.name}.`); lastColor = g.color.name; }
      const label = g.from === g.to ? `Rnd ${g.from}` : `Rnds ${g.from}–${g.to}`;
      const note = g.note ? `, ${g.note}` : '';
      out.push(`${label}${note}: ${g.text} (${g.count})`);
    }
    if (p.finish) out.push(p.finish);
    return out.join('\n');
  }

  return { gaugeFromSwatch, buildPiece, formatPiece, roundCounts, instruction };
});
