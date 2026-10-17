import { describe, expect, it } from 'vitest';
import {
  computeRounds, fusedAxis, inFrameOf, mulQuat, rotate, fusedField, fusedProfile, fuseShapes, makeShape, parseProject, pieceOf,
  quatFromUnitVectors, removeShape, separatePiece, serializeProject, shapeProfile, starterProject,
  type FieldShape, type ProfilePoint,
} from '../src';

const worsted = { gauge: { stitchW: 0.5, rowH: 0.45 }, stretch: 0.1, rounding: 'classic6' as const };

/** Linear lookup of r at height z on a profile whose z never decreases. */
const rAt = (prof: ProfilePoint[], z: number) => {
  for (let i = 1; i < prof.length; i++) {
    const a = prof[i - 1]!, b = prof[i]!;
    if (z >= a.z && z <= b.z) return b.z - a.z < 1e-9 ? Math.max(a.r, b.r) : a.r + ((b.r - a.r) * (z - a.z)) / (b.z - a.z);
  }
  return 0;
};

describe('fused field', () => {
  it('is inside a shape and outside past its surface', () => {
    const f = fusedField([makeShape('sphere', 's', { params: { radius: 2 } })]);
    expect(f([0, 2, 0])).toBeLessThan(0);
    expect(f([0, 4.2, 0])).toBeGreaterThan(0);
    expect(f([2.2, 2, 0])).toBeGreaterThan(0);
  });

  it('follows rotation and position', () => {
    const s = makeShape('capsule', 'c', {
      params: { radius: 1, length: 6 },
      transform: { position: [10, 0, 0], rotation: quatFromUnitVectors([0, 1, 0], [1, 0, 0]), scale: [1, 1, 1] },
    });
    const f = fusedField([s]);
    expect(f([15, 0, 0])).toBeLessThan(0);
    expect(f([10, 3, 0])).toBeGreaterThan(0);
  });
});

describe('one shape fused on its own', () => {
  it('measures the same profile as the shape', () => {
    const sphere = makeShape('sphere', 's', { params: { radius: 3 } });
    const { profile } = fusedProfile([sphere]);
    const total = profile[profile.length - 1]!.z;
    expect(total).toBeCloseTo(6, 1);
    for (const z of [0.5, 1.5, 3, 4.5, 5.5]) {
      const want = Math.sqrt(9 - (z - 3) ** 2);
      expect(Math.abs(rAt(profile, z) - want) / want).toBeLessThan(0.03);
    }
  });

  it('gives the same pattern as the shape within a round or two', () => {
    const sphere = makeShape('sphere', 's', { params: { radius: 3 } });
    const direct = computeRounds(shapeProfile(sphere), worsted).rounds;
    const fused = computeRounds(fusedProfile([sphere]).profile, worsted).rounds;
    expect(Math.abs(fused.length - direct.length)).toBeLessThanOrEqual(1);
    expect(Math.max(...fused.map((r) => r.count))).toBe(Math.max(...direct.map((r) => r.count)));
  });
});

describe('mushroom: cap fused onto stem', () => {
  const p = starterProject();
  const shapes = p.shapes as FieldShape[];

  it('works up the shared axis from the bottom of the stem', () => {
    const { axis, start } = fusedProfile(shapes);
    expect(axis[1]).toBeCloseTo(1);
    expect(start[1]).toBeCloseTo(0, 1);
  });

  it('follows the outside of both: stem width low down, cap width up top', () => {
    const { profile } = fusedProfile(shapes);
    expect(Math.abs(rAt(profile, 1.5) - 1.6) / 1.6).toBeLessThan(0.03);
    expect(Math.abs(rAt(profile, 3.35) - 3.4) / 3.4).toBeLessThan(0.04);
    expect(profile[profile.length - 1]!.z).toBeCloseTo(3.3 + 3.4 * 0.7, 1);
  });

  it('makes one pattern that grows to the cap and closes at the crown', () => {
    const { rounds } = computeRounds(fusedProfile(shapes).profile, worsted);
    const counts = rounds.map((r) => r.count);
    const widest = (2 * Math.PI * 3.4) / (0.5 * 1.1);
    expect(Math.max(...counts)).toBeGreaterThan(widest * 0.85);
    expect(counts[counts.length - 1]).toBe(6);
    expect(rounds[0]!.count).toBe(6);
  });

  it('reports no splits', () => {
    expect(fusedProfile(shapes).splits).toEqual([]);
  });
});

