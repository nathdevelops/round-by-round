import { fusedFieldXYZ, fusedProfile, inFrameOf, type FieldShape } from './fuse';
import { YARN_PRESETS } from './gauge-presets';
import { normalize, rotate, workingFrame } from './geometry';
import { patternLines } from './pattern';
import { pointAt, withArcLength } from './profile';
import { partnerOf, type Project, type Shape, type Transform, type Vec3 } from './project';
import { eyesOf, hostOf, itemOf, listItems, sewnOnto, type Item } from './sew';
import { shapeProfile } from './shapes';
import { computeRounds } from './stitches';
import type { PatternLine, PieceRounds, ProfilePoint, Round } from './types';
import { layoutStitches, type RoundLayout } from './layout';

/**
 * Turning the scene into pieces to crochet and the instructions that put them together.
 *
 * A sewn piece is trimmed where it sinks into its host: walking along the piece from
 * its free end, the cut falls where half of the round lies inside the host. The cut
 * leaves an open edge, which is the last round and the line you sew along. Where that
 * edge lands on the host, measured in the host's own rounds and stitches, gives the
 * assembly instruction.
 */

type XYZField = (x: number, y: number, z: number) => number;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

/** Two unit vectors across an axis. */
function basis(axis: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(axis, helper));
  return [u, cross(axis, u)];
}

const RING = 32;

/** Points around a round: centre, radius and the direction it faces. */
export function ringPoints(center: Vec3, normal: Vec3, radius: number, n = RING): Vec3[] {
  const [u, v] = basis(normal);
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return add(center, add(scale(u, radius * Math.cos(a)), scale(v, radius * Math.sin(a))));
  });
}

/** Share of a round inside the host, and how close the round comes to it (field value, cm). */
function ringStats(center: Vec3, normal: Vec3, radius: number, host: XYZField): { cov: number; near: number } {
  if (radius < 1e-3) {
    const f = host(...center);
    return { cov: f < 0 ? 1 : 0, near: f };
  }
  let inside = 0, near = Infinity;
  for (const p of ringPoints(center, normal, radius, 24)) {
    const f = host(...p);
    if (f < 0) inside++;
    near = Math.min(near, f);
  }
  return { cov: inside / 24, near };
}

export interface SeamRing {
  center: Vec3;
  /** Direction the open edge faces (out of the piece, into the host). */
  normal: Vec3;
  radius: number;
}

export interface Measured {
  /** Profile in working order: r from the axis, z along it from round 1. */
  profile: ProfilePoint[];
  /** World position of round 1 and the direction rounds are worked. */
  start: Vec3;
  axis: Vec3;
  /** Heights where a fused piece falls into separate tubes. */
  splits: [number, number][];
  /** Where a sewn piece meets its host. */
  seam?: SeamRing;
  /** True when the piece was trimmed and ends in an open edge. */
  trimmed: boolean;
  /**
   * Middle of each round's outline, one per profile point (fused pieces, whose slices
   * needn't sit on the axis). Shapes are round, so theirs is on the axis.
   */
  centers?: Vec3[];
  /** Plain-words problems with how the piece meets its host. */
  issues: string[];
}

interface Track {
  pts: ProfilePoint[];
  cov: number[];
  near: number[];
  centers: Vec3[];
}

/**
 * Trim a piece where it sinks into its host. `track` samples the piece in working order;
 * `whole` is the untrimmed profile, used when nothing needs cutting.
 */
