import {
  addShape, findPiece, findShape, makeShape, nextId, nextName, pieceOf, removeShape, shapeRadius,
  SHAPE_NAMES, YARN_COLORS, type Project, type Shape, type ShapeKind, type Vec3,
} from '@rbr/engine';

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