describe('moving a fused piece', () => {
  it('gives the same pattern measured in its own frame wherever it is moved or turned', () => {
    const shapes = starterProject().shapes;
    const q = quatFromUnitVectors([0, 1, 0], [0.6, 0, 0.8]);
    const moved = shapes.map((s) => ({
      ...s,
      transform: { ...s.transform, position: rotate(q, s.transform.position).map((v, i) => v + [5, 2, -3][i]!) as [number, number, number], rotation: mulQuat(q, s.transform.rotation) },
    }));
    const counts = (xs: typeof shapes) => computeRounds(fusedProfile(inFrameOf(xs, xs[0]!.transform)).profile, worsted).rounds.map((r) => r.count);
    expect(counts(moved)).toEqual(counts(shapes));
  });
});

describe('shapes that do not touch', () => {
  it('flags the rounds where the slice falls into separate loops', () => {
    const a = makeShape('cylinder', 'a', { params: { radius: 1, height: 4 } });
    const b = makeShape('cylinder', 'b', { params: { radius: 1, height: 4 }, transform: { position: [4, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } });
    const { splits } = fusedProfile([a, b], { axis: [0, 1, 0] });
    expect(splits.length).toBe(1);
    expect(splits[0]![1] - splits[0]![0]).toBeGreaterThan(3);
  });
});

describe('working axis', () => {
  it('uses the long direction when shapes point different ways', () => {
    const body = makeShape('capsule', 'body', {
      params: { radius: 1.5, length: 12 },
      transform: { position: [-6, 0, 0], rotation: quatFromUnitVectors([0, 1, 0], [1, 0, 0]), scale: [1, 1, 1] },
    });
    const bump = makeShape('sphere', 'bump', { params: { radius: 1 }, transform: { position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } });
    const a = fusedAxis([body, bump]);
    expect(Math.abs(a[0])).toBeGreaterThan(0.95);
  });
});

describe('fused pieces in the project', () => {
  it('fuses, merges pieces, separates and survives save and open', () => {
    let p = starterProject();
    p = { ...p, shapes: [...p.shapes, makeShape('sphere', 'spot', { name: 'Spot' })] };
    const a = fuseShapes(p, ['cap', 'stem'], 'piece-1');
    expect(a.id).toBe('piece-1');
    expect(a.project.fused[0]).toMatchObject({ name: 'Stem + Cap', shapeIds: ['stem', 'cap'], color: '#a4492b' });
    const b = fuseShapes(a.project, ['spot', 'cap'], 'piece-2');
    expect(b.id).toBe('piece-1');
    expect(b.project.fused).toHaveLength(1);
    expect(b.project.fused[0]!.shapeIds).toEqual(['stem', 'cap', 'spot']);
    expect(parseProject(serializeProject(b.project))).toEqual(b.project);
    const c = separatePiece(b.project, 'piece-1');
    expect(c.fused).toEqual([]);
    expect(c.shapes.every((s) => s.color === '#a4492b')).toBe(true);
  });

  it('needs two shapes, and dissolves when one is left', () => {
    const p = starterProject();
    expect(fuseShapes(p, ['cap'], 'x').id).toBeNull();
    const { project } = fuseShapes(p, ['cap', 'stem'], 'piece-1');
    const q = removeShape(project, 'cap');
    expect(q.fused).toEqual([]);
    expect(pieceOf(q, 'stem')).toBeUndefined();
  });
});
