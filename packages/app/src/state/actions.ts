import {
  addShape, findShape, makeShape, nextId, nextName, placeOnSurface, rotate, setJoin, shapeHeight, shapeRadius,
  updateShape, SHAPE_NAMES, YARN_COLORS, type Project, type ShapeKind, type Vec3,
} from '@rbr/engine';

/** Editor operations built from engine functions. Each returns a new project. */

/** Snap a shape onto a point of another shape and sew it there. */
export function snapOnto(p: Project, id: string, hostId: string, point: Vec3, normal: Vec3): Project {
  const s = findShape(p, id);
  if (!s || id === hostId) return p;
  const t = placeOnSurface(s, point, normal, s.transform.scale);
  const joined = p.joins.find((j) => (j.a === id && j.b === hostId) || (j.a === hostId && j.b === id));
  return setJoin(updateShape(p, id, { transform: t, hostId }), id, hostId, joined?.mode ?? 'sew');
}

/** Add a new shape. With a host and surface point it is snapped on; otherwise it stands on the table. */
export function addShapeOf(p: Project, kind: ShapeKind, at?: { point: Vec3; normal?: Vec3; hostId?: string }): { project: Project; id: string } {
  const id = nextId(p, kind);
  const color = YARN_COLORS[(p.shapes.length + 1) % YARN_COLORS.length]!.hex;
  let shape = makeShape(kind, id, { name: nextName(p, SHAPE_NAMES[kind]), color });
  if (!at) {
    // Stand it on the table to the right of everything else.
    const right = p.shapes.reduce((m, s) => Math.max(m, s.transform.position[0] + shapeRadius(s)), -Infinity);
    const x = Number.isFinite(right) ? right + shapeRadius(shape) + 1 : 0;
    shape = { ...shape, transform: { ...shape.transform, position: [Math.round(x * 10) / 10, 0, 0] } };
  } else if (!at.hostId) {
    shape = { ...shape, transform: { ...shape.transform, position: at.point } };
  }
  let next = addShape(p, shape);
  if (at?.hostId) next = snapOnto(next, id, at.hostId, at.point, at.normal ?? [0, 1, 0]);
  return { project: next, id };
}

/** The far end of a shape along its own axis, and which way that points. */
export function topOf(p: Project, id: string): { point: Vec3; normal: Vec3 } | undefined {
  const s = findShape(p, id);
  if (!s) return undefined;
  const n = rotate(s.transform.rotation, [0, 1, 0]);
  const h = shapeHeight(s);
  const [x, y, z] = s.transform.position;
  return { point: [x + n[0] * h, y + n[1] * h, z + n[2] * h], normal: n };
}
