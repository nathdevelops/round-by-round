import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addMirror, addShape, commit, displayProfile, historyOf, makeShape, mirrorTransform, parseProject,
  partnerOf, ProjectFileError, quatFromUnitVectors, redo, removeShape, rotate,
  serializeProject, setJoin, shapeHeight, starterProject, undo, updateShape, emptyProject,
  SHAPE_DEFAULTS, SHAPE_KINDS, type Project, type Quat, type Vec3,
} from '../src';

const close = (a: number[], b: number[], eps = 1e-9) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, -Math.log10(eps)));

/** A pair of ears on a head, one mirrored. */
function earsProject(): Project {
  let p = emptyProject('Bear');
  p = addShape(p, makeShape('sphere', 'head', { name: 'Head' }));
  p = addShape(p, makeShape('dome', 'ear', {
    name: 'Ear', hostId: 'head',
    transform: { position: [2, 5, 0.5], rotation: quatFromUnitVectors([0, 1, 0], [0.6, 0.8, 0]), scale: [1, 1, 1] },
  }));
  p = setJoin(p, 'ear', 'head', 'sew');
  return addMirror(p, 'ear', 'ear-2');
}

describe('mirror', () => {
  it('makes a linked copy on the other side, sewn to the same host', () => {
    const p = earsProject();
    const copy = p.shapes.find((s) => s.id === 'ear-2')!;
    expect(copy.mirrorOf).toBe('ear');
    expect(copy.hostId).toBe('head');
    expect(copy.transform.position).toEqual([-2, 5, 0.5]);
    expect(p.joins).toContainEqual({ a: 'ear-2', b: 'head', mode: 'sew' });
    expect(partnerOf(p, 'ear')?.id).toBe('ear-2');
    expect(partnerOf(p, 'ear-2')?.id).toBe('ear');
  });

  it('reflects the direction a shape points, not just its position', () => {
    const t = mirrorTransform({ position: [1, 2, 3], rotation: quatFromUnitVectors([0, 1, 0], [0.6, 0.8, 0]), scale: [1, 1, 1] });
    close(rotate(t.rotation, [0, 1, 0]), [-0.6, 0.8, 0]);
  });

  it('carries edits on either shape to its partner', () => {
    let p = earsProject();
    p = updateShape(p, 'ear-2', { params: { radius: 1.2 }, color: '#5fb3a5' });
    const ear = p.shapes.find((s) => s.id === 'ear')!;
    expect(ear.params.radius).toBe(1.2);
    expect(ear.color).toBe('#5fb3a5');
    p = updateShape(p, 'ear', { transform: { position: [3, 4, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } });
    expect(p.shapes.find((s) => s.id === 'ear-2')!.transform.position).toEqual([-3, 4, 0]);
  });

  it('mirrors joins set on either side', () => {
    const p = setJoin(earsProject(), 'ear-2', 'head', 'fuse');
    expect(p.joins.filter((j) => j.mode === 'fuse')).toHaveLength(2);
    expect(p.joins).toHaveLength(2);
  });

  it('does not mirror a shape twice', () => {
    const p = earsProject();
    expect(addMirror(p, 'ear', 'ear-3')).toBe(p);
    expect(addMirror(p, 'ear-2', 'ear-3')).toBe(p);
  });

  it('removing one half leaves the other as an ordinary shape and drops its joins', () => {
    const p = removeShape(earsProject(), 'ear');
    expect(p.shapes.map((s) => s.id)).toEqual(['head', 'ear-2']);
    expect(p.shapes[1]!.mirrorOf).toBeUndefined();
    expect(p.joins).toEqual([{ a: 'ear-2', b: 'head', mode: 'sew' }]);
  });

  it('removing a host unhooks what was sewn to it', () => {
    const p = removeShape(earsProject(), 'head');
    expect(p.shapes.every((s) => !s.hostId)).toBe(true);
    expect(p.joins).toEqual([]);
  });
});

describe('project file', () => {
  it('reopens identically', () => {
    for (const p of [starterProject(), earsProject()]) expect(parseProject(serializeProject(p))).toEqual(p);
  });

  const vec = (n: number) => fc.array(fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }), { minLength: n, maxLength: n });
  it('round-trips any valid project', () => {
    const shapeArb = fc.record({
      kind: fc.constantFrom(...SHAPE_KINDS),
      pos: vec(3), rot: vec(4), k: fc.double({ min: 0.3, max: 3, noNaN: true }),
      color: fc.constantFrom('#a4492b', '#efe6d4', '#5fb3a5'),
      name: fc.string({ maxLength: 20 }),
    });
    fc.assert(fc.property(fc.array(shapeArb, { maxLength: 6 }), fc.constantFrom('classic6', 'balanced3', 'smooth' as const), (specs, rounding) => {
      let p: Project = { ...emptyProject('Test'), settings: { yarnId: 'dk', stretch: 0.05, rounding, terms: 'UK' } };
      specs.forEach((s, i) => {
        const params = Object.fromEntries(Object.entries(SHAPE_DEFAULTS[s.kind]).map(([key, v]) => [key, v * s.k]));
        p = addShape(p, makeShape(s.kind, `s${i}`, {
          name: s.name, params, color: s.color,
          transform: { position: s.pos as Vec3, rotation: s.rot as Quat, scale: [1, 1, 1] },
          hostId: i > 0 ? 's0' : undefined,
        }));
        if (i > 0) p = setJoin(p, `s${i}`, 's0', i % 2 ? 'sew' : 'fuse');
      });
      if (p.shapes.length > 1) p = addMirror(p, 's1', 'm1');
      expect(parseProject(serializeProject(p))).toEqual(p);
    }), { numRuns: 100 });
  });

  it('explains files it cannot open', () => {
    expect(() => parseProject('not json')).toThrow(ProjectFileError);
    expect(() => parseProject('{"version":2}')).toThrow(/newer version/);
    expect(() => parseProject('{"version":1,"shapes":[{"id":"a","kind":"pyramid"}]}')).toThrow(/unknown kind/);
  });

  it('drops links to shapes that are not in the file', () => {
    const text = JSON.stringify({
      version: 1, name: 'x', settings: {},
      shapes: [{ id: 'a', kind: 'sphere', params: { radius: 2 }, transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, hostId: 'gone', mirrorOf: 'gone' }],
      joins: [{ a: 'a', b: 'gone', mode: 'sew' }],
    });
    const p = parseProject(text);
    expect(p.shapes[0]!.hostId).toBeUndefined();
    expect(p.shapes[0]!.mirrorOf).toBeUndefined();
    expect(p.joins).toEqual([]);
  });
});

