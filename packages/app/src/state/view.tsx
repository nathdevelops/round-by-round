import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * How the stage shows the project: the shapes (Model) or one ball per stitch (Stitches),
 * plus the round being pointed at, shared by the stage and the pattern so each can
 * highlight what the other is hovering.
 */
export type ViewMode = 'model' | 'stitches';

export interface HoverRound {
  /** The piece whose pattern the round belongs to (mirrored copies share it). */
  patternId: string;
  /** Rounds covered: one round from the stage, or a pattern line's range. */
  from: number;
  to: number;
  /** Where the pointer is: the stage scrolls the pattern to the round, the pattern doesn't scroll itself. */
  source: 'stage' | 'pattern';
}

export interface ViewState {
  mode: ViewMode;
  setMode(m: ViewMode): void;
  shaping: boolean;
  setShaping(on: boolean): void;
  /** 0 = sewn together, 1 = pulled well apart. */
  explode: number;
  setExplode(v: number): void;
  hover: HoverRound | null;
  setHover(h: HoverRound | null): void;
}

const Ctx = createContext<ViewState | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ViewMode>('model');
  const [shaping, setShaping] = useState(true);
  const [explode, setExplode] = useState(0);
  const [hover, setHover] = useState<HoverRound | null>(null);
  const v = useMemo(() => ({ mode, setMode, shaping, setShaping, explode, setExplode, hover, setHover }), [mode, shaping, explode, hover]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useView(): ViewState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useView outside ViewProvider');
  return v;
}

export const sameHover = (a: HoverRound | null, b: HoverRound | null) =>
  a === b || (!!a && !!b && a.patternId === b.patternId && a.from === b.from && a.to === b.to && a.source === b.source);
