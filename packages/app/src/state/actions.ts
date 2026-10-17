import {
  addShape, findPiece, findShape, itemFor, makeShape, nextId, nextName, partnerOf, pieceOf, removeShape, sewnTree, shapeRadius,
  updateShape, SHAPE_NAMES, YARN_COLORS, type Project, type Quat, type Shape, type ShapeKind, type Transform, type Vec3,
} from '@rbr/engine';
import { Matrix4, Quaternion, Vector3 } from 'three';

/** Editor operations built from engine functions. Each returns a new project. */

/** Add a new shape standing on the table: where it was dropped, or to the right of everything else. */
export function addShapeOf(p: Project, kind: ShapeKind, at?: Vec3): { project: Project; id: string } {
  const id = nextId(p, kind);
  const color = YARN_COLORS[(p.shapes.length + 1) % YARN_COLORS.length]!.hex;
  let shape = makeShape(kind, id, { name: nextName(p, SHAPE_NAMES[kind]), color });
  let position: Vec3;
  if (at) {
    position = [at[0], 0, at[2]];
  } else {
    const right = p.shapes.reduce((m, s) => Math.max(m, s.transform.position[0] + shapeRadius(s)), -Infinity);
    position = [Number.isFinite(right) ? Math.round((right + shapeRadius(shape) + 1) * 10) / 10 : 0, 0, 0];
  }
  shape = { ...shape, transform: { ...shape.transform, position } };
  return { project: addShape(p, shape), id };
}

/** The shapes a selection covers: fused pieces stand for all their parts. */
export function selectedShapes(p: Project, selected: string[]): Shape[] {
  const ids = new Set<string>();
  for (const id of selected) {
    const f = findPiece(p, id);
    if (f) f.shapeIds.forEach((s) => ids.add(s));
    else if (findShape(p, id)) ids.add(id);
  }
  return p.shapes.filter((s) => ids.has(s.id));
}

/** True when the selection is one part of a fused piece, picked out to adjust on its own. */
export function isEditingPart(p: Project, selected: string[]): boolean {
  return selected.length === 1 && !!pieceOf(p, selected[0]!);
}

/** Remove everything selected. */
export function removeSelection(p: Project, selected: string[]): Project {
  return selectedShapes(p, selected).reduce((acc, s) => removeShape(acc, s.id), p);
}

/**
 * What moves when the selection moves: the selected shapes plus everything sewn onto
 * them (and onto those), so a head carries its ears. A part picked out of a fused piece
 * moves on its own.
 */
export function movingShapes(p: Project, selected: string[]): Shape[] {
  if (isEditingPart(p, selected)) return selectedShapes(p, selected);
  const ids = new Set(selected);
  for (const id of selected) {
    const it = itemFor(p, id);
    if (it) sewnTree(p, it.id).forEach((c) => ids.add(c));
  }
  return selectedShapes(p, [...ids]);
}

const ONE = new Vector3(1, 1, 1);
const round3 = (v: number) => Math.round(v * 1000) / 1000;
export const matrixOf = (t: Transform) => new Matrix4().compose(new Vector3(...t.position), new Quaternion(...t.rotation), ONE);

/**
 * Move shapes rigidly by `delta` (a world-space matrix), starting from `base`.
 * A shape whose mirror partner isn't moving keeps the partner in step.
 */
export function moveShapes(base: Project, ids: string[], delta: Matrix4): Project {
  const pos = new Vector3(), quat = new Quaternion(), scl = new Vector3();
  const moving = new Set(ids);
  let next = base;
  for (const id of ids) {
    const s = findShape(base, id);
    if (!s) continue;
    new Matrix4().multiplyMatrices(delta, matrixOf(s.transform)).decompose(pos, quat, scl);
    const partner = partnerOf(base, id);
    next = updateShape(next, id, {
      transform: { position: pos.toArray().map(round3) as Vec3, rotation: quat.toArray() as Quat, scale: s.transform.scale },
    }, !partner || !moving.has(partner.id));
  }
  return next;
}

/** Give one shape a new place, carrying whatever is sewn onto it. */
export function placeShape(p: Project, id: string, transform: Transform): Project {
  const s = findShape(p, id);
  if (!s) return p;
  const delta = matrixOf(transform).multiply(matrixOf(s.transform).invert());
  const moved = moveShapes(p, movingShapes(p, [id]).map((x) => x.id), delta);
  return updateShape(moved, id, { transform });
}