describe('history', () => {
  it('undoes and redoes in order and forgets redo after a new edit', () => {
    let h = historyOf(1);
    h = commit(commit(h, 2), 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = commit(undo(undo(h)), 9);
    expect(h).toEqual({ past: [1], present: 9, future: [] });
    expect(undo(historyOf(1))).toEqual(historyOf(1));
  });

  it('ignores commits that change nothing and caps its length', () => {
    const h = historyOf('a');
    expect(commit(h, 'a')).toBe(h);
    let n = historyOf(0);
    for (let i = 1; i <= 10; i++) n = commit(n, i, 4);
    expect(n.past).toEqual([6, 7, 8, 9]);
  });
});

describe('display geometry and rotations', () => {
  it('puts every shape base at y = 0 with the wide end of cones and domes at the bottom', () => {
    for (const kind of SHAPE_KINDS) {
      const pts = displayProfile({ kind, params: {} });
      expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(0);
      pts.slice(1).forEach((p, i) => expect(p.y).toBeGreaterThanOrEqual(pts[i]!.y - 1e-9));
    }
    const cone = displayProfile({ kind: 'cone', params: {} });
    expect(cone.find((p) => p.y < 0.01 && p.r > 2)).toBeTruthy();
    expect(shapeHeight({ kind: 'cone', params: { height: 5 } })).toBeCloseTo(5);
  });

  it('turns +Y onto any direction', () => {
    fc.assert(fc.property(fc.tuple(fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true })), (v) => {
      const l = Math.hypot(...v);
      fc.pre(l > 0.1);
      const n = v.map((x) => x / l) as Vec3;
      close(rotate(quatFromUnitVectors([0, 1, 0], n), [0, 1, 0]), n, 1e-6);
    }));
    close(rotate(quatFromUnitVectors([0, 1, 0], [0, -1, 0]), [0, 1, 0]), [0, -1, 0]);
  });

});
