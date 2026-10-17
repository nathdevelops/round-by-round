import { describe, expect, it } from 'vitest';
import {
  bearStarter, canSew, emptyProject, fuseShapes, hostOf, makeShape, measureItem, mushroomStarter, parseProject,
  planProject, planText, removeShape, separatePiece, serializeProject, sewOnto, setEyes, shapeProfile,
  type Project, type Vec3,
} from '../src';

const at = (position: Vec3) => ({ position, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as Vec3 });

/** A small ball pushed into the top of a big one. */
function ballOnBody(y = 5.4): Project {
  const body = makeShape('sphere', 'body', { name: 'Body', params: { radius: 3 } });
  const ball = makeShape('sphere', 'ball', { name: 'Ball', params: { radius: 1.2 }, transform: at([0, y, 0]) });
  return sewOnto({ ...emptyProject(), shapes: [body, ball] }, 'ball', 'body');
}

describe('trimming a sewn piece', () => {
  it('cuts where it sinks into its host and ends open', () => {
    const p = ballOnBody();
    const m = measureItem(p, 'ball');
    expect(m.trimmed).toBe(true);
    expect(m.issues).toEqual([]);
    // Worked from the free top down to the seam.
    expect(m.axis[1]).toBeCloseTo(-1);
    const last = m.profile[m.profile.length - 1]!;
    expect(last.r).toBeGreaterThan(0.5);
    const plan = planProject(p).pieces.find((x) => x.id === 'ball')!;
    expect(plan.rounds.closedEnd).toBe(false);
    expect(plan.rounds.rounds[0]!.count).toBe(6);
  });

  it('starts from the free end whichever way the shape points', () => {
    const p = ballOnBody(-1.8); // hanging below the body
    const m = measureItem(p, 'ball');
    expect(m.trimmed).toBe(true);
    expect(m.axis[1]).toBeCloseTo(1);
  });

  it('keeps a piece whole and says so when it does not touch', () => {
    const p = ballOnBody(9);
    const m = measureItem(p, 'ball');
    expect(m.trimmed).toBe(false);
    expect(m.issues[0]).toMatch(/doesn’t touch Body/);
    const whole = shapeProfile({ kind: 'sphere', params: { radius: 1.2 } });
    expect(m.profile).toHaveLength(whole.length);
    expect(m.profile[m.profile.length - 1]!.r).toBeCloseTo(0);
  });

  it('places the seam on the host in its own rounds', () => {
    const plan = planProject(ballOnBody());
    const seam = plan.pieces.find((x) => x.id === 'ball')!.seam!;
    const body = plan.pieces.find((x) => x.id === 'body')!;
    // The ball sits on top of the body, around its closing.
    expect(seam.to).toBeGreaterThanOrEqual(body.rounds.rounds.length - 2);
    expect(seam.text).toMatch(/^Sew Ball to Body .*centred on the closing\.$/);
  });

  it('measures the same wherever the whole toy is moved', () => {
    const p = bearStarter();
    const moved = { ...p, shapes: p.shapes.map((s) => ({ ...s, transform: { ...s.transform, position: s.transform.position.map((v, i) => v + [7, 2, -3][i]!) as Vec3 } })) };
    expect(planText(moved)).toBe(planText(p));
  });
});

describe('sewing pieces together', () => {
  it('refuses loops', () => {
    const p = ballOnBody();
    expect(canSew(p, 'body', 'ball')).toBe(false);
    expect(sewOnto(p, 'body', 'ball')).toBe(p);
    expect(hostOf(sewOnto(p, 'ball', null), 'ball')).toBeUndefined();
  });

  it('sews a mirrored partner onto the same host', () => {
    const p = bearStarter();
    expect(hostOf(p, 'ear-r')).toBe('head');
    const unpicked = sewOnto(p, 'ear', null);
    expect(hostOf(unpicked, 'ear-r')).toBeUndefined();
  });

  it('moves seams and eyes onto a fused piece and back off it', () => {
    let p = mushroomStarter();
    const fused = fuseShapes(p, ['stem', 'cap'], 'piece-1');
    expect(fused.project.joins).toEqual([]); // the stem was sewn to the cap, now they are one piece
    expect(fused.project.markers[0]!.itemId).toBe('piece-1');
    p = separatePiece(fused.project, 'piece-1');
    expect(p.markers[0]!.itemId).toBe('cap');
  });

  it('keeps what was sewn to a piece when the piece dissolves', () => {
    const base = ballOnBody();
    const extra = makeShape('sphere', 'b2', { params: { radius: 2 }, transform: at([0, -2, 0]) });
    let p: Project = { ...base, shapes: [...base.shapes, extra] };
    p = fuseShapes(p, ['body', 'b2'], 'piece-1').project;
    expect(hostOf(p, 'ball')).toBe('piece-1');
    p = removeShape(p, 'b2');
    expect(hostOf(p, 'ball')).toBe('body');
  });

  it('saves and reopens seams and eyes', () => {
    let p = bearStarter();
    p = fuseShapes(p, ['body', 'leg', 'leg-r'], 'piece-1').project;
    p = setEyes(p, 'head', { round: 10, apart: 6, sizeMm: 8 });
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
});

describe('starters', () => {
  it('the bear makes pairs and sews every piece on', () => {
    const plan = planProject(bearStarter());
    expect(plan.pieces.map((x) => `${x.name}${x.make > 1 ? ' x2' : ''}`)).toEqual(['Body', 'Head', 'Muzzle', 'Ear x2', 'Arm x2', 'Leg x2']);
    expect(plan.pieces.flatMap((x) => x.issues)).toEqual([]);
    expect(plan.pieces.filter((x) => x.id !== 'body').every((x) => !x.rounds.closedEnd)).toBe(true);
    expect(plan.assembly).toHaveLength(5);
    expect(plan.eyes[0]!.points).toHaveLength(2);
  });

  it('the mushroom pattern matches its golden file', async () => {
    await expect(planText(mushroomStarter())).toMatchFileSnapshot('../../../fixtures/mushroom.pattern.txt');
  });

  it('the bear pattern matches its golden file', async () => {
    await expect(planText(bearStarter())).toMatchFileSnapshot('../../../fixtures/bear.pattern.txt');
  });
});
