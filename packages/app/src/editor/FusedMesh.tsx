import { fusedBounds, fusedFieldXYZ, inFrameOf, type FusedPiece, type Shape } from '@rbr/engine';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

interface Props {
  piece: FusedPiece;
  shapes: Shape[];
  selected: boolean;
  /** A part is being adjusted: show the shell see-through so the part shows. */
  ghost: boolean;
  highlight: string;
  onPick(e: ThreeEvent<MouseEvent>): void;
}

const RES = 88;

/**
 * The outside of a fused piece as one surface: the union of its shapes, meshed with
 * marching cubes. This is the shell the single pattern is worked from.
 */
export function FusedMesh({ piece, shapes, selected, ghost, highlight, onPick }: Props) {
  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.92, metalness: 0 }), []);
  const mc = useMemo(() => {
    const m = new MarchingCubes(RES, material, false, false, 120000);
    m.isolation = 0;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  }, [material]);

  // Mesh the shell in the first shape's frame, so moving or turning the whole piece
  // only moves the mesh; it is rebuilt only when the parts change relative to each other.
  const frame = shapes[0]!.transform;
  const local = inFrameOf(shapes, frame);
  const r3 = (v: number) => Math.round(v * 1e4) / 1e4;
  const key = JSON.stringify(local.map((s) => [s.kind, s.params, s.transform.position.map(r3), s.transform.rotation.map(r3)]));
  useEffect(() => {
    const { center, half } = fusedBounds(local, 0.4);
    // The grid spans [-1, 1] in the object's own units and only its inner cells are meshed, so pad a little.
    const s = Math.max(...half) * (RES / (RES - 4));
    const f = fusedFieldXYZ(local);
    const h = RES / 2, field = mc.field;
    for (let z = 0; z < RES; z++) {
      const wz = center[2] + (s * (z - h)) / h;
      for (let y = 0; y < RES; y++) {
        const wy = center[1] + (s * (y - h)) / h;
        const row = z * RES * RES + y * RES;
        for (let x = 0; x < RES; x++) field[row + x] = -f(center[0] + (s * (x - h)) / h, wy, wz);
      }
    }
    mc.position.set(...center);
    mc.scale.setScalar(s);
    mc.update();
    mc.geometry.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mc, key]);

  useEffect(() => {
    material.color.set(piece.color);
    material.emissive.set(highlight);
    material.emissiveIntensity = selected ? 0.18 : 0;
    material.transparent = ghost;
    material.opacity = ghost ? 0.35 : 1;
    material.depthWrite = !ghost;
    material.needsUpdate = true;
  }, [material, piece.color, highlight, selected, ghost]);

  useEffect(() => () => { mc.geometry.dispose(); material.dispose(); }, [mc, material]);

  return (
    <group position={frame.position} quaternion={frame.rotation}>
      <primitive object={mc} onClick={onPick} userData={{ pieceId: piece.id }} />
    </group>
  );
}
