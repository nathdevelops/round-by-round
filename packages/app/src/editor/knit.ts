import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * A bump texture of crochet-like V stitches, drawn once on a canvas.
 * It is texture only; real stitch balls come with the stitch preview (M4).
 */
let cached: CanvasTexture | null = null;

export function knitBump(): CanvasTexture {
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 64, 64);
  // Two V loops per tile, light on top, shadow in the gaps.
  for (const ox of [0, 32]) {
    for (const [dx, flip] of [[0, 1], [16, -1]] as const) {
      const grad = g.createLinearGradient(ox + dx, 0, ox + dx + 16 * flip, 0);
      grad.addColorStop(0, '#5a5a5a');
      grad.addColorStop(0.5, '#e0e0e0');
      grad.addColorStop(1, '#5a5a5a');
      g.strokeStyle = grad;
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(ox + dx + 4 * flip + (flip < 0 ? 16 : 0), 6);
      g.lineTo(ox + 16, 58);
      g.stroke();
    }
  }
  cached = new CanvasTexture(c);
  cached.wrapS = cached.wrapT = RepeatWrapping;
  cached.colorSpace = SRGBColorSpace;
  return cached;
}
