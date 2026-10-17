import { YARN_PRESETS, type PieceStitches, type Vec3 } from '@rbr/engine';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { createPortal } from 'react-dom';
import { useBallColors } from '../editor/Stage';
import { StitchBalls } from '../editor/StitchBalls';
import { useEditor } from '../state/editor';

interface Props {
  piece: PieceStitches;
  from: number;
  to: number;
  caption: string;
  /** The pattern row being hovered, to sit the pop-up beside. */
  anchor: DOMRect;
}

/**
 * Round peek: a small see-through view of one piece with the hovered round lit up,
 * so you can see where on the toy the round you're reading goes.
 */
export function RoundPeek({ piece, from, to, caption, anchor }: Props) {
  const { project } = useEditor();
  const colors = useBallColors();
  const yarn = YARN_PRESETS.find((y) => y.id === project.settings.yarnId) ?? YARN_PRESETS[3]!;

  // Frame the piece: look at its middle from far enough to see all of it.
  const pts = piece.rounds.flatMap((r) => r.points);
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, p[i]!); hi[i] = Math.max(hi[i]!, p[i]!); }
  const center = lo.map((v, i) => (v + hi[i]!) / 2) as Vec3;
  const radius = Math.max(1.5, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
  const dist = (radius / Math.sin((32 * Math.PI) / 360)) * 0.8;
  const dir = [0.45, 0.5, 0.74];
  const camPos = center.map((c, i) => c + dir[i]! * dist) as Vec3;

  const width = 280, height = 280;
  const left = Math.max(8, anchor.left - width - 12);
  const top = Math.min(window.innerHeight - height - 8, Math.max(8, anchor.top + anchor.height / 2 - height / 2));

  return createPortal(
    <div className="paper stitched peek" style={{ left, top }} role="tooltip">
      <div className="peek-canvas">
        <Canvas camera={{ position: camPos, fov: 32 }} dpr={[1, 2]}>
          <ambientLight intensity={0.8} color="#fff1dc" />
          <directionalLight position={[6, 12, 8]} intensity={1.4} color="#ffe9cc" />
          <StitchBalls pieces={[piece]} ballSize={yarn.gauge.stitchW * 0.42} shaping={false} colors={colors} hover={{ patternId: piece.patternId, from, to, source: 'pattern' }} fadeOthers />
          <OrbitControls target={center} autoRotate autoRotateSpeed={2.2} enableZoom={false} enablePan={false} enableRotate={false} />
        </Canvas>
      </div>
      <p>{caption}</p>
    </div>,
    document.body,
  );
}
