import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeRounds, patternLines, patternText, roundKinds, shapeProfile, snapCount,
  SHAPE_DEFAULTS, type RoundingMode, type ShapeKind, type StitchSettings,
} from '../src';

const worsted = (rounding: RoundingMode = 'classic6'): StitchSettings => ({
  gauge: { stitchW: 0.5, rowH: 0.45 }, stretch: 0.1, rounding,
});

/** Stitches consumed from the previous round by a list of kinds. */
const consumed = (kinds: string[]) => kinds.filter((k) => k === 'sc').length + kinds.filter((k) => k === 'inc').length / 2 + kinds.filter((k) => k === 'dec').length * 2;

const distinct = (xs: number[]) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);

describe('6 cm ball, worsted, classic rounding', () => {
  const { rounds, closedEnd } = computeRounds(shapeProfile({ kind: 'sphere', params: { radius: 3 } }), worsted());

  it('follows the classic sphere progression', () => {
    expect(distinct(rounds.map((r) => r.count))).toEqual([6, 12, 18, 24, 30, 36, 30, 24, 18, 12, 6]);
    expect(closedEnd).toBe(true);
  });

  it('writes the expected first rounds', () => {
    const text = patternText(patternLines(rounds));
    expect(text.split('\n').slice(0, 2)).toEqual([
      'Rnd 1: 6 sc in a magic ring (6)',
      'Rnd 2: inc x6 (12)',
    ]);
    expect(text).toContain('(sc, inc) x6 (18)');
    expect(text).toMatch(/Rnd \d+: dec x6 \(6\)$/);
  });

  it('merges consecutive plain rounds', () => {
    const plain = patternLines(rounds).filter((l) => l.kind === 'plain');
    expect(plain.some((l) => l.label.startsWith('Rnds '))).toBe(true);
  });
});

describe('6 cm ball with no stuffing stretch', () => {
  it('grows by exactly 6 each round at the start, like a classic pattern', () => {
    const { rounds } = computeRounds(shapeProfile({ kind: 'sphere', params: { radius: 3 } }), { ...worsted(), stretch: 0 });
    expect(rounds.slice(0, 4).map((r) => r.count)).toEqual([6, 12, 18, 24]);
  });
});

describe('roundKinds', () => {
  it('staggers evenly spaced increases', () => {
    expect(roundKinds(18, 24, true).join(' ')).toBe(
      ['sc', 'inc', 'inc', ...Array(5).fill(['sc', 'sc', 'inc', 'inc']).flat(), 'sc'].join(' '),
    );
  });

  it('always consumes the previous round and makes the new count', () => {
    fc.assert(fc.property(fc.integer({ min: 6, max: 120 }), fc.integer({ min: -60, max: 120 }), fc.boolean(), (prev, d, stagger) => {
      const count = Math.max(Math.ceil(prev / 2), Math.min(prev * 2, prev + d));
      const kinds = roundKinds(prev, count, stagger);
      expect(kinds.length).toBe(count);
      expect(consumed(kinds)).toBe(prev);
    }));
  });
});

describe('snapCount', () => {
  it('never more than doubles or less than halves', () => {
    expect(snapCount(100, 12, 6)).toEqual({ count: 24, clamped: true });
    expect(snapCount(1, 36, 6)).toEqual({ count: 18, clamped: true });
  });

  it('respects each rounding step', () => {
    expect(snapCount(20, 18, 6).count % 6).toBe(0);
    expect(snapCount(20, 18, 3).count % 3).toBe(0);
    expect(snapCount(20, 18, 1).count).toBe(20);
  });
});

describe('every shape, every rounding mode, a range of sizes', () => {
  const kinds = Object.keys(SHAPE_DEFAULTS) as ShapeKind[];
  const modes: RoundingMode[] = ['classic6', 'balanced3', 'smooth'];

  it('produces valid rounds', () => {
    fc.assert(fc.property(fc.constantFrom(...kinds), fc.constantFrom(...modes), fc.double({ min: 0.5, max: 3, noNaN: true }), (kind, mode, k) => {
      const params = Object.fromEntries(Object.entries(SHAPE_DEFAULTS[kind]).map(([key, v]) => [key, key === 'taper' || key === 'flatness' ? v : v * k]));
      const { rounds } = computeRounds(shapeProfile({ kind, params }), worsted(mode));
      expect(rounds[0]!.count).toBe(6);
      rounds.forEach((r, i) => {
        expect(r.count).toBeGreaterThanOrEqual(6);
        expect(r.kinds.length).toBe(r.count);
        if (i > 0) {
          expect(consumed(r.kinds)).toBe(r.prev);
          expect(r.count).toBeLessThanOrEqual(r.prev * 2);
          expect(r.count).toBeGreaterThanOrEqual(Math.ceil(r.prev / 2));
        }
      });
    }), { numRuns: 200 });
  });

  it('smooth follows the shape more closely than classic', () => {
    const profile = shapeProfile({ kind: 'egg', params: { radius: 4 } });
    const err = (mode: RoundingMode) => {
      const { rounds } = computeRounds(profile, worsted(mode));
      return rounds.reduce((a, r) => a + Math.abs(r.r - r.rTarget), 0) / rounds.length;
    };
    expect(err('smooth')).toBeLessThan(err('classic6'));
  });
});

describe('UK terms', () => {
  it('uses dc for single crochet', () => {
    const { rounds } = computeRounds(shapeProfile({ kind: 'sphere', params: { radius: 3 } }), worsted());
    expect(patternLines(rounds, 'UK')[0]!.text).toBe('6 dc in a magic ring');
  });
});
