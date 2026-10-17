import { normalize, quatFromUnitVectors } from './geometry';
import { addMirror, emptyProject, makeShape, type Project, type Shape, type Vec3 } from './project';
import { setEyes, sewOnto } from './sew';
import type { ShapeKind } from './shapes';

/**
 * Starter projects: complete toys to learn from or build on. Each one is made of sewn
 * pieces so it produces a full pattern with assembly.
 */

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** A shape whose base sits at `at`, growing along `dir`. */
function placed(kind: ShapeKind, id: string, name: string, color: string, params: Record<string, number>, at: Vec3, dir: Vec3 = [0, 1, 0]): Shape {
  const rotation = quatFromUnitVectors([0, 1, 0], normalize(dir));
  return makeShape(kind, id, { name, color, params, transform: { position: at, rotation, scale: [1, 1, 1] } });
}

const CREAM = '#efe6d4', RUST = '#a4492b', CAMEL = '#b88a52', OATMEAL = '#d8c9ae';

/** Little Red Mushroom: a cap with a stem sewn underneath and a pair of eyes. */
export function mushroomStarter(): Project {
  const cap = placed('dome', 'cap', 'Cap', RUST, { radius: 3.4, flatness: 0.7 }, [0, 3.3, 0]);
  const stem = placed('cylinder', 'stem', 'Stem', CREAM, { radius: 1.6, height: 3.8, edge: 0.6 }, [0, 0, 0]);
  let p: Project = { ...emptyProject('Little Red Mushroom'), shapes: [cap, stem] };
  p = sewOnto(p, 'stem', 'cap');
  return setEyes(p, 'stem', { round: 7, apart: 3, sizeMm: 6 });
}

/** A sitting bear: head, ears, muzzle, arms and legs all sewn on. */
export function bearStarter(): Project {
  const headC: Vec3 = [0, 9.6, 0], R = 3.3;
  const onHead = (d: Vec3, sink: number) => add(headC, scale(normalize(d), R - sink));
  const body = placed('egg', 'body', 'Body', CAMEL, { radius: 3.2, taper: 0.2 }, [0, 0, 0]);
  const head = placed('sphere', 'head', 'Head', CAMEL, { radius: R }, [0, headC[1] - R, 0]);
  const muzzleDir: Vec3 = [0, -0.35, 1];
  const muzzle = placed('dome', 'muzzle', 'Muzzle', OATMEAL, { radius: 1.5, flatness: 0.6 }, onHead(muzzleDir, 0.45), muzzleDir);
  const earDir: Vec3 = [-0.62, 0.78, 0];
  const ear = placed('dome', 'ear', 'Ear', CAMEL, { radius: 1.25, flatness: 0.6 }, onHead(earDir, 0.35), earDir);
  const arm = placed('capsule', 'arm', 'Arm', CAMEL, { radius: 0.85, length: 4 }, [-2.2, 5.2, 0.3], [-0.55, -0.82, 0.15]);
  const leg = placed('capsule', 'leg', 'Leg', CAMEL, { radius: 1.05, length: 3.6 }, [-1.4, 1.4, 1.3], [-0.2, -0.25, 1]);
  let p: Project = { ...emptyProject('Sitting Bear'), shapes: [body, head, muzzle, ear, arm, leg] };
  p = addMirror(p, 'ear', 'ear-r');
  p = addMirror(p, 'arm', 'arm-r');
  p = addMirror(p, 'leg', 'leg-r');
  p = { ...p, shapes: p.shapes.map((s) => (s.mirrorOf ? { ...s, name: `${s.name.replace(', mirrored', '')}, right` } : s)) };
  p = sewOnto(p, 'head', 'body');
  p = sewOnto(p, 'muzzle', 'head');
  p = sewOnto(p, 'ear', 'head');
  p = sewOnto(p, 'arm', 'body');
  p = sewOnto(p, 'leg', 'body');
  return setEyes(p, 'head', { round: 8, apart: 8, sizeMm: 9 });
}

export const STARTERS: { id: string; label: string; make: () => Project }[] = [
  { id: 'mushroom', label: 'Little Red Mushroom', make: mushroomStarter },
  { id: 'bear', label: 'Sitting Bear', make: bearStarter },
];
