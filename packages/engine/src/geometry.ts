import type { ProfilePoint } from './types';
import { shapeProfile, type ShapeSpec, type ShapeKind } from './shapes';
import type { Quat, Transform, Vec3 } from './project';

/**
 * Display geometry for the editor. A shape's crochet profile runs in working order
 * (cones start at the tip, domes at the crown). For placing shapes we want the end
 * that sits against another shape at y = 0 with the shape growing along +Y.
 */
export interface DisplayPoint {
  r: number;
  y: number;
}

/** Kinds whose natural base is the last point of the crochet profile. */
const BASE_AT_END: ReadonlySet<ShapeKind> = new Set(['cone', 'dome']);

export function displayProfile(spec: ShapeSpec): DisplayPoint[] {
  const prof: ProfilePoint[] = shapeProfile(spec);
  const zs = prof.map((p) => p.z);
  const lo = Math.min(...zs), hi = Math.max(...zs);
  const flip = BASE_AT_END.has(spec.kind);
  // Lathe geometry wants points ordered bottom to top.
  const pts = prof.map((p) => ({ r: p.r, y: flip ? hi - p.z : p.z - lo }));
  return flip ? pts.reverse() : pts;
}

export function shapeHeight(spec: ShapeSpec): number {
  const ys = displayProfile(spec).map((p) => p.y);
  return Math.max(...ys);
}

export function shapeRadius(spec: ShapeSpec): number {
  return Math.max(...displayProfile(spec).map((p) => p.r));
}

// ---- small vector maths (kept here so the engine stays free of three.js) ----

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
export const normalize = (v: Vec3): Vec3 => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Unit quaternion turning unit vector a onto unit vector b. */
export function quatFromUnitVectors(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    // Opposite: half turn about any axis perpendicular to a.
    const axis = normalize(Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[2], 0, a[0]]);
    return [axis[0], axis[1], axis[2], 0];
  }
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const w = 1 + d;
  const l = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / l, c[1] / l, c[2] / l, w / l];
}

/** Rotate v by unit quaternion q. */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

/**
 * Snap to surface: put a shape's base on a point of another shape, pointing outward along
 * the surface normal, and sink it a little so it reads as sewn on rather than balanced.
 */
export function placeOnSurface(spec: ShapeSpec, point: Vec3, normal: Vec3, keepScale: Vec3 = [1, 1, 1]): Transform {
  const n = normalize(normal);
  const sink = Math.min(0.4, shapeHeight(spec) * 0.08);
  return {
    position: [point[0] - n[0] * sink, point[1] - n[1] * sink, point[2] - n[2] * sink],
    rotation: quatFromUnitVectors([0, 1, 0], n),
    scale: [...keepScale],
  };
}