function trim(track: Track, whole: ProfilePoint[], start: Vec3, axis: Vec3, hostName: string): Omit<Measured, 'splits'> {
  const n = track.pts.length;
  const H = Math.max(...track.pts.map((p) => p.z));
  const issues: string[] = [];
  let { pts, cov, near, centers } = track;
  let prof = whole;
  const flip = () => {
    pts = pts.map((p) => ({ r: p.r, z: H - p.z })).reverse();
    cov = [...cov].reverse();
    near = [...near].reverse();
    centers = [...centers].reverse();
    const wh = Math.max(...prof.map((p) => p.z));
    prof = prof.map((p) => ({ r: p.r, z: wh - p.z })).reverse();
    start = add(start, scale(axis, H));
    axis = scale(axis, -1);
  };
  const ring = (i: number): SeamRing => ({ center: centers[i]!, normal: axis, radius: pts[i]!.r });
  const covered = cov.map((c) => c >= 0.5);

  if (!covered.some(Boolean)) {
    // Not sunk in: keep the piece whole and sew it on where it comes closest.
    let k = 0;
    near.forEach((v, i) => { if (v < near[k]!) k = i; });
    if (near[k]! > 0.25) issues.push(`doesn’t touch ${hostName}. Move it so it sinks in a little.`);
    if (k < n / 2) { flip(); k = n - 1 - k; }
    return { profile: prof, start, axis, seam: ring(k), trimmed: false, issues, centers };
  }
  if (covered.every(Boolean)) {
    issues.push(`is hidden inside ${hostName}.`);
    return { profile: prof, start, axis, trimmed: false, issues, centers };
  }
  if (covered[0] && covered[n - 1]) {
    issues.push(`sinks into ${hostName} at both ends, so it can’t be sewn on by one edge.`);
    return { profile: prof, start, axis, trimmed: false, issues, centers };
  }
  if (covered[0]) flip();
  let i = cov.findIndex((c) => c >= 0.5);
  let j = n - 1;
  while (cov[j]! < 0.5) j--;
  if (j < n - 1) {
    // It goes right through the host: make the longer side.
    issues.push(`goes through ${hostName}; only the longer side is made.`);
    if (H - pts[j]!.z > pts[i]!.z) {
      flip();
      i = cov.findIndex((c) => c >= 0.5);
    }
  }
  const a = cov[i - 1]!, b = cov[i]!;
  const t = b - a > 1e-9 ? (0.5 - a) / (b - a) : 1;
  const cut = { r: pts[i - 1]!.r + (pts[i]!.r - pts[i - 1]!.r) * t, z: pts[i - 1]!.z + (pts[i]!.z - pts[i - 1]!.z) * t };
  const profile = [...pts.slice(0, i), cut];
  if (cut.z < 0.6) issues.push(`barely sticks out of ${hostName}.`);
  const cutCenter = lerp(centers[i - 1]!, centers[i]!, t);
  return { profile, start, axis, seam: { center: cutCenter, normal: axis, radius: cut.r }, trimmed: true, issues, centers: [...centers.slice(0, i), cutCenter] };
}

