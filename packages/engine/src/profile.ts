import type { ProfilePoint } from './types';

export interface ArcPoint extends ProfilePoint {
  /** Cumulative distance along the profile from its first point. */
  s: number;
}

/** Catmull-Rom through control points, sampled densely. r is clamped to >= 0. */
export function smoothProfile(pts: ProfilePoint[], perSegment = 20): ProfilePoint[] {
  if (pts.length < 2) return pts.map((p) => ({ ...p }));
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  const out: ProfilePoint[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ r: Math.max(0, f(p0.r, p1.r, p2.r, p3.r)), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...pts[pts.length - 1]! });
  return out;
}

export function withArcLength(curve: ProfilePoint[]): ArcPoint[] {
  let s = 0;
  return curve.map((p, i) => {
    if (i > 0) {
      const q = curve[i - 1]!;
      s += Math.hypot(p.r - q.r, p.z - q.z);
    }
    return { ...p, s };
  });
}

/** Point at distance s along an arc-length-parameterised curve (linear between samples). */
export function pointAt(curve: ArcPoint[], s: number): ArcPoint {
  if (s <= 0) return curve[0]!;
  for (let i = 1; i < curve.length; i++) {
    const b = curve[i]!;
    if (b.s >= s) {
      const a = curve[i - 1]!;
      const t = (s - a.s) / (b.s - a.s || 1);
      return { r: a.r + (b.r - a.r) * t, z: a.z + (b.z - a.z) * t, s };
    }
  }
  return curve[curve.length - 1]!;
}

export function scaleProfile(pts: ProfilePoint[], k: number): ProfilePoint[] {
  return pts.map((p) => ({ r: p.r * k, z: p.z * k }));
}
