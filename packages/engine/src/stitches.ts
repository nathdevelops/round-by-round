import { pointAt, smoothProfile, withArcLength } from './profile';
import type { PieceRounds, ProfilePoint, Round, RoundingMode, StitchKind, StitchSettings } from './types';

const TAU = Math.PI * 2;
const MAGIC_RING = 6;

export const ROUNDING_STEP: Record<RoundingMode, number> = { classic6: 6, balanced3: 3, smooth: 1 };

/**
 * Pick a round's stitch count: nearest to target, snapped to the rounding step,
 * never more than double or less than half of the previous round, never under 6.
 */
export function snapCount(target: number, prev: number, step: number): { count: number; clamped: boolean } {
  const lo = Math.max(MAGIC_RING, Math.ceil(prev / 2));
  const hi = prev * 2;
  let n = Math.max(MAGIC_RING, Math.round(target / step) * step);
  let clamped = false;
  if (n > hi) { n = hi; clamped = true; }
  if (n < lo) { n = lo; clamped = true; }
  if (n % step !== 0) {
    // Re-snap inside the allowed band, preferring the direction the target wanted.
    const up = Math.ceil(n / step) * step, dn = Math.floor(n / step) * step;
    if (target >= n && up <= hi) n = up;
    else if (dn >= lo) n = dn;
    else if (up <= hi) n = up;
  }
  return { count: n, clamped };
}

/** Gaps (plain sc) before each inc/dec, spread evenly with Bresenham spacing. */
export function evenGaps(plain: number, units: number): number[] {
  const gaps: number[] = [];
  for (let i = 0; i < units; i++) gaps.push(Math.floor(((i + 1) * plain) / units) - Math.floor((i * plain) / units));
  return gaps;
}

/**
 * Stitch kinds for a round worked over `prev` stitches ending with `count`.
 * An inc makes 2 stitches from 1; a dec makes 1 from 2.
 * When `stagger` is set and the gaps allow it, the sequence starts halfway into
 * the first gap so changes don't stack into corners.
 */
export function roundKinds(prev: number, count: number, stagger = false): StitchKind[] {
  const d = count - prev;
  if (prev === 0 || d === 0) return Array<StitchKind>(count).fill('sc');
  const inc = d > 0, units = Math.abs(d);
  const plain = inc ? prev - units : prev - 2 * units;
  const gaps = evenGaps(plain, units);
  const lead = stagger && gaps.every((g) => g === gaps[0]) && gaps[0]! >= 2 && units > 1 ? Math.floor(gaps[0]! / 2) : 0;
  const out: StitchKind[] = [];
  gaps.forEach((g, i) => {
    const before = i === 0 ? g - lead : g;
    for (let k = 0; k < before; k++) out.push('sc');
    if (inc) out.push('inc', 'inc');
    else out.push('dec');
  });
  for (let k = 0; k < lead; k++) out.push('sc');
  return out;
}

/** Slice a side profile into rounds and compute stitch counts. */
export function computeRounds(profile: ProfilePoint[], settings: StitchSettings): PieceRounds {
  const { gauge, stretch, rounding } = settings;
  const step = ROUNDING_STEP[rounding];
  const curve = withArcLength(smoothProfile(profile));
  const length = curve[curve.length - 1]!.s;
  const effW = gauge.stitchW * (1 + stretch);
  const closedEnd = profile[profile.length - 1]!.r < gauge.stitchW * 0.25;

  const n = Math.max(3, Math.round(length / gauge.rowH));
  const rowH = length / n;
  const bodyRounds = closedEnd ? n - 1 : n;

  const rounds: Round[] = [];
  let prev = 0;
  let incRounds = 0;
  const push = (count: number, s: number, clamped: boolean) => {
    const p = pointAt(curve, s);
    const stagger = count > prev && prev > 0 ? (incRounds++ % 2 === 1) : false;
    rounds.push({
      n: rounds.length + 1, count, prev, delta: prev ? count - prev : 0,
      kinds: roundKinds(prev, count, stagger),
      z: p.z, rTarget: p.r, r: (count * effW) / TAU, s, clamped,
    });
    prev = count;
  };

  for (let k = 1; k <= bodyRounds; k++) {
    const s = k * rowH;
    if (k === 1) { push(MAGIC_RING, s, false); continue; }
    const target = (TAU * pointAt(curve, s).r) / effW;
    const { count, clamped } = snapCount(target, prev, step);
    push(count, s, clamped);
  }

  if (closedEnd) {
    // Decrease down to 6 over the last stretch of surface, then close.
    const closing: number[] = [];
    let c = prev;
    while (c > MAGIC_RING) {
      let next = Math.max(MAGIC_RING, Math.ceil(c / 2));
      if (c % step === 0) next = Math.max(MAGIC_RING, Math.ceil(next / step) * step);
      if (next >= c) next = c - Math.min(step, c - MAGIC_RING);
      closing.push((c = next));
    }
    const s0 = rounds[rounds.length - 1]!.s;
    closing.forEach((count, i) => push(count, s0 + ((length - s0) * (i + 1)) / (closing.length + 1), false));
  }

  return { rounds, closedEnd, rowH, length };
}
