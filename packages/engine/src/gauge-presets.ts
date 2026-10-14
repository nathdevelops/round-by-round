import type { Gauge } from './types';

export interface YarnPreset {
  id: string;
  label: string;
  /** Hook sizes in mm that suit amigurumi with this yarn (tighter than the yarn label). */
  hooksMm: number[];
  defaultHookMm: number;
  gauge: Gauge;
}

// TODO(calibrate): placeholder gauges. Replace with measured swatches (sc, tight amigurumi tension)
// once test pieces are crocheted; see fixtures/README.md.
export const YARN_PRESETS: YarnPreset[] = [
  { id: 'fingering', label: 'Fingering', hooksMm: [2, 2.25, 2.5], defaultHookMm: 2.25, gauge: { stitchW: 0.3, rowH: 0.28 } },
  { id: 'sport', label: 'Sport', hooksMm: [2.5, 2.75, 3], defaultHookMm: 2.75, gauge: { stitchW: 0.36, rowH: 0.33 } },
  { id: 'dk', label: 'DK', hooksMm: [3, 3.25, 3.5], defaultHookMm: 3, gauge: { stitchW: 0.42, rowH: 0.38 } },
  { id: 'worsted', label: 'Worsted', hooksMm: [3.5, 3.75, 4], defaultHookMm: 3.5, gauge: { stitchW: 0.5, rowH: 0.45 } },
  { id: 'bulky', label: 'Bulky', hooksMm: [4.5, 5, 5.5], defaultHookMm: 5, gauge: { stitchW: 0.75, rowH: 0.65 } },
  { id: 'super-bulky', label: 'Super bulky', hooksMm: [6, 7, 8], defaultHookMm: 7, gauge: { stitchW: 1.1, rowH: 0.95 } },
];

/** Gauge from a measured swatch: "X sc and Y rounds in 10 cm". */
export function gaugeFromSwatch(stitchesPer10cm: number, roundsPer10cm: number): Gauge {
  return { stitchW: 10 / stitchesPer10cm, rowH: 10 / roundsPer10cm };
}
