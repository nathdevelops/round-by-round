import type { PatternLine, Round, StitchKind, Terms } from './types';

interface Words { sc: string; ring: string; around: string }

const WORDS: Record<Terms, Words> = {
  US: { sc: 'sc', ring: '6 sc in a magic ring', around: 'sc in each st around' },
  UK: { sc: 'dc', ring: '6 dc in a magic ring', around: 'dc in each st around' },
};

const repeat = (group: string, times: number) =>
  times === 1 ? group : group.includes(',') ? `(${group}) x${times}` : `${group} x${times}`;

const plainText = (n: number, w: Words) => (n === 1 ? w.sc : `${n} ${w.sc}`);
const unitText = (gap: number, change: 'inc' | 'dec', w: Words) => (gap ? `${plainText(gap, w)}, ${change}` : change);

/** Shortest repeating period (1 to 3 groups) written as "(…) xN", else runs of equal groups. */
function compress(groups: string[]): string {
  for (let p = 1; p <= 3; p++) {
    if (groups.length % p) continue;
    if (groups.every((g, i) => g === groups[i % p])) return repeat(groups.slice(0, p).join(', '), groups.length / p);
  }
  const runs: string[] = [];
  for (let i = 0; i < groups.length; ) {
    let j = i;
    while (j + 1 < groups.length && groups[j + 1] === groups[i]) j++;
    runs.push(repeat(groups[i]!, j - i + 1));
    i = j + 1;
  }
  return runs.join(', ');
}

/** Crochet shorthand for one shaping round, e.g. "(2 sc, inc) x6" or "sc, inc, (2 sc, inc) x5, sc". */
export function describeRound(kinds: StitchKind[], terms: Terms = 'US'): string {
  const w = WORDS[terms];
  const units: { gap: number; change: 'inc' | 'dec' }[] = [];
  let run = 0;
  for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i]!;
    if (k === 'sc') { run++; continue; }
    units.push({ gap: run, change: k });
    run = 0;
    if (k === 'inc') i++; // an inc is two entries
  }
  const tail = run;
  if (!units.length) return w.around;
  if (tail > 0 && units.length > 1) {
    // Staggered: lead, change, (gap, change) x n, tail
    const [first, ...rest] = units;
    const lead = first!.gap ? `${plainText(first!.gap, w)}, ` : '';
    return `${lead}${first!.change}, ${compress(rest.map((u) => unitText(u.gap, u.change, w)))}, ${plainText(tail, w)}`;
  }
  const body = compress(units.map((u) => unitText(u.gap, u.change, w)));
  return tail ? `${body}, ${plainText(tail, w)}` : body;
}

/** Written pattern lines for one piece; consecutive plain rounds merge into one line. */
export function patternLines(rounds: Round[], terms: Terms = 'US'): PatternLine[] {
  const w = WORDS[terms];
  const lines: PatternLine[] = [];
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i]!;
    if (r.n === 1) {
      lines.push({ label: 'Rnd 1', text: w.ring, count: r.count, kind: 'start', from: 1, to: 1 });
      continue;
    }
    if (r.delta === 0) {
      let j = i;
      while (j + 1 < rounds.length && rounds[j + 1]!.delta === 0) j++;
      const last = rounds[j]!;
      lines.push({ label: j > i ? `Rnds ${r.n}–${last.n}` : `Rnd ${r.n}`, text: w.around, count: r.count, kind: 'plain', from: r.n, to: last.n });
      i = j;
      continue;
    }
    lines.push({ label: `Rnd ${r.n}`, text: describeRound(r.kinds, terms), count: r.count, kind: r.delta > 0 ? 'inc' : 'dec', from: r.n, to: r.n });
  }
  return lines;
}

export function patternText(lines: PatternLine[]): string {
  return lines.map((l) => `${l.label}: ${l.text} (${l.count})`).join('\n');
}
