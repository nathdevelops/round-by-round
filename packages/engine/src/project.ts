import type { RoundingMode, Terms } from './types';
import { SHAPE_DEFAULTS, type ShapeKind } from './shapes';
import { shapeHeight, shapeRadius } from './geometry';

/**
 * The project file: what the editor saves and reopens. Plain JSON, versioned.
 * Lengths are cm. Rotations are unit quaternions [x, y, z, w].
 * Each shape's own axis is local +Y with its base at y = 0 (see geometry.ts).
 */
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export interface Shape {
  id: string;
  name: string;
  kind: ShapeKind;
  params: Record<string, number>;
  transform: Transform;
  /** Yarn colour, CSS hex. */
  color: string;
  /** Linked mirror copy of this shape id: edits to either apply to both. */
  mirrorOf?: string;
  /** Shape this one was snapped onto. */
  hostId?: string;
}

export type JoinMode = 'sew' | 'fuse';

/**
 * How two pieces meet. A sew join reads "a is sewn onto b": a is crocheted on its own,
 * trimmed where it sinks into b, and finished with an open edge to sew on. Either end can
 * be a loose shape or a fused piece.
 */
export interface Join {
  a: string;
  b: string;
  mode: JoinMode;
  blend?: number;
}

/**
 * A pair of safety eyes, placed the way a pattern says it: on a piece, between round
 * `round` and the next, with `apart` stitches between them, centred on the front.
 */
export interface Marker {
  id: string;
  kind: 'eyes';
  itemId: string;
  round: number;
  apart: number;
  sizeMm: number;
}

/**
 * Shapes fused into one piece: crocheted as a single shell that follows the outside
 * of all of them. The piece moves as one; its parts can still be adjusted one at a time.
 */
export interface FusedPiece {
  id: string;
  name: string;
  shapeIds: string[];
  /** Yarn colour of the whole piece, CSS hex. */
  color: string;
}

export interface ProjectSettings {
  yarnId: string;
  stretch: number;
  rounding: RoundingMode;
  terms: Terms;
}

export interface Project {
  version: 1;
  name: string;
  shapes: Shape[];
  joins: Join[];
  fused: FusedPiece[];
  markers: Marker[];
  settings: ProjectSettings;
}

export const SHAPE_KINDS = Object.keys(SHAPE_DEFAULTS) as ShapeKind[];

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  sphere: 'Sphere', ellipsoid: 'Ellipsoid', egg: 'Egg', capsule: 'Capsule',
  cylinder: 'Cylinder', cone: 'Cone', teardrop: 'Teardrop', dome: 'Dome',
};

/** Yarn colours offered in the inspector, named like skeins. */
export const YARN_COLORS: { name: string; hex: string }[] = [
  { name: 'Rust', hex: '#a4492b' },
  { name: 'Cream', hex: '#efe6d4' },
  { name: 'Oatmeal', hex: '#d8c9ae' },
  { name: 'Camel', hex: '#b88a52' },
  { name: 'Moss', hex: '#687240' },
  { name: 'Slate', hex: '#4a6070' },
  { name: 'Coral', hex: '#ec7558' },
  { name: 'Sea glass', hex: '#5fb3a5' },
  { name: 'Charcoal', hex: '#3b3633' },
];

export const DEFAULT_SETTINGS: ProjectSettings = { yarnId: 'worsted', stretch: 0.1, rounding: 'classic6', terms: 'US' };

export const IDENTITY: Transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };

export function makeShape(kind: ShapeKind, id: string, over: Partial<Omit<Shape, 'id' | 'kind'>> = {}): Shape {
  return {
    id, kind,
    name: over.name ?? SHAPE_NAMES[kind],
    params: { ...SHAPE_DEFAULTS[kind], ...over.params },
    transform: cloneTransform(over.transform ?? IDENTITY),
    color: over.color ?? YARN_COLORS[0]!.hex,
    ...(over.mirrorOf ? { mirrorOf: over.mirrorOf } : {}),
    ...(over.hostId ? { hostId: over.hostId } : {}),
  };
}

