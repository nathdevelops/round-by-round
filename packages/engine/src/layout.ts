import type { Measured } from './assembly';
import { normalize } from './geometry';
import type { Vec3 } from './project';
import type { Round } from './types';

/**
 * Where each stitch sits on the model, for the stitch preview. Each round is a ring at
 * its height along the piece, with its stitches spaced evenly around it and every other
 * round shifted half a stitch, the way crocheted rounds stack.
 */

export type BallKind = 'start' | 'sc' | 'inc' | 'dec';

export interface RoundLayout {
  n: number;
  /** One point per stitch, in working order, starting at the back of the piece. */
  points: Vec3[];
  kinds: BallKind[];
  /** How round the ring is, for drawing the stitches. */
  radius: number;
  center: Vec3;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Middle of the piece's outline at height z along its working axis. */
export function centerAt(m: Measured, z: number): Vec3 {
  const c = m.centers;
  if (!c || c.length !== m.profile.length) return add(m.start, scale(m.axis, z));
  const pr = m.profile;
  if (z <= pr[0]!.z) return c[0]!;
  for (let i = 1; i < pr.length; i++) {
    if (pr[i]!.z >= z) {
      const dz = pr[i]!.z - pr[i - 1]!.z;
      const t = dz > 1e-9 ? (z - pr[i - 1]!.z) / dz : 1;
      return add(c[i - 1]!, scale(sub(c[i]!, c[i - 1]!), t));
    }
  }
  return c[c.length - 1]!;
}

/** Lay out every round's stitches on the model. */
export function layoutStitches(m: Measured, rounds: Round[]): RoundLayout[] {
  // Rounds start at the back (away from the viewer) and go round the same way on every piece.
  const z: Vec3 = [0, 0, 1];
  let back = sub(scale(z, -1), scale(m.axis, -dot(z, m.axis)));
  if (Math.hypot(...back) < 0.3) back = sub([0, -1, 0], scale(m.axis, -m.axis[1]));
  const u = normalize(back), v = normalize(cross(m.axis, u));
  return rounds.map((r) => {
    const center = centerAt(m, r.z);
    const radius = Math.max(r.rTarget, 0.05);
    const shift = r.n % 2 ? 0 : 0.5;
    const points: Vec3[] = [];
    for (let i = 0; i < r.count; i++) {
      const a = ((i + shift) / r.count) * 2 * Math.PI;
      points.push(add(center, add(scale(u, radius * Math.cos(a)), scale(v, radius * Math.sin(a)))));
    }
    const kinds: BallKind[] = r.n === 1 ? points.map(() => 'start') : r.kinds.map((k) => k);
    return { n: r.n, points, kinds, radius, center };
  });
}
