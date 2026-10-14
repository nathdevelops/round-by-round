/** A point on a side profile: r = distance from the crochet axis, z = height along it (cm). */
export interface ProfilePoint {
  r: number;
  z: number;
}

/** Gauge of one single crochet stitch, in cm. */
export interface Gauge {
  stitchW: number;
  rowH: number;
}

/**
 * How stitch counts are rounded.
 * - classic6: multiples of 6 (clean repeats, stair-stepped shape)
 * - balanced3: multiples of 3
 * - smooth: raw counts that follow the shape
 */
export type RoundingMode = 'classic6' | 'balanced3' | 'smooth';

export type Terms = 'US' | 'UK';

export interface StitchSettings {
  gauge: Gauge;
  /** Stuffed fabric stretches; 0.1 = 10%. */
  stretch: number;
  rounding: RoundingMode;
}

export type StitchKind = 'sc' | 'inc' | 'dec';

export interface Round {
  /** 1-based round number. */
  n: number;
  /** Stitches at the end of this round. */
  count: number;
  /** Stitches in the previous round (0 for round 1). */
  prev: number;
  /** count - prev. */
  delta: number;
  /** One entry per stitch made, in working order. */
  kinds: StitchKind[];
  /** Height of the round on the profile (cm). */
  z: number;
  /** Radius the shape wants here (cm). */
  rTarget: number;
  /** Radius the crocheted round will actually have (cm). */
  r: number;
  /** Distance along the surface from the start (cm). */
  s: number;
  /** True when the double/halve limit stopped the round from reaching its target. */
  clamped: boolean;
}

export interface PieceRounds {
  rounds: Round[];
  /** The profile ends on the axis, so the piece closes. */
  closedEnd: boolean;
  /** Row height actually used, after fitting rounds evenly to the surface. */
  rowH: number;
  /** Total surface length along the profile (cm). */
  length: number;
}

export interface PatternLine {
  label: string;
  text: string;
  count: number;
  kind: 'start' | 'plain' | 'inc' | 'dec';
  from: number;
  to: number;
}
