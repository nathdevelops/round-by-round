import type { ProfilePoint } from './types';
import { displayProfile, mulQuat, normalize, rotate } from './geometry';
import type { Quat, Shape, Transform, Vec3 } from './project';

/**
 * Fusing: several shapes become one crocheted shell that follows their outside.
 *
 * Each shape is a solid of revolution, so "inside" is cheap to test: in the shape's
 * own frame, a point is inside when its distance from the axis is less than the
 * profile radius at that height. The union of shapes is inside any of them.
 *
 * To crochet the union we pick one working axis, slice the shell across it, and
 * measure each slice's outline. A round's stitch count depends on how far it is
 * around, so the outline length becomes an equivalent radius (length / 2π), which
 * gives an ordinary profile that the stitch maths (stitches.ts) already handles.
 */

export type FieldShape = Pick<Shape, 'kind' | 'params' | 'transform'>;

interface Solid {
  pos: Vec3;
  inv: Quat;
  /** Rows of the inverse rotation matrix, for allocation-free evaluation. */
  m: number[];
  axis: Vec3;
  ys: number[];
  rs: number[];
  height: number;
  rMax: number;
}

const conj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function solidOf(s: FieldShape): Solid {
  const pts = displayProfile(s);
  const q = normalizeQuat(s.transform.rotation);
  const inv = conj(q);
  const ex = rotate(inv, [1, 0, 0]), ey = rotate(inv, [0, 1, 0]), ez = rotate(inv, [0, 0, 1]);
  return {
    pos: s.transform.position,
    inv,
    // local = M · (p - pos), with M's columns the world axes seen in the local frame
    m: [ex[0], ey[0], ez[0], ex[1], ey[1], ez[1], ex[2], ey[2], ez[2]],
    axis: normalize(rotate(q, [0, 1, 0])),
    ys: pts.map((p) => p.y),
    rs: pts.map((p) => p.r),
    height: Math.max(...pts.map((p) => p.y)),
    rMax: Math.max(...pts.map((p) => p.r)),
  };
}

function normalizeQuat(q: Quat): Quat {
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Profile radius at height y (profile heights never decrease; flat steps take the wider side). */
function radiusAt(s: Solid, y: number): number {
  const { ys, rs } = s;
  let lo = 0, hi = ys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ys[mid]! <= y) lo = mid; else hi = mid;
  }
  const y0 = ys[lo]!, y1 = ys[hi]!;
  if (y1 - y0 < 1e-9) return Math.max(rs[lo]!, rs[hi]!);
  const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  return rs[lo]! + (rs[hi]! - rs[lo]!) * t;
}

/** Below zero inside a shape, above zero outside. Roughly a distance in cm near the surface. */
function solidField(s: Solid, px: number, py: number, pz: number): number {
  const dx = px - s.pos[0], dy = py - s.pos[1], dz = pz - s.pos[2], m = s.m;
  const x = m[0]! * dx + m[1]! * dy + m[2]! * dz;
  const y = m[3]! * dx + m[4]! * dy + m[5]! * dz;
  const z = m[6]! * dx + m[7]! * dy + m[8]! * dz;
  if (y < -0.5 || y > s.height + 0.5) return Math.max(-y, y - s.height);
  const r = Math.sqrt(x * x + z * z);
  return Math.max(r - radiusAt(s, y), -y, y - s.height);
}

type XYZField = (x: number, y: number, z: number) => number;

function unionField(solids: Solid[]): XYZField {
  return (x, y, z) => {
    let f = Infinity;
    for (let i = 0; i < solids.length; i++) {
      const v = solidField(solids[i]!, x, y, z);
      if (v < f) f = v;
    }
    return f;
  };
}

/**
 * Express shapes in another shape's frame. A fused piece measured this way gives the
 * same shell and the same pattern wherever the piece is moved or turned to.
 */
export function inFrameOf<T extends FieldShape>(shapes: T[], frame: Transform): T[] {
  const inv = conj(normalizeQuat(frame.rotation));
  return shapes.map((s) => ({
    ...s,
    transform: {
      ...s.transform,
      position: rotate(inv, sub(s.transform.position, frame.position)),
      rotation: normalizeQuat(mulQuat(inv, s.transform.rotation)),
    },
  }));
}

/** The field of the fused shell: inside wherever any shape is. */
export function fusedField(shapes: FieldShape[]): (p: Vec3) => number {
  const f = unionField(shapes.map(solidOf));
  return (p) => f(p[0], p[1], p[2]);
}

/** Same field without allocating a point per call, for filling 3D grids. */
export function fusedFieldXYZ(shapes: FieldShape[]): XYZField {
  return unionField(shapes.map(solidOf));
}