/** A loose shape, trimmed against its host when it has one. */
function measureShape(s: Shape, host?: { field: XYZField; name: string }): Measured {
  const whole = shapeProfile(s);
  const { start, axis } = workingFrame(s);
  if (!host) return { profile: whole, start, axis, splits: [], trimmed: false, issues: [] };
  const curve = withArcLength(whole);
  const L = curve[curve.length - 1]!.s, M = 160;
  const track: Track = { pts: [], cov: [], near: [], centers: [] };
  for (let k = 0; k <= M; k++) {
    const q = pointAt(curve, (L * k) / M);
    const c = add(start, scale(axis, q.z));
    const st = ringStats(c, axis, q.r, host.field);
    track.pts.push({ r: q.r, z: q.z });
    track.cov.push(st.cov);
    track.near.push(st.near);
    track.centers.push(c);
  }
  // A shape's rounds are centred on its axis; the sampled centres don't match the whole profile.
  const { centers: _c, ...t } = trim(track, whole, start, axis, host.name);
  return { ...t, splits: [] };
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const geomKey = (shapes: FieldShape[]) => shapes.map((s) => [s.kind, s.params, s.transform.position.map(r4), s.transform.rotation.map(r4)]);

/**
 * Slicing a fused shell takes a moment, and moving or turning the piece (with its host,
 * if sewn) doesn't change the result, so results are kept by the layout in the piece's own frame.
 */
const fusedCache = new Map<string, Omit<Measured, 'start' | 'axis' | 'seam'> & { start: Vec3; axis: Vec3; seam?: SeamRing }>();

function measureFused(shapes: Shape[], host?: { shapes: Shape[]; name: string }): Measured {
  const frame: Transform = shapes[0]!.transform;
  const local = inFrameOf(shapes, frame);
  const cover = host ? inFrameOf(host.shapes, frame) : undefined;
  const key = JSON.stringify([geomKey(local), cover ? geomKey(cover) : null, host?.name ?? '']);
  let hit = fusedCache.get(key);
  if (!hit) {
    const f = fusedProfile(local, cover ? { cover } : {});
    if (!cover || !host) {
      hit = { profile: f.profile, start: f.start, axis: f.axis, splits: f.splits, trimmed: false, issues: [], centers: f.centers };
    } else {
      const field = fusedFieldXYZ(cover);
      const near = f.profile.map((p, i) => ringStats(f.centers[i]!, f.axis, p.r, field).near);
      const t = trim({ pts: f.profile, cov: f.covered!, near, centers: f.centers }, f.profile, f.start, f.axis, host.name);
      // Splits are heights from the start; a flipped piece counts them from the other end.
      const L = Math.max(...f.profile.map((p) => p.z));
      const flipped = dot(t.axis, f.axis) < 0;
      const splits = f.splits.map(([a, b]) => (flipped ? [L - b, L - a] : [a, b]) as [number, number]);
      hit = { ...t, splits };
    }
    fusedCache.set(key, hit);
    if (fusedCache.size > 60) fusedCache.delete(fusedCache.keys().next().value!);
  }
  const q = frame.rotation, o = frame.position;
  const toWorld = (p: Vec3) => add(rotate(q, p), o);
  return {
    ...hit,
    start: toWorld(hit.start),
    axis: normalize(rotate(q, hit.axis)),
    ...(hit.centers ? { centers: hit.centers.map(toWorld) } : {}),
    ...(hit.seam ? { seam: { ...hit.seam, center: toWorld(hit.seam.center), normal: normalize(rotate(q, hit.seam.normal)) } } : {}),
  };
}

/** Measure one piece: its profile in working order, where it sits, and where it is sewn. */
export function measureItem(p: Project, id: string): Measured {
  const it = itemOf(p, id);
  if (!it) throw new Error(`No piece ${id}`);
  const hostId = hostOf(p, id);
  const host = hostId ? itemOf(p, hostId) : undefined;
  if (it.kind === 'shape') return measureShape(it.shape, host ? { field: fusedFieldXYZ(host.shapes), name: host.name } : undefined);
  return measureFused(it.shapes, host ? { shapes: host.shapes, name: host.name } : undefined);
}

// ---- The plan: every piece's pattern and how they go together ----

export interface EyesPlan {
  round: number;
  apart: number;
  sizeMm: number;
  /** Where each eye sits on the model, and the way it faces. */
  points: { position: Vec3; normal: Vec3 }[];
  text: string;
}

export interface SeamPlan {
  childId: string;
  hostId: string;
  /** The open edge on the model, for drawing the seam line. */
  ring: Vec3[];
  /** Host rounds the seam crosses. */
  from: number;
  to: number;
  text: string;
}

export interface PiecePlan {
  item: Item;
  id: string;
  name: string;
  color: string;
  /** 2 for a mirrored pair: one pattern, made twice. */
  make: 1 | 2;
  rounds: PieceRounds;
  lines: PatternLine[];
  /** Rounds that fall into separate tubes (fused pieces). */
  splitRounds: number[];
  start: Vec3;
  axis: Vec3;
  hostId?: string;
  seam?: SeamPlan;
  eyes?: EyesPlan;
  /** What to do after the last round. */
  finish: string[];
  issues: string[];
}

export interface ProjectPlan {
  /** Pieces in making order: each host before what is sewn onto it. */
  pieces: PiecePlan[];
  /** Every seam, including the mirrored copies of pairs (for drawing). */
  seams: SeamPlan[];
  /** Every pair of eyes (for drawing). */
  eyes: { itemId: string; points: EyesPlan['points'] }[];
  /** Assembly steps, in order. */
  assembly: string[];
  /** Every piece's stitches on the model, mirrored copies included (for the stitch preview). */
  stitches: PieceStitches[];
}

export interface PieceStitches {
  itemId: string;
  /** The piece whose pattern these stitches follow (a mirrored copy follows its partner). */
  patternId: string;
  color: string;
  hostId?: string;
  /** Direction that pulls the piece off its host, for the explode slider. */
  away?: Vec3;
  rounds: RoundLayout[];
}

/** Front of the toy: towards the viewer (+z), across the given axis. Falls back to the top. */
function frontAcross(axis: Vec3): { front: Vec3; name: string } {
  const z: Vec3 = [0, 0, 1];
  const f = sub(z, scale(axis, dot(z, axis)));
  if (Math.hypot(...f) > 0.3) return { front: normalize(f), name: 'centre front' };
  const y: Vec3 = [0, 1, 0];
  return { front: normalize(sub(y, scale(axis, dot(y, axis)))), name: 'centre top' };
}

/** The round of `rounds` nearest a point, judged by height along the axis and distance from it. */
function nearestRound(rounds: Round[], m: { start: Vec3; axis: Vec3 }, pt: Vec3): Round {
  const d = sub(pt, m.start);
  const z = dot(d, m.axis);
  const rho = Math.hypot(...sub(d, scale(m.axis, z)));
  let best = rounds[0]!, bd = Infinity;
  for (const r of rounds) {
    const e = (r.z - z) ** 2 + (r.rTarget - rho) ** 2;
    if (e < bd) { bd = e; best = r; }
  }
  return best;
}

const span = (a: number, b: number) => (a === b ? `along Rnd ${a}` : `over Rnds ${a}–${b}`);

/** Where a seam lands on its host, in the host's rounds and stitches. */
function placeSeam(
  ring: SeamRing, host: { measured: Measured; rounds: Round[]; name: string },
): { from: number; to: number; where: string; offset: number | null; side: 'left' | 'right' | null; frontName: string } {
  const m = host.measured;
  const pts = ring.radius > 1e-3 ? ringPoints(ring.center, ring.normal, ring.radius) : [ring.center];
  const ns = pts.map((pt) => nearestRound(host.rounds, m, pt).n);
  const from = Math.min(...ns), to = Math.max(...ns);
  const d = sub(ring.center, m.start);
  const z = dot(d, m.axis);
  const radial = sub(d, scale(m.axis, z));
  const off = Math.hypot(...radial);
  const { front, name } = frontAcross(m.axis);
  if (off < Math.max(0.35, ring.radius * 0.5)) {
    const length = Math.max(...m.profile.map((p) => p.z));
    return { from, to, where: `centred on the ${z < length / 2 ? 'magic ring' : 'closing'}`, offset: null, side: null, frontName: name };
  }
  const dir = normalize(radial);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(front, dir))));
  const count = nearestRound(host.rounds, m, ring.center).count;
  const sts = Math.round((angle / (2 * Math.PI)) * count);
  const side = dot(dir, [1, 0, 0]) >= 0 ? 'right' : 'left';
  if (sts === 0) return { from, to, where: `at ${name}`, offset: 0, side: null, frontName: name };
  if (sts >= Math.round(count / 2)) return { from, to, where: `at ${name.replace('front', 'back').replace('top', 'bottom')}`, offset: sts, side: null, frontName: name };
  return { from, to, where: `${sts} sts to the ${side} of ${name} (as you face it)`, offset: sts, side, frontName: name };
}

