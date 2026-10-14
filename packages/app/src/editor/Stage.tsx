import { updateShape, type ShapeKind, type Vec3 } from '@rbr/engine';
import { ContactShadows, OrbitControls, TransformControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Plane, Raycaster, Vector2, Vector3, type Group, type Object3D } from 'three';
import { addShapeOf, snapOnto } from '../state/actions';
import { useEditor } from '../state/editor';
import { ShapeMesh } from './ShapeMesh';
import { useThemeColor } from './theme-color';

/** Drop target: turns a screen point into "on this shape, here, facing this way" or a spot on the table. */
type DropFn = (clientX: number, clientY: number) => { point: Vec3; normal?: Vec3; hostId?: string } | null;

function DropProbe({ probe }: { probe: MutableRefObject<DropFn | null> }) {
  const { camera, scene, gl } = useThree();
  useEffect(() => {
    probe.current = (x, y) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      const ray = new Raycaster();
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.userData.shapeId && h.face);
      if (hit && hit.face) {
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        return { point: hit.point.toArray() as Vec3, normal: n.toArray() as Vec3, hostId: hit.object.userData.shapeId as string };
      }
      const table = new Vector3();
      if (ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), table)) return { point: table.toArray().map((v) => Math.round(v * 10) / 10) as Vec3 };
      return null;
    };
    return () => { probe.current = null; };
  }, [camera, scene, gl, probe]);
  return null;
}

export const SHAPE_DRAG_TYPE = 'application/x-rbr-shape';

export function Stage() {
  const ed = useEditor();
  const { project, selected, placing, mode } = ed;
  const [target, setTarget] = useState<Object3D | null>(null);
  const probe = useRef<DropFn | null>(null);
  const highlight = useThemeColor('--camel');
  const [dragOver, setDragOver] = useState(false);

  // The gizmo follows the selected shape's object; its mesh hands it over through a ref callback.
  useEffect(() => { if (!selected) setTarget(null); }, [selected]);

  const pick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (placing && selected && id !== selected) {
      const n = e.face ? e.face.normal.clone().transformDirection(e.object.matrixWorld) : new Vector3(0, 1, 0);
      ed.edit(snapOnto(project, selected, id, e.point.toArray() as Vec3, n.toArray() as Vec3));
      ed.setPlacing(false);
      return;
    }
    ed.select(id);
  };

  const onGizmoChange = () => {
    if (!selected || !target) return;
    const s = project.shapes.find((x) => x.id === selected);
    if (!s) return;
    const r = (v: number) => Math.round(v * 1000) / 1000;
    ed.preview(updateShape(project, selected, {
      transform: {
        position: target.position.toArray().map(r) as Vec3,
        rotation: target.quaternion.toArray() as [number, number, number, number],
        scale: s.transform.scale,
      },
    }));
  };

  return (
    <div
      className={`stage paper${placing ? ' placing' : ''}${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const kind = e.dataTransfer.getData(SHAPE_DRAG_TYPE) as ShapeKind;
        if (!kind) return;
        e.preventDefault();
        const at = probe.current?.(e.clientX, e.clientY) ?? undefined;
        const { project: next, id } = addShapeOf(project, kind, at);
        ed.edit(next, id);
      }}
    >
      <Canvas shadows camera={{ position: [10, 9, 14], fov: 38 }} dpr={[1, 2]} onPointerMissed={() => (placing ? ed.setPlacing(false) : ed.select(null))}>
        <ambientLight intensity={0.55} color="#fff1dc" />
        <hemisphereLight args={['#fff4e2', '#8a6d52', 0.9]} />
        <directionalLight position={[6, 12, 8]} intensity={1.8} color="#ffe9cc" castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-8, 4, -6]} intensity={0.35} color="#c9d8e8" />
        {project.shapes.map((s) => (
          <ShapeMesh
            key={s.id}
            ref={s.id === selected ? (g: Group | null) => setTarget(g) : undefined}
            shape={s} selected={s.id === selected} highlight={highlight} onPick={pick(s.id)}
          />
        ))}
        <ContactShadows position={[0, -0.02, 0]} opacity={0.35} scale={40} blur={2.4} far={14} />
        <DropProbe probe={probe} />
        {target?.parent && selected && project.shapes.some((x) => x.id === selected) && !placing && (
          <TransformControls object={target} mode={mode} size={0.8} onObjectChange={onGizmoChange} onMouseUp={() => ed.settle()} />
        )}
        <OrbitControls makeDefault target={[0, 2.5, 0]} minDistance={4} maxDistance={60} />
      </Canvas>
      <div className="stage-tools">
        <div className="seg" role="radiogroup" aria-label="Gizmo">
          <label title="Move (M)"><input type="radio" name="gizmo" id="gizmo-move" checked={mode === 'translate'} onChange={() => ed.setMode('translate')} />Move</label>
          <label title="Turn (T)"><input type="radio" name="gizmo" id="gizmo-turn" checked={mode === 'rotate'} onChange={() => ed.setMode('rotate')} />Turn</label>
        </div>
      </div>
      {placing && <p className="stage-hint note">click the shape to sew it onto, or press Esc</p>}
      {!project.shapes.length && <p className="stage-hint note">drag a shape off the shelf to start</p>}
    </div>
  );
}