/** A box that holds every shape, as centre and half-size (cm). */
export function fusedBounds(shapes: FieldShape[], pad = 0.3): { center: Vec3; half: Vec3 } {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of shapes.map(solidOf)) {
    const c = add(s.pos, scale(s.axis, s.height / 2));
    const r = Math.hypot(s.height / 2, s.rMax) + pad;
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, c[i]! - r); hi[i] = Math.max(hi[i]!, c[i]! + r); }
  }
  return { center: scale(add(lo, hi), 0.5), half: scale(sub(hi, lo), 0.5) };
}

/**
 * Working axis for a fused piece. When every shape shares one axis direction (a cap on
 * a stem), use it. Otherwise use the longest direction of the solid (principal axis).
 * Points up (or along +x / +z when level) so rounds are worked from the bottom.
 */
export function fusedAxis(shapes: FieldShape[]): Vec3 {
  const solids = shapes.map(solidOf);
  const a0 = solids[0]!.axis;
  let axis: Vec3;
  if (solids.every((s) => Math.abs(dot(s.axis, a0)) > 0.995)) {
    axis = a0;
  } else {
    // Principal axis of points sampled inside the union.
    const f = fusedField(shapes);
    const { center, half } = fusedBounds(shapes, 0);
    const n = 20, pts: Vec3[] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const p: Vec3 = [
        center[0] + half[0] * ((2 * i + 1) / n - 1),
        center[1] + half[1] * ((2 * j + 1) / n - 1),
        center[2] + half[2] * ((2 * k + 1) / n - 1),
      ];
      if (f(p) < 0) pts.push(p);
    }
    axis = pts.length > 3 ? principalAxis(pts) : a0;
  }
  const up = Math.abs(axis[1]) > 0.3 ? axis[1] : Math.abs(axis[0]) > 0.3 ? axis[0] : axis[2];
  return up < 0 ? scale(axis, -1) : axis;
}

function principalAxis(pts: Vec3[]): Vec3 {
  const m = scale(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
  const c = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of pts) {
    const d = sub(p, m);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i * 3 + j]! += d[i]! * d[j]!;
  }
  // Power iteration for the largest eigenvector.
  let v: Vec3 = normalize([1, 0.7, 0.3]);
  for (let it = 0; it < 60; it++) {
    v = normalize([
      c[0]! * v[0] + c[1]! * v[1] + c[2]! * v[2],
      c[3]! * v[0] + c[4]! * v[1] + c[5]! * v[2],
      c[6]! * v[0] + c[7]! * v[1] + c[8]! * v[2],
    ]);
  }
  return v;
}

export interface FusedProfile {
  /** Equivalent profile in working order: r from outline length, z along the axis from the start. */
  profile: ProfilePoint[];
  /** Working axis, pointing from the first round to the last. */
  axis: Vec3;
  /** Where round 1 sits. */
  start: Vec3;
  /** Heights (cm from the start) where a slice falls into more than one loop, merged into ranges. */
  splits: [number, number][];
  /** Per profile point: the middle of that slice's outline (same frame as the shapes). */
  centers: Vec3[];
  /** Per profile point, when measured with `cover`: the share of the outline inside the cover shapes (0 to 1). */
  covered?: number[];
}

/**
 * One slice: total outline length, how many separate loops it has, where the outline's
 * middle is (in the slice's u, v coordinates), and how much of it lies inside `cover`.
 */
function sliceOutline(
  f: XYZField, center: Vec3, u: Vec3, v: Vec3, extent: number, grid: number, cover?: XYZField,
): { length: number; loops: number; covered: number; mid: [number, number] } {
  const n = grid + 1, h = (2 * extent) / grid;
  const val = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    const b = -extent + j * h;
    const rx = center[0] + v[0] * b, ry = center[1] + v[1] * b, rz = center[2] + v[2] * b;
    for (let i = 0; i < n; i++) {
      const a = -extent + i * h;
      val[j * n + i] = f(rx + u[0] * a, ry + u[1] * a, rz + u[2] * a);
    }
  }
  // Marching squares: outline length with linear interpolation along cell edges.
  let length = 0, covered = 0, ma = 0, mb = 0;
  const cross = (a: number, b: number) => a / (a - b);
  const seg = (i: number, j: number, p: [number, number], q: [number, number]) => {
    const l = h * Math.hypot(p[0] - q[0], p[1] - q[1]);
    const a = -extent + (i + (p[0] + q[0]) / 2) * h, b = -extent + (j + (p[1] + q[1]) / 2) * h;
    length += l;
    ma += a * l;
    mb += b * l;
    if (cover && l > 0) {
      const x = center[0] + u[0] * a + v[0] * b, y = center[1] + u[1] * a + v[1] * b, z = center[2] + u[2] * a + v[2] * b;
      if (cover(x, y, z) < 0) covered += l;
    }
  };
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const v0 = val[j * n + i]!, v1 = val[j * n + i + 1]!, v2 = val[(j + 1) * n + i + 1]!, v3 = val[(j + 1) * n + i]!;
      const pts: [number, number][] = [];
      if ((v0 < 0) !== (v1 < 0)) pts.push([cross(v0, v1), 0]);
      if ((v1 < 0) !== (v2 < 0)) pts.push([1, cross(v1, v2)]);
      if ((v2 < 0) !== (v3 < 0)) pts.push([1 - cross(v2, v3), 1]);
      if ((v3 < 0) !== (v0 < 0)) pts.push([0, 1 - cross(v3, v0)]);
      if (pts.length === 2) seg(i, j, pts[0]!, pts[1]!);
      else if (pts.length === 4) {
        seg(i, j, pts[0]!, pts[1]!);
        seg(i, j, pts[2]!, pts[3]!);
      }
    }
  }
  // Separate loops: connected groups of inside samples.
  const seen = new Uint8Array(n * n);
  let loops = 0;
  const stack: number[] = [];
  for (let k = 0; k < n * n; k++) {
    if (seen[k] || !(val[k]! < 0)) continue;
    loops++;
    seen[k] = 1;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop()!, ci = c % n, cj = (c - ci) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (!seen[nk] && val[nk]! < 0) { seen[nk] = 1; stack.push(nk); }
      }
    }
  }
  return { length, loops, covered: length ? covered / length : 0, mid: length ? [ma / length, mb / length] : [0, 0] };
}

