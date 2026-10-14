import { pieceOf, shapeHeight, updateShape, type Project, type Quat, type ShapeKind, type Vec3 } from '@rbr/engine';
import { ContactShadows, OrbitControls, TransformControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Matrix4, Object3D, Plane, Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import { addShapeOf, isEditingPart, selectedShapes } from '../state/actions';
import { useEditor } from '../state/editor';
import { FusedMesh } from './FusedMesh';
import { ShapeMesh } from './ShapeMesh';
import { useThemeColor } from './theme-color';

/** Drop target: turns a screen point into a spot on the table. */
type DropFn = (clientX: number, clientY: number) => Vec3 | null;

function DropProbe({ probe }: { probe: MutableRefObject<DropFn | null> }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    probe.current = (x, y) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      const ray = new Raycaster();
      ray.setFromCamera(ndc, camera);
      const table = new Vector3();
      if (!ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), table)) return null;
      return table.toArray().map((v) => Math.round(v * 10) / 10) as Vec3;
    };
    return () => { probe.current = null; };
  }, [camera, gl, probe]);
  return null;
}

export const SHAPE_DRAG_TYPE = 'application/x-rbr-shape';

const ONE = new Vector3(1, 1, 1);
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function Stage() {
  const ed = useEditor();
  const { project, selected, mode } = ed;
  const probe = useRef<DropFn | null>(null);
  const highlight = useThemeColor('--camel');
  const [dragOver, setDragOver] = useState(false);

  // The gizmo drives an invisible pivot; whatever is selected follows it as one block.
  const pivot = useMemo(() => new Object3D(), []);
  const members = selectedShapes(project, selected);
  const drag = useRef<{ inv: Matrix4; base: Project; parts: { id: string; m: Matrix4 }[] } | null>(null);
  const membersKey = JSON.stringify(members.map((s) => [s.id, s.transform, s.kind, s.params]));

  useLayoutEffect(() => {
    if (drag.current || !members.length) return;
    if (members.length === 1) {
      // One shape turns about its own base.
      const t = members[0]!.transform;
      pivot.position.set(...t.position);
      pivot.quaternion.set(...t.rotation);
    } else {
      // Several shapes turn about the middle of the group.
      const c = new Vector3();
      for (const s of members) {
        const axis = new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...s.transform.rotation));
        c.add(new Vector3(...s.transform.position).addScaledVector(axis, shapeHeight(s) / 2));
      }
      pivot.position.copy(c.divideScalar(members.length));
      pivot.quaternion.identity();
    }
    pivot.updateMatrixWorld();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivot, membersKey]);

  const startDrag = () => {
    drag.current = {
      inv: new Matrix4().compose(pivot.position, pivot.quaternion, ONE).invert(),
      base: project,
      parts: members.map((s) => ({
        id: s.id,
        m: new Matrix4().compose(new Vector3(...s.transform.position), new Quaternion(...s.transform.rotation), ONE),
      })),
    };
  };

  const onGizmoChange = () => {
    const d = drag.current;
    if (!d) return;
    const delta = new Matrix4().compose(pivot.position, pivot.quaternion, ONE).multiply(d.inv);
    const pos = new Vector3(), quat = new Quaternion(), scl = new Vector3();
    // A single loose shape keeps its mirror partner in step; a moved group moves as it is.
    const mirror = d.parts.length === 1;
    let next = d.base;
    for (const part of d.parts) {
      new Matrix4().multiplyMatrices(delta, part.m).decompose(pos, quat, scl);
      const s = next.shapes.find((x) => x.id === part.id)!;
      next = updateShape(next, part.id, {
        transform: { position: pos.toArray().map(round3) as Vec3, rotation: quat.toArray() as Quat, scale: s.transform.scale },
      }, mirror);
    }
    ed.preview(next);
  };

  const additive = (e: ThreeEvent<MouseEvent>) => e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey;
  const pick = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    ed.select(id, additive(e));
  };

  const editingPart = isEditingPart(project, selected) ? selected[0]! : null;
  const editingPiece = editingPart ? pieceOf(project, editingPart)!.id : null;
  const loose = project.shapes.filter((s) => !pieceOf(project, s.id));

  return (
    <div
      className={`stage paper${dragOver ? ' drag-over' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(SHAPE_DRAG_TYPE)) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        const kind = e.dataTransfer.getData(SHAPE_DRAG_TYPE) as ShapeKind;
        if (!kind) return;
        e.preventDefault();
        const { project: next, id } = addShapeOf(project, kind, probe.current?.(e.clientX, e.clientY) ?? undefined);
        ed.edit(next, [id]);
      }}
    >
      <Canvas shadows camera={{ position: [10, 9, 14], fov: 38 }} dpr={[1, 2]} onPointerMissed={(e) => { if (!(e.shiftKey || e.ctrlKey || e.metaKey)) ed.select(null); }}>
        <ambientLight intensity={0.55} color="#fff1dc" />
        <hemisphereLight args={['#fff4e2', '#8a6d52', 0.9]} />
        <directionalLight
          position={[6, 12, 8]} intensity={1.8} color="#ffe9cc" castShadow
          shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.03}
          shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20} shadow-camera-far={60}
        />
        <directionalLight position={[-8, 4, -6]} intensity={0.35} color="#c9d8e8" />
        {loose.map((s) => (
          <ShapeMesh key={s.id} shape={s} selected={selected.includes(s.id)} highlight={highlight} onPick={pick(s.id)} />
        ))}
        {project.fused.map((f) => (
          <FusedMesh
            key={f.id} piece={f}
            shapes={project.shapes.filter((s) => f.shapeIds.includes(s.id))}
            selected={selected.includes(f.id)} ghost={editingPiece === f.id}
            highlight={highlight} onPick={pick(f.id)}
          />
        ))}
        {editingPart && (() => {
          const s = project.shapes.find((x) => x.id === editingPart)!;
          return <ShapeMesh shape={{ ...s, color: pieceOf(project, s.id)!.color }} selected highlight={highlight} onPick={pick(s.id)} />;
        })()}
        <primitive object={pivot} />
        <ContactShadows position={[0, -0.02, 0]} opacity={0.35} scale={40} blur={2.4} far={14} />
        <DropProbe probe={probe} />
        {members.length > 0 && (
          <TransformControls
            object={pivot} mode={mode} size={0.8}
            onMouseDown={startDrag} onObjectChange={onGizmoChange}
            onMouseUp={() => { drag.current = null; ed.settle(); }}
          />
        )}
        <OrbitControls makeDefault target={[0, 2.5, 0]} minDistance={4} maxDistance={60} />
      </Canvas>
      <div className="stage-tools">
        <div className="seg" role="radiogroup" aria-label="Gizmo">
          <label title="Move (M)"><input type="radio" name="gizmo" id="gizmo-move" checked={mode === 'translate'} onChange={() => ed.setMode('translate')} />Move</label>
          <label title="Turn (T)"><input type="radio" name="gizmo" id="gizmo-turn" checked={mode === 'rotate'} onChange={() => ed.setMode('rotate')} />Turn</label>
        </div>
      </div>
      {!project.shapes.length && <p className="stage-hint note">drag a shape off the shelf to start</p>}
      {project.shapes.length > 1 && !project.fused.length && selected.length < 2 && (
        <p className="stage-hint note">shift-click shapes to pick several, then fuse them</p>
      )}
    </div>
  );
}
