import { describe, expect, it } from 'vitest';
import { bearStarter, emptyProject, fuseShapes, makeShape, planProject, type Vec3 } from '../src';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('stitch layout', () => {
  it('puts one ball per stitch on a ring of the round’s size', () => {
    const ball = makeShape('sphere', 'ball', { params: { radius: 3 } });
    const plan = planProject({ ...emptyProject(), shapes: [ball] });
    const piece = plan.pieces[0]!, st = plan.stitches[0]!;
    expect(st.rounds.map((r) => r.points.length)).toEqual(piece.rounds.rounds.map((r) => r.count));
    const r10 = piece.rounds.rounds[9]!, ring = st.rounds[9]!;
    for (const p of ring.points) {
      const d = sub(p, piece.start);
      const z = dot(d, piece.axis);
      expect(z).toBeCloseTo(r10.z, 6);
      expect(Math.hypot(...sub(d, piece.axis.map((a) => a * z) as Vec3))).toBeCloseTo(r10.rTarget, 6);
    }
    expect(st.rounds[0]!.kinds.every((k) => k === 'start')).toBe(true);
    expect(st.rounds[1]!.kinds.filter((k) => k === 'inc')).toHaveLength(12);
  });

  it('draws mirrored copies with their partner’s pattern and pulls sewn pieces off their host', () => {
    const plan = planProject(bearStarter());
    const ear = plan.stitches.find((s) => s.itemId === 'ear-r')!;
    expect(ear.patternId).toBe('ear');
    expect(ear.hostId).toBe('head');
    expect(ear.away![1]).toBeGreaterThan(0); // ears come off the top of the head
    expect(plan.stitches.find((s) => s.itemId === 'body')!.away).toBeUndefined();
    const total = plan.stitches.reduce((a, s) => a + s.rounds.reduce((b, r) => b + r.points.length, 0), 0);
    expect(total).toBeGreaterThan(1500);
  });

  it('follows a fused shell off its axis', () => {
    const a = makeShape('sphere', 'a', { params: { radius: 2 } });
    const b = makeShape('sphere', 'b', { params: { radius: 2 }, transform: { position: [0, 3, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } });
    const { project } = fuseShapes({ ...emptyProject(), shapes: [a, b] }, ['a', 'b'], 'piece-1');
    const st = planProject(project).stitches[0]!;
    // Every round's ring is centred on the shared axis (x = z = 0).
    for (const r of st.rounds) {
      expect(Math.abs(r.center[0])).toBeLessThan(0.1);
      expect(Math.abs(r.center[2])).toBeLessThan(0.1);
    }
  });
});
