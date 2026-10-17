import type { ProfilePoint } from './types';
import { shapeProfile, type ShapeSpec, type ShapeKind } from './shapes';
import type { Quat, Vec3 } from './project';

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
  if (d < 0) {
    // Nearly opposite vectors lose precision in the direct formula, so go via -a:
    // a half turn onto -a, then the short turn from -a to b.
    const axis = normalize(Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[2], 0, a[0]]);
    const half: Quat = [axis[0], axis[1], axis[2], 0];
    return mulQuat(shortTurn([-a[0], -a[1], -a[2]], b), half);
  }
  return shortTurn(a, b);
}

function shortTurn(a: Vec3, b: Vec3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const w = 1 + d;
  const l = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / l, c[1] / l, c[2] / l, w / l];
}

/** Hamilton product p·q (apply q, then p). */
export function mulQuat(p: Quat, q: Quat): Quat {
  const [px, py, pz, pw] = p, [qx, qy, qz, qw] = q;
  return [
    pw * qx + px * qw + py * qz - pz * qy,
    pw * qy - px * qz + py * qw + pz * qx,
    pw * qz + px * qy - py * qx + pz * qw,
    pw * qw - px * qx - py * qy - pz * qz,
  ];
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
 * Where a shape's crochet profile sits in the world: profile height z is at
 * `start + axis * z`. Cones and domes are worked from their tip or crown, so their
 * working axis points down the shape.
 */
export function workingFrame(spec: ShapeSpec & { transform: { position: Vec3; rotation: Quat } }): { start: Vec3; axis: Vec3 } {
  const zs = shapeProfile(spec).map((p) => p.z);
  const lo = Math.min(...zs), hi = Math.max(...zs);
  const up = normalize(rotate(spec.transform.rotation, [0, 1, 0]));
  const p = spec.transform.position;
  if (BASE_AT_END.has(spec.kind)) return { start: [p[0] + up[0] * hi, p[1] + up[1] * hi, p[2] + up[2] * hi], axis: [-up[0], -up[1], -up[2]] };
  return { start: [p[0] - up[0] * lo, p[1] - up[1] * lo, p[2] - up[2] * lo], axis: up };
}