export function emptyProject(name = 'Untitled'): Project {
  return { version: 1, name, shapes: [], joins: [], fused: [], markers: [], settings: { ...DEFAULT_SETTINGS } };
}

/** The project a first visit opens with: a mushroom cap sitting on its stem, ready to fuse. */
export function starterProject(): Project {
  const stem = makeShape('cylinder', 'stem', { name: 'Stem', color: '#efe6d4', params: { radius: 1.6, height: 3.6, edge: 0.6 } });
  const cap = makeShape('dome', 'cap', {
    name: 'Cap', color: '#a4492b',
    params: { radius: 3.4, flatness: 0.7 },
    transform: { position: [0, 3.3, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  });
  return { ...emptyProject('Little Red Mushroom'), shapes: [stem, cap] };
}

// `+ 0` turns -0 into 0 so a saved file reads back exactly.
const z = (v: number) => v + 0;
const cloneTransform = (t: Transform): Transform => ({
  position: t.position.map(z) as Vec3, rotation: t.rotation.map(z) as Quat, scale: t.scale.map(z) as Vec3,
});

/** Reflect a transform through the YZ plane (x -> -x). Shapes are round, so this is their mirror image. */
export function mirrorTransform(t: Transform): Transform {
  const [x, y, z] = t.position;
  const [qx, qy, qz, qw] = t.rotation;
  return cloneTransform({ position: [-x, y, z], rotation: [qx, -qy, -qz, qw], scale: t.scale });
}

export const findShape = (p: Project, id: string) => p.shapes.find((s) => s.id === id);

/** The other half of a mirrored pair, if any. */
export function partnerOf(p: Project, id: string): Shape | undefined {
  const s = findShape(p, id);
  if (!s) return undefined;
  if (s.mirrorOf) return findShape(p, s.mirrorOf);
  return p.shapes.find((o) => o.mirrorOf === id);
}

/** Where a partner should be hosted: the mirror of the host when the host has one, else the same host. */
function mirroredHost(p: Project, hostId: string | undefined): string | undefined {
  if (!hostId) return undefined;
  return partnerOf(p, hostId)?.id ?? hostId;
}

export type ShapePatch = Partial<Pick<Shape, 'name' | 'kind' | 'params' | 'transform' | 'color' | 'hostId'>>;

/** Apply edits to one shape and, unless `mirror` is false, keep its mirror partner in step. */
export function updateShape(p: Project, id: string, patch: ShapePatch, mirror = true): Project {
  const s = findShape(p, id);
  if (!s) return p;
  const next: Shape = { ...s, ...patch, params: { ...s.params, ...patch.params } };
  if (patch.transform) next.transform = cloneTransform(patch.transform);
  if ('hostId' in patch && !patch.hostId) delete next.hostId;
  let shapes = p.shapes.map((o) => (o.id === id ? next : o));
  const partner = mirror ? partnerOf(p, id) : undefined;
  if (partner) {
    const q: Shape = {
      ...partner,
      kind: next.kind,
      params: { ...next.params },
      color: next.color,
      transform: mirrorTransform(next.transform),
    };
    const host = mirroredHost(p, next.hostId);
    if (host && host !== partner.id) q.hostId = host;
    else delete q.hostId;
    shapes = shapes.map((o) => (o.id === partner.id ? q : o));
  }
  return { ...p, shapes };
}

export function addShape(p: Project, shape: Shape): Project {
  return { ...p, shapes: [...p.shapes, shape] };
}

/** Make a linked mirror copy. Returns the project unchanged if the shape already has a partner. */
export function addMirror(p: Project, id: string, newId: string): Project {
  const s = findShape(p, id);
  if (!s || partnerOf(p, id)) return p;
  const copy = makeShape(s.kind, newId, {
    name: `${s.name}, mirrored`, params: s.params, color: s.color,
    transform: mirrorTransform(s.transform), mirrorOf: id,
  });
  const host = mirroredHost(p, s.hostId);
  if (host) copy.hostId = host;
  let next = addShape(p, copy);
  const join = p.joins.find((j) => j.a === id || j.b === id);
  if (join && host) next = setJoin(next, newId, host, join.mode, false);
  return next;
}

/** Remove a shape, its joins and any references to it. Its mirror partner stays as an ordinary shape. */
export function removeShape(p: Project, id: string): Project {
  // A piece left with one shape dissolves; whatever was sewn to it moves to that shape.
  const map = new Map<string, string>();
  for (const f of p.fused) {
    const rest = f.shapeIds.filter((s) => s !== id);
    if (f.shapeIds.includes(id) && rest.length === 1) map.set(f.id, rest[0]!);
  }
  const next: Project = {
    ...p,
    shapes: p.shapes.filter((s) => s.id !== id).map((s) => {
      if (s.mirrorOf !== id && s.hostId !== id) return s;
      const c = { ...s };
      if (c.mirrorOf === id) delete c.mirrorOf;
      if (c.hostId === id) delete c.hostId;
      return c;
    }),
    joins: p.joins.filter((j) => j.a !== id && j.b !== id),
    fused: p.fused
      .map((f) => ({ ...f, shapeIds: f.shapeIds.filter((s) => s !== id) }))
      .filter((f) => f.shapeIds.length > 1),
    markers: p.markers.filter((m) => m.itemId !== id),
  };
  return pruneRefs(remapRefs(next, map));
}

// ---- Fused pieces ----

export const findPiece = (p: Project, id: string) => p.fused.find((f) => f.id === id);

/** The fused piece a shape belongs to, if any. */
export const pieceOf = (p: Project, shapeId: string) => p.fused.find((f) => f.shapeIds.includes(shapeId));

/**
 * Fuse shapes (and any pieces they already belong to) into one piece.
 * Needs at least two shapes in the end. Returns the project and the piece id.
 */
export function fuseShapes(p: Project, shapeIds: string[], newId: string): { project: Project; id: string | null } {
  const ids = new Set<string>();
  const absorbed = new Set<string>();
  for (const sid of shapeIds) {
    if (!findShape(p, sid)) continue;
    const f = pieceOf(p, sid);
    if (f) { absorbed.add(f.id); f.shapeIds.forEach((x) => ids.add(x)); } else ids.add(sid);
  }
  if (ids.size < 2) return { project: p, id: null };
  const first = [...absorbed].map((a) => findPiece(p, a)!)[0];
  const ordered = p.shapes.map((s) => s.id).filter((s) => ids.has(s));
  const names = ordered.map((s) => findShape(p, s)!.name);
  const piece: FusedPiece = {
    id: first?.id ?? newId,
    name: first?.name ?? (names.length <= 3 ? names.join(' + ') : `${names.slice(0, 2).join(' + ')} + ${names.length - 2} more`),
    shapeIds: ordered,
    color: first?.color ?? biggest(p, ordered).color,
  };
  const next = { ...p, fused: [...p.fused.filter((f) => !absorbed.has(f.id)), piece] };
  // Seams and eyes on the fused shapes now belong to the piece.
  const map = new Map<string, string>([...ids, ...absorbed].map((x) => [x, piece.id]));
  return { project: remapRefs(next, map), id: piece.id };
}

/** The shape with the most bulk, whose colour a new fused piece takes. */
function biggest(p: Project, ids: string[]): Shape {
  const bulk = (s: Shape) => shapeRadius(s) ** 2 * shapeHeight(s);
  return ids.map((id) => findShape(p, id)!).reduce((a, b) => (bulk(b) > bulk(a) ? b : a));
}

/** Undo a fusion: the shapes become separate pieces again, each in the piece's colour. */
export function separatePiece(p: Project, pieceId: string): Project {
  const f = findPiece(p, pieceId);
  if (!f) return p;
  const next = {
    ...p,
    fused: p.fused.filter((x) => x.id !== pieceId),
    shapes: p.shapes.map((s) => (f.shapeIds.includes(s.id) ? { ...s, color: f.color } : s)),
  };
  // Seams and eyes on the piece go to its biggest shape.
  return remapRefs(next, new Map([[pieceId, biggest(p, f.shapeIds).id]]));
}

/** Ids that can be sewn or carry eyes: fused pieces and shapes that aren't part of one. */
export function itemIds(p: Project): Set<string> {
  return new Set([...p.fused.map((f) => f.id), ...p.shapes.filter((s) => !pieceOf(p, s.id)).map((s) => s.id)]);
}

/** Point joins and markers at new ids, dropping joins that end up joining a piece to itself. */
function remapRefs(p: Project, map: Map<string, string>): Project {
  const to = (id: string) => map.get(id) ?? id;
  const seen = new Set<string>();
  const joins = p.joins.map((j) => ({ ...j, a: to(j.a), b: to(j.b) })).filter((j) => {
    if (j.a === j.b) return false;
    // A piece is sewn onto one host at most.
    const key = j.mode === 'sew' ? `sew:${j.a}` : `${j.mode}:${[j.a, j.b].sort().join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...p, joins, markers: p.markers.map((m) => ({ ...m, itemId: to(m.itemId) })) };
}

/** Drop joins and markers whose pieces no longer exist. */
function pruneRefs(p: Project): Project {
  const ok = itemIds(p);
  const shapes = new Set(p.shapes.map((s) => s.id));
  const live = (id: string) => ok.has(id) || shapes.has(id);
  return { ...p, joins: p.joins.filter((j) => live(j.a) && live(j.b)), markers: p.markers.filter((m) => ok.has(m.itemId)) };
}

export function updatePiece(p: Project, pieceId: string, patch: Partial<Pick<FusedPiece, 'name' | 'color'>>): Project {
  return { ...p, fused: p.fused.map((f) => (f.id === pieceId ? { ...f, ...patch } : f)) };
}

/** A fresh piece id. */
export function nextPieceId(p: Project): string {
  const used = new Set(p.fused.map((f) => f.id));
  for (let i = 1; ; i++) if (!used.has(`piece-${i}`)) return `piece-${i}`;
}

export const joinBetween = (p: Project, a: string, b: string) =>
  p.joins.find((j) => (j.a === a && j.b === b) || (j.a === b && j.b === a));

/** Set or replace the join between two shapes. Mirror pairs get the matching join. */
export function setJoin(p: Project, a: string, b: string, mode: JoinMode, mirror = true): Project {
  if (a === b) return p;
  let next: Project = { ...clearJoin(p, a, b), joins: [...clearJoin(p, a, b).joins, { a, b, mode }] };
  const pa = mirror ? partnerOf(p, a) : undefined;
  if (pa) {
    const host = partnerOf(p, b)?.id ?? b;
    if (pa.id !== host && !(pa.id === b && host === a)) next = setJoin(next, pa.id, host, mode, false);
  }
  return next;
}

export function clearJoin(p: Project, a: string, b: string): Project {
  return { ...p, joins: p.joins.filter((j) => !((j.a === a && j.b === b) || (j.a === b && j.b === a))) };
}

/** A fresh id not used in the project. */
export function nextId(p: Project, base: string): string {
  const used = new Set(p.shapes.map((s) => s.id));
  for (let i = 1; ; i++) {
    const id = `${base}-${i}`;
    if (!used.has(id)) return id;
  }
}

/** A readable name not used in the project: "Sphere", "Sphere 2", ... */
export function nextName(p: Project, base: string): string {
  const used = new Set(p.shapes.map((s) => s.name));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`;
}

// ---- Save and open ----

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export class ProjectFileError extends Error {}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec = (v: unknown, n: number): boolean => Array.isArray(v) && v.length === n && v.every(isNum);

/** Read a project file, checking every field. Throws ProjectFileError with a message a person can act on. */
export function parseProject(text: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError('This file is not a Round by Round project (it is not valid JSON).');
  }
  const fail = (what: string): never => {
    throw new ProjectFileError(`This project file is damaged: ${what}.`);
  };
  if (!raw || typeof raw !== 'object') fail('it is empty');
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) throw new ProjectFileError('This project was saved by a newer version of Round by Round.');
  if (!Array.isArray(o.shapes)) fail('the shape list is missing');
  const shapes: Shape[] = (o.shapes as unknown[]).map((v, i) => {
    const s = v as Record<string, unknown>;
    const at = `shape ${i + 1}`;
    if (typeof s.id !== 'string' || !s.id) fail(`${at} has no id`);
    if (!SHAPE_KINDS.includes(s.kind as ShapeKind)) fail(`${at} has an unknown kind`);
    const t = s.transform as Record<string, unknown> | undefined;
    if (!t || !isVec(t.position, 3) || !isVec(t.rotation, 4) || !isVec(t.scale, 3)) fail(`${at} has a bad position`);
    const params = s.params as Record<string, unknown> | undefined;
    if (!params || typeof params !== 'object' || !Object.values(params).every(isNum)) fail(`${at} has bad sizes`);
    const shape = makeShape(s.kind as ShapeKind, s.id as string, {
      name: typeof s.name === 'string' ? s.name : undefined,
      params: params as Record<string, number>,
      transform: t as unknown as Transform,
      color: typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : undefined,
      mirrorOf: typeof s.mirrorOf === 'string' ? s.mirrorOf : undefined,
      hostId: typeof s.hostId === 'string' ? s.hostId : undefined,
    });
    return shape;
  });
  const ids = new Set(shapes.map((s) => s.id));
  if (ids.size !== shapes.length) fail('two shapes share an id');
  for (const s of shapes) {
    if (s.mirrorOf && !ids.has(s.mirrorOf)) delete s.mirrorOf;
    if (s.hostId && !ids.has(s.hostId)) delete s.hostId;
  }
  const claimed = new Set<string>();
  const fused: FusedPiece[] = (Array.isArray(o.fused) ? o.fused : []).flatMap((v: Record<string, unknown>, i: number) => {
    if (typeof v.id !== 'string' || !Array.isArray(v.shapeIds)) fail(`fused piece ${i + 1} is incomplete`);
    const members = (v.shapeIds as unknown[]).filter((x): x is string => typeof x === 'string' && ids.has(x) && !claimed.has(x));
    if (members.length < 2) return [];
    members.forEach((m) => claimed.add(m));
    return [{
      id: v.id as string,
      name: typeof v.name === 'string' && v.name ? v.name : 'Fused piece',
      shapeIds: members,
      color: typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : YARN_COLORS[0]!.hex,
    }];
  });
  const refs = new Set([...ids, ...fused.map((f) => f.id)]);
  const joins: Join[] = (Array.isArray(o.joins) ? o.joins : [])
    .filter((j: Record<string, unknown>) => refs.has(j.a as string) && refs.has(j.b as string) && j.a !== j.b && (j.mode === 'sew' || j.mode === 'fuse'))
    .map((j: Record<string, unknown>) => ({ a: j.a as string, b: j.b as string, mode: j.mode as JoinMode, ...(isNum(j.blend) ? { blend: j.blend } : {}) }));
  const markers: Marker[] = (Array.isArray(o.markers) ? o.markers : []).flatMap((v: Record<string, unknown>) => {
    if (v.kind !== 'eyes' || typeof v.id !== 'string' || !refs.has(v.itemId as string)) return [];
    if (!isNum(v.round) || !isNum(v.apart) || !isNum(v.sizeMm)) return [];
    return [{ id: v.id, kind: 'eyes' as const, itemId: v.itemId as string, round: Math.max(1, Math.round(v.round)), apart: Math.max(0, Math.round(v.apart)), sizeMm: v.sizeMm }];
  });
  const st = (o.settings ?? {}) as Record<string, unknown>;
  const settings: ProjectSettings = {
    yarnId: typeof st.yarnId === 'string' ? st.yarnId : DEFAULT_SETTINGS.yarnId,
    stretch: isNum(st.stretch) ? Math.min(0.3, Math.max(0, st.stretch)) : DEFAULT_SETTINGS.stretch,
    rounding: st.rounding === 'balanced3' || st.rounding === 'smooth' ? st.rounding : 'classic6',
    terms: st.terms === 'UK' ? 'UK' : 'US',
  };
  const project: Project = { version: 1, name: typeof o.name === 'string' && o.name ? o.name : 'Untitled', shapes, joins, fused, markers, settings };
  return pruneRefs(remapRefs(project, new Map()));
}
