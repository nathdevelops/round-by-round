import { displayProfile, shapeHeight, shapeRadius, type Shape } from '@rbr/engine';
import { Outlines } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { forwardRef, useMemo } from 'react';
import { LatheGeometry, Vector2, type Group } from 'three';
import { knitBump } from './knit';

interface Props {
  shape: Shape;
  selected: boolean;
  highlight: string;
  onPick(e: ThreeEvent<MouseEvent>): void;
}

/** One shape: its profile spun into a solid, wearing a knit-textured yarn colour. */
export const ShapeMesh = forwardRef<Group, Props>(function ShapeMesh({ shape, selected, highlight, onPick }, ref) {
  const paramsKey = JSON.stringify(shape.params);
  const geometry = useMemo(() => {
    const pts = displayProfile(shape).map((p) => new Vector2(p.r, p.y));
    const g = new LatheGeometry(pts, 72);
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.kind, paramsKey]);

  // Roughly one texture V per stitch of worsted yarn.
  const bump = useMemo(() => {
    const t = knitBump().clone();
    const around = Math.max(6, Math.round((2 * Math.PI * shapeRadius(shape)) / 0.5 / 2));
    const along = Math.max(3, Math.round((shapeHeight(shape) * 1.4) / 0.45 / 2));
    t.repeat.set(around, along);
    t.needsUpdate = true;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.kind, paramsKey]);

  const { position, rotation } = shape.transform;
  return (
    <group ref={ref} position={position} quaternion={rotation} onClick={onPick} userData={{ shapeId: shape.id }}>
      <mesh geometry={geometry} castShadow receiveShadow userData={{ shapeId: shape.id }}>
        <meshStandardMaterial color={shape.color} roughness={0.92} metalness={0} bumpMap={bump} bumpScale={1.2} emissive={highlight} emissiveIntensity={selected ? 0.22 : 0} />
        {selected && <Outlines thickness={0.08} color={highlight} />}
      </mesh>
    </group>
  );
});
