import { findPiece, findShape, itemIds, partnerOf, pieceOf, type FusedPiece, type Marker, type Project, type Shape } from './project';

/**
 * Pieces and sewing. A piece is what gets crocheted on its own: a fused piece, or a
 * shape that isn't part of one. Any piece can be sewn onto one other piece, its host.
 */
export type Item =
  | { kind: 'fused'; id: string; name: string; color: string; piece: FusedPiece; shapes: Shape[] }
  | { kind: 'shape'; id: string; name: string; color: string; shape: Shape; shapes: Shape[] };

export function itemOf(p: Project, id: string): Item | undefined {
  const f = findPiece(p, id);
  if (f) return { kind: 'fused', id, name: f.name, color: f.color, piece: f, shapes: p.shapes.filter((s) => f.shapeIds.includes(s.id)) };
  const s = findShape(p, id);
  if (!s || pieceOf(p, id)) return undefined;
  return { kind: 'shape', id, name: s.name, color: s.color, shape: s, shapes: [s] };
}

/** Every piece: fused pieces, then loose shapes, in project order. */
export function listItems(p: Project): Item[] {
  const ids = itemIds(p);
  return [...p.fused.map((f) => f.id), ...p.shapes.map((s) => s.id).filter((id) => ids.has(id))].map((id) => itemOf(p, id)!);
}

/** The piece a shape or piece id belongs to (a part of a fused piece belongs to the piece). */
export function itemFor(p: Project, id: string): Item | undefined {
  return itemOf(p, pieceOf(p, id)?.id ?? id);
}

export const hostOf = (p: Project, id: string): string | undefined => p.joins.find((j) => j.mode === 'sew' && j.a === id)?.b;

/** Pieces sewn directly onto `id`. */
export const sewnOnto = (p: Project, id: string): string[] => p.joins.filter((j) => j.mode === 'sew' && j.b === id).map((j) => j.a);

/** Everything sewn onto `id`, and onto those, and so on. */
export function sewnTree(p: Project, id: string): string[] {
  const out: string[] = [];
  const walk = (h: string) => {
    for (const c of sewnOnto(p, h)) if (!out.includes(c) && c !== id) { out.push(c); walk(c); }
  };
  walk(id);
  return out;
}

/** A piece can be sewn onto any other piece that isn't already sewn onto it. */
export function canSew(p: Project, child: string, host: string): boolean {
  const ids = itemIds(p);
  return child !== host && ids.has(child) && ids.has(host) && !sewnTree(p, child).includes(host);
}

/**
 * Sew `child` onto `host`, or with null unpick it so it is crocheted on its own again.
 * A mirrored shape's partner is sewn onto the mirror of the host (or the same host).
 */
export function sewOnto(p: Project, child: string, host: string | null, mirror = true): Project {
  if (host !== null && !canSew(p, child, host)) return p;
  let next: Project = { ...p, joins: p.joins.filter((j) => !(j.mode === 'sew' && j.a === child)) };
  if (host !== null) next = { ...next, joins: [...next.joins, { a: child, b: host, mode: 'sew' }] };
  const partner = mirror ? partnerOf(p, child) : undefined;
  if (partner && itemIds(p).has(partner.id)) {
    const ph = host === null ? null : partnerOf(p, host)?.id ?? host;
    if (ph !== partner.id) next = sewOnto(next, partner.id, ph, false);
  }
  return next;
}

/** A fresh marker id. */
export function nextMarkerId(p: Project): string {
  const used = new Set(p.markers.map((m) => m.id));
  for (let i = 1; ; i++) if (!used.has(`eyes-${i}`)) return `eyes-${i}`;
}

/** Put a pair of safety eyes on a piece, or change the pair it has. */
export function setEyes(p: Project, itemId: string, eyes: Omit<Marker, 'id' | 'kind' | 'itemId'> | null): Project {
  const rest = p.markers.filter((m) => !(m.kind === 'eyes' && m.itemId === itemId));
  if (!eyes) return { ...p, markers: rest };
  const id = p.markers.find((m) => m.kind === 'eyes' && m.itemId === itemId)?.id ?? nextMarkerId(p);
  return { ...p, markers: [...rest, { id, kind: 'eyes', itemId, ...eyes }] };
}

export const eyesOf = (p: Project, itemId: string) => p.markers.find((m) => m.kind === 'eyes' && m.itemId === itemId);
