import type { PieceStitches, Vec3 } from '@rbr/engine';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Color, PerspectiveCamera, Points, ShaderMaterial } from 'three';
import type { HoverRound } from '../state/view';

export interface BallColors {
  start: string;
  inc: string;
  dec: string;
  hot: string;
  /** What faded stitches blend towards (the paper). */
  fade: string;
}

interface Props {
  pieces: PieceStitches[];
  /** Extra offset per piece (the explode slider). */
  offsets?: Map<string, Vec3>;
  /** Ball radius in cm. */
  ballSize: number;
  shaping: boolean;
  colors: BallColors;
  hover: HoverRound | null;
  /** Fade every round except the hovered ones (the round peek). */
  fadeOthers?: boolean;
  onHover?(hit: { itemId: string; patternId: string; n: number; point: Vec3 } | null): void;
  onPick?(itemId: string, e: ThreeEvent<MouseEvent>): void;
}

/**
 * Each stitch is drawn as one point shaded like a little ball, so even big toys with
 * thousands of stitches redraw quickly. Shading uses a light fixed to the view.
 */
const vertexShader = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(2.0, size * uScale / -mv.z);
  }
`;
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    p.y = -p.y;
    float d = dot(p, p);
    if (d > 1.0) discard;
    vec3 n = vec3(p, sqrt(1.0 - d));
    vec3 light = normalize(vec3(0.45, 0.6, 0.65));
    float diff = max(dot(n, light), 0.0);
    float rim = smoothstep(0.75, 1.0, d);
    vec3 c = vColor * (0.42 + 0.68 * diff) * (1.0 - 0.25 * rim);
    c += vec3(0.10) * pow(max(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0), 12.0);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

export function StitchBalls({ pieces, offsets, ballSize, shaping, colors, hover, fadeOthers, onHover, onPick }: Props) {
  // Which piece and round each point belongs to, for hover and picking.
  const index = useMemo(() => {
    const out: { itemId: string; patternId: string; n: number; p: Vec3; kind: string; color: string }[] = [];
    for (const pc of pieces) for (const r of pc.rounds) r.points.forEach((p, i) => out.push({ itemId: pc.itemId, patternId: pc.patternId, n: r.n, p, kind: r.kinds[i]!, color: pc.color }));
    return out;
  }, [pieces]);

  const material = useMemo(() => new ShaderMaterial({ vertexShader, fragmentShader, uniforms: { uScale: { value: 1 } } }), []);
  const points = useMemo(() => {
    const pts = new Points(new BufferGeometry(), material);
    pts.frustumCulled = false;
    return pts;
  }, [material]);

  useLayoutEffect(() => {
    const n = index.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const c = new Color(), fade = new Color(colors.fade);
    const shade = { start: new Color(colors.start), inc: new Color(colors.inc), dec: new Color(colors.dec) };
    const hotColor = new Color(colors.hot);
    const anyHot = !!hover && index.some((b) => b.patternId === hover.patternId);
    index.forEach((b, i) => {
      const hot = !!hover && hover.patternId === b.patternId && b.n >= hover.from && b.n <= hover.to;
      const off = offsets?.get(b.itemId);
      pos[i * 3] = b.p[0] + (off?.[0] ?? 0);
      pos[i * 3 + 1] = b.p[1] + (off?.[1] ?? 0);
      pos[i * 3 + 2] = b.p[2] + (off?.[2] ?? 0);
      // Point size is the ball's diameter.
      size[i] = 2 * ballSize * (hot ? 1.4 : fadeOthers ? 0.8 : 1);
      if (hot) c.copy(hotColor);
      else {
        c.set(b.color);
        if (shaping && (b.kind === 'inc' || b.kind === 'dec' || b.kind === 'start')) c.lerp(shade[b.kind as 'inc' | 'dec' | 'start'], 0.8);
        if (fadeOthers) c.lerp(fade, 0.72);
        else if (anyHot) c.lerp(fade, 0.45);
      }
      c.toArray(col, i * 3);
    });
    const g = points.geometry;
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.setAttribute('size', new BufferAttribute(size, 1));
    g.computeBoundingSphere();
  }, [points, index, offsets, ballSize, shaping, colors, hover, fadeOthers]);

  // Points are sized in pixels: scale by the view so a ball stays the size of a stitch.
  const { size, viewport, raycaster } = useThree();
  useFrame(({ camera }) => {
    const fov = (camera as PerspectiveCamera).fov ?? 38;
    material.uniforms.uScale!.value = (size.height * viewport.dpr) / (2 * Math.tan((fov * Math.PI) / 360));
  });
  useEffect(() => {
    raycaster.params.Points = { threshold: ballSize };
  }, [raycaster, ballSize]);

  useEffect(() => () => { points.geometry.dispose(); material.dispose(); }, [points, material]);

  const last = useRef(-1);
  return (
    <primitive
      object={points}
      onPointerMove={onHover && ((e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const id = e.index ?? -1;
        if (id === last.current) return;
        last.current = id;
        const b = index[id];
        onHover(b ? { itemId: b.itemId, patternId: b.patternId, n: b.n, point: b.p } : null);
      })}
      onPointerOut={onHover && (() => { last.current = -1; onHover(null); })}
      onClick={onPick && ((e: ThreeEvent<MouseEvent>) => {
        const b = index[e.index ?? -1];
        if (b) { e.stopPropagation(); onPick(b.itemId, e); }
      })}
    />
  );
}