/**
 * Turn fused shapes into one crochet profile. `slices` sets how finely the shell is
 * cut along its axis, `grid` how finely each slice is traced.
 */
export function fusedProfile(
  shapes: FieldShape[], opts: { slices?: number; grid?: number; axis?: Vec3; cover?: FieldShape[] } = {},
): FusedProfile {
  if (!shapes.length) throw new Error('fusedProfile needs at least one shape');
  const slices = opts.slices ?? 120, grid = opts.grid ?? 96;
  const f = fusedFieldXYZ(shapes);
  const cover = opts.cover?.length ? fusedFieldXYZ(opts.cover) : undefined;
  const axis = opts.axis ? normalize(opts.axis) : fusedAxis(shapes);
  const helper: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, helper)), v = cross(axis, u);

  // Range along the axis and how wide a slice can be, from each shape's bounding sphere.
  const { center } = fusedBounds(shapes, 0);
  let tMin = Infinity, tMax = -Infinity, extent = 0;
  for (const s of shapes.map(solidOf)) {
    const c = add(s.pos, scale(s.axis, s.height / 2));
    const r = Math.hypot(s.height / 2, s.rMax);
    const t = dot(sub(c, center), axis);
    tMin = Math.min(tMin, t - r);
    tMax = Math.max(tMax, t + r);
    const off = sub(sub(c, center), scale(axis, t));
    extent = Math.max(extent, Math.hypot(...off) + r);
  }
  extent *= 1.04;

  const step = (tMax - tMin) / slices;
  const samples: { t: number; length: number; loops: number; covered: number; mid: [number, number] }[] = [];
  for (let k = 0; k <= slices; k++) {
    const t = tMin + k * step;
    samples.push({ t, ...sliceOutline(f, add(center, scale(axis, t)), u, v, extent, grid, cover) });
  }
  const at = (k: number): Vec3 => {
    const s = samples[k]!;
    return add(add(center, scale(axis, s.t)), add(scale(u, s.mid[0]), scale(v, s.mid[1])));
  };
  const first = samples.findIndex((s) => s.length > 0);
  let last = -1;
  for (let k = samples.length - 1; k >= 0; k--) if (samples[k]!.length > 0) { last = k; break; }
  if (first < 0) return { profile: [{ r: 0, z: 0 }], axis, start: center, splits: [], centers: [center] };

  const t0 = samples[first]!.t - step / 2, t1 = samples[last]!.t + step / 2;
  const profile: ProfilePoint[] = [{ r: 0, z: 0 }];
  const centers: Vec3[] = [add(at(first), scale(axis, -step / 2))];
  const covered: number[] = [samples[first]!.covered];
  const splits: [number, number][] = [];
  for (let k = first; k <= last; k++) {
    const s = samples[k]!;
    const z = s.t - t0;
    profile.push({ r: s.length / (2 * Math.PI), z });
    centers.push(at(k));
    covered.push(s.covered);
    if (s.loops > 1) {
      const prev = splits[splits.length - 1];
      if (prev && z - prev[1] <= step * 1.5) prev[1] = z;
      else splits.push([z, z]);
    }
  }
  profile.push({ r: 0, z: t1 - t0 });
  centers.push(add(at(last), scale(axis, step / 2)));
  covered.push(samples[last]!.covered);
  return { profile, axis, start: add(center, scale(axis, t0)), splits, centers, ...(cover ? { covered } : {}) };
}