/** Every piece's pattern, in making order, with the steps that sew them together. */
export function planProject(p: Project): ProjectPlan {
  const yarn = YARN_PRESETS.find((y) => y.id === p.settings.yarnId) ?? YARN_PRESETS[3]!;
  const settings = { gauge: yarn.gauge, stretch: p.settings.stretch, rounding: p.settings.rounding };

  const measured = new Map<string, Measured>();
  const roundsOf = new Map<string, PieceRounds>();
  const get = (id: string) => {
    if (!measured.has(id)) {
      const m = measureItem(p, id);
      measured.set(id, m);
      roundsOf.set(id, computeRounds(m.profile, settings));
    }
    return { m: measured.get(id)!, rounds: roundsOf.get(id)! };
  };

  const items = listItems(p);
  const isCopy = (it: Item) => it.kind === 'shape' && !!it.shape.mirrorOf && items.some((o) => o.id === it.shape.mirrorOf);

  const seamFor = (id: string): SeamPlan | undefined => {
    const hostId = hostOf(p, id);
    const it = itemOf(p, id)!;
    const { m } = get(id);
    if (!hostId || !m.seam) return undefined;
    const host = get(hostId);
    const hostName = itemOf(p, hostId)!.name;
    const at = placeSeam(m.seam, { measured: host.m, rounds: host.rounds.rounds, name: hostName });
    const ring = m.seam.radius > 1e-3 ? ringPoints(m.seam.center, m.seam.normal, m.seam.radius, 48) : [m.seam.center];
    return { childId: id, hostId, ring, from: at.from, to: at.to, text: `Sew ${it.name} to ${hostName} ${span(at.from, at.to)}, ${at.where}.` };
  };

  const eyesFor = (id: string): EyesPlan | undefined => {
    const e = eyesOf(p, id);
    if (!e) return undefined;
    const { m, rounds } = get(id);
    const rs = rounds.rounds;
    const n = Math.max(1, Math.min(rs.length - 1, e.round));
    const a = rs[n - 1]!, b = rs[Math.min(rs.length - 1, n)]!;
    const z = (a.z + b.z) / 2, r = (a.rTarget + b.rTarget) / 2;
    const { front } = frontAcross(m.axis);
    const side = normalize(cross(m.axis, front));
    const half = (Math.PI * (e.apart + 1)) / a.count;
    const c = add(m.start, scale(m.axis, z));
    const points = [-half, half].map((phi) => {
      const normal = normalize(add(scale(front, Math.cos(phi)), scale(side, Math.sin(phi))));
      return { position: add(c, scale(normal, r)), normal };
    });
    return {
      round: n, apart: e.apart, sizeMm: e.sizeMm, points,
      text: `Insert ${e.sizeMm} mm safety eyes between Rnds ${n} and ${n + 1}, ${e.apart} sts apart, centred on the front.`,
    };
  };

  const plans = new Map<string, PiecePlan>();
  const stitches: PieceStitches[] = [];
  const seams: SeamPlan[] = [];
  const eyes: ProjectPlan['eyes'] = [];
  for (const it of items) {
    const seam = seamFor(it.id);
    if (seam) seams.push(seam);
    const ey = eyesFor(it.id);
    if (ey) eyes.push({ itemId: it.id, points: ey.points });
    {
      const { m, rounds } = get(it.id);
      const h = hostOf(p, it.id);
      stitches.push({
        itemId: it.id, patternId: isCopy(it) && it.kind === 'shape' ? it.shape.mirrorOf! : it.id, color: it.color,
        ...(h ? { hostId: h } : {}), ...(h && m.seam ? { away: scale(m.seam.normal, -1) } : {}),
        rounds: layoutStitches(m, rounds.rounds),
      });
    }
    if (isCopy(it)) continue;
    const { m, rounds } = get(it.id);
    const hostId = hostOf(p, it.id);
    const make: 1 | 2 = it.kind === 'shape' && partnerOf(p, it.id) && items.some((o) => o.id === partnerOf(p, it.id)!.id) ? 2 : 1;
    const splitRounds = rounds.rounds.filter((r) => m.splits.some(([a, b]) => r.z >= a - 0.2 && r.z <= b + 0.2)).map((r) => r.n);
    const most = Math.max(...rounds.rounds.map((r) => r.count));
    const finish: string[] = [];
    if (ey) finish.push(ey.text);
    if (rounds.closedEnd) finish.push('Stuff firmly, then fasten off and close the last 6 sts.');
    else if (most <= 12 && rounds.rounds.length <= 5) finish.push('Fasten off, leaving a long tail for sewing. No stuffing needed.');
    else if (most <= 12) finish.push('Fasten off, leaving a long tail for sewing. Stuff lightly before sewing on.');
    else finish.push('Fasten off, leaving a long tail for sewing. Stuff it as you sew it on.');
    plans.set(it.id, {
      item: it, id: it.id, name: it.name, color: it.color, make, rounds,
      lines: patternLines(rounds.rounds, p.settings.terms), splitRounds,
      start: m.start, axis: m.axis, ...(hostId ? { hostId } : {}), ...(seam ? { seam } : {}), ...(ey ? { eyes: ey } : {}),
      finish, issues: m.issues.map((s) => `${it.name} ${s}`),
    });
  }

  // Making order: each unsewn piece, then what is sewn onto it, depth first.
  const order: PiecePlan[] = [];
  const visit = (id: string) => {
    const pl = plans.get(id);
    if (pl && !order.includes(pl)) order.push(pl);
    for (const c of sewnOnto(p, id)) visit(c);
  };
  for (const it of items) if (!hostOf(p, it.id)) visit(it.id);
  for (const pl of plans.values()) if (!order.includes(pl)) order.push(pl);

  const assembly: string[] = [];
  for (const pl of order) {
    if (!pl.seam) continue;
    if (pl.make === 2) {
      const partner = partnerOf(p, pl.id)!;
      const other = seams.find((s) => s.childId === partner.id);
      if (other && other.hostId === pl.seam.hostId) {
        const host = get(pl.seam.hostId);
        const at = placeSeam(get(pl.id).m.seam!, { measured: host.m, rounds: host.rounds.rounds, name: '' });
        const hostName = itemOf(p, pl.seam.hostId)!.name;
        const where = at.offset ? `one on each side, ${at.offset} sts from ${at.frontName}` : at.where;
        assembly.push(`Sew both ${pl.name} pieces to ${hostName} ${span(Math.min(at.from, other.from), Math.max(at.to, other.to))}, ${where}.`);
        continue;
      }
      assembly.push(pl.seam.text);
      if (other) assembly.push(other.text);
      continue;
    }
    assembly.push(pl.seam.text);
  }
  return { pieces: order, seams, eyes, assembly, stitches };
}

/** The whole pattern as plain text: every piece in making order, then assembly. */
export function planText(p: Project, plan: ProjectPlan = planProject(p)): string {
  const yarn = YARN_PRESETS.find((y) => y.id === p.settings.yarnId) ?? YARN_PRESETS[3]!;
  const out = [p.name, `${yarn.label} yarn, ${yarn.defaultHookMm} mm hook, ${p.settings.terms} terms`];
  for (const pc of plan.pieces) {
    out.push('', `${pc.name.toUpperCase()}${pc.make > 1 ? ' (make 2)' : ''}`);
    out.push(...pc.lines.map((l) => `${l.label}: ${l.text} (${l.count})`));
    out.push(...pc.finish);
  }
  if (plan.assembly.length) out.push('', 'ASSEMBLY', ...plan.assembly.map((a, i) => `${i + 1}. ${a}`));
  return out.join('\n') + '\n';
}
