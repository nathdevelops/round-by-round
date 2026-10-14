import type { ProfilePoint } from './types';

/**
 * Analytic side profiles for the round shapes in the palette.
 * Each profile starts on the axis (r = 0) at z = 0 and is walked in crochet order.
 * All sizes are in cm. These cover shapes used on their own (M1); trimming and
 * fusing come later (M3, M5).
 */
export type ShapeKind = 'sphere' | 'ellipsoid' | 'egg' | 'capsule' | 'cylinder' | 'cone' | 'teardrop' | 'dome';

export interface ShapeSpec {
  kind: ShapeKind;
  params: Record<string, number>;
}

export const SHAPE_DEFAULTS: Record<ShapeKind, Record<string, number>> = {
  sphere: { radius: 3 },
  ellipsoid: { radius: 3, height: 4 },
  egg: { radius: 3, taper: 0.25 },
  capsule: { radius: 1.5, length: 6 },
  cylinder: { radius: 2, height: 4, edge: 0.4 },
  cone: { baseRadius: 2.5, tipRadius: 0.3, height: 5 },
  teardrop: { radius: 2, length: 5 },
  dome: { radius: 3, flatness: 0.6 },
};

const N = 48;
const arc = (n: number, f: (t: number) => ProfilePoint) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

export function shapeProfile(spec: ShapeSpec): ProfilePoint[] {
  const p = { ...SHAPE_DEFAULTS[spec.kind], ...spec.params };
  switch (spec.kind) {
    case 'sphere': {
      const R = p.radius!;
      return arc(N, (t) => ({ r: R * Math.sin(Math.PI * t), z: R - R * Math.cos(Math.PI * t) }));
    }
    case 'ellipsoid': {
      const R = p.radius!, H = p.height! / 2;
      return arc(N, (t) => ({ r: R * Math.sin(Math.PI * t), z: H - H * Math.cos(Math.PI * t) }));
    }
    case 'egg': {
      // Wider bottom, narrower top: radius modulated along height.
      const R = p.radius!, k = p.taper!;
      return arc(N, (t) => {
        const a = Math.PI * t;
        const z = R - R * Math.cos(a);
        return { r: R * Math.sin(a) * (1 + k * (0.5 - z / (2 * R))), z: z * 1.15 };
      });
    }
    case 'capsule': {
      const R = p.radius!, L = Math.max(p.length!, 2 * R), mid = L - 2 * R;
      const bottom = arc(N / 2, (t) => ({ r: R * Math.sin((Math.PI / 2) * t), z: R - R * Math.cos((Math.PI / 2) * t) }));
      const top = arc(N / 2, (t) => ({ r: R * Math.cos((Math.PI / 2) * t), z: R + mid + R * Math.sin((Math.PI / 2) * t) }));
      return [...bottom, ...top.slice(1)];
    }
    case 'cylinder': {
      const R = p.radius!, H = p.height!, e = Math.min(p.edge!, R * 0.9, H / 2);
      const q = (cx: number, cz: number, a0: number) =>
        arc(8, (t) => ({ r: cx + e * Math.cos(a0 + (Math.PI / 2) * t), z: cz + e * Math.sin(a0 + (Math.PI / 2) * t) }));
      return [{ r: 0, z: 0 }, ...q(R - e, e, -Math.PI / 2), ...q(R - e, H - e, 0), { r: 0, z: H }];
    }
    case 'cone': {
      // Crocheted from the tip (small magic ring) down to the flat base.
      const Rb = p.baseRadius!, Rt = Math.min(p.tipRadius!, Rb), H = p.height!;
      const tip = arc(6, (t) => ({ r: Rt * Math.sin((Math.PI / 2) * t), z: H - Rt + Rt * Math.cos((Math.PI / 2) * t) }));
      return [...tip.map((q) => ({ r: q.r, z: H - q.z })), { r: Rb, z: H }, { r: 0, z: H }];
    }
    case 'teardrop': {
      const R = p.radius!, L = p.length!;
      return arc(N, (t) => {
        const a = Math.PI * t;
        return { r: R * Math.sin(a) * (1 - 0.45 * t), z: (L * (1 - Math.cos(a))) / 2 };
      });
    }
    case 'dome': {
      // Rounded top, then a flat underside back to the axis.
      const R = p.radius!, H = R * p.flatness!;
      const top = arc(N, (t) => ({ r: R * Math.sin((Math.PI / 2) * t), z: H - H * Math.cos((Math.PI / 2) * t) }));
      return [...top, { r: 0, z: H }];
    }
  }
}
