import {
  commit, historyOf, mushroomStarter, parseProject, redo, serializeProject, undo,
  type History, type Project,
} from '@rbr/engine';
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';

/**
 * Editor state: the project with undo/redo, the selection, and the current tool.
 * Drags and slider moves are "previews": they update what you see without adding
 * undo steps, then one `settle` turns the whole gesture into a single step.
 */
export type GizmoMode = 'translate' | 'rotate';

interface State {
  h: History<Project>;
  /** Project as it was before the gesture in progress, if any. */
  base: Project | null;
  /** Selected shape ids and fused piece ids. One shape inside a fused piece means "adjust that part". */
  selected: string[];
  mode: GizmoMode;
  /** "Pick several" is on: plain clicks add shapes to the selection instead of replacing it. */
  multi: boolean;
}

type Action =
  | { type: 'edit'; project: Project; preview?: boolean; select?: string[] }
  | { type: 'settle' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; ids: string[] }
  | { type: 'mode'; mode: GizmoMode }
  | { type: 'multi'; on: boolean };

function settle(s: State): State {
  if (!s.base) return s;
  return { ...s, base: null, h: commit({ ...s.h, present: s.base }, s.h.present) };
}

function keepSelection(s: State): State {
  const p = s.h.present;
  const kept = s.selected.filter((id) => p.shapes.some((x) => x.id === id) || p.fused.some((f) => f.id === id));
  return kept.length === s.selected.length ? s : { ...s, selected: kept };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'edit': {
      const sel = a.select === undefined ? s.selected : a.select;
      if (a.preview) return { ...s, base: s.base ?? s.h.present, h: { ...s.h, present: a.project }, selected: sel };
      const settled = settle(s);
      return keepSelection({ ...settled, h: commit(settled.h, a.project), selected: sel });
    }
    case 'settle':
      return settle(s);
    case 'undo':
      return keepSelection({ ...settle(s), h: undo(settle(s).h) });
    case 'redo':
      return keepSelection({ ...settle(s), h: redo(settle(s).h) });
    case 'select':
      return { ...settle(s), selected: a.ids };
    case 'multi':
      return { ...s, multi: a.on };
    case 'mode':
      return { ...s, mode: a.mode };
  }
}

const STORAGE_KEY = 'round-by-round.project.v1';

function loadSaved(): Project {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) return parseProject(text);
  } catch {
    // Storage blocked or the saved copy is unreadable: start fresh.
  }
  return mushroomStarter();
}

export interface Editor {
  project: Project;
  selected: string[];
  mode: GizmoMode;
  multi: boolean;
  canUndo: boolean;
  canRedo: boolean;
  saved: 'saved' | 'pending' | 'unavailable';
  /** Replace the project with one undo step, optionally changing the selection. */
  edit(project: Project, select?: string[]): void;
  /** Show a change mid-gesture; call settle() when the gesture ends. */
  preview(project: Project): void;
  settle(): void;
  undo(): void;
  redo(): void;
  /** Select one item, or with `add` toggle it in the current selection. */
  select(id: string | null, add?: boolean): void;
  setSelection(ids: string[]): void;
  setMode(mode: GizmoMode): void;
  setMulti(on: boolean): void;
}

const Ctx = createContext<Editor | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, undefined, () => ({
    h: historyOf(loadSaved()), base: null, selected: [] as string[], mode: 'translate' as GizmoMode, multi: false,
  }));
  const [saved, setSaved] = useState<Editor['saved']>('saved');
  const first = useRef(true);

  // Autosave to this browser a moment after the last change.
  const project = s.h.present;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved('pending');
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, serializeProject(project));
        setSaved('saved');
      } catch {
        setSaved('unavailable');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [project]);

  const api = useMemo<Editor>(() => ({
    project,
    selected: s.selected,
    mode: s.mode,
    multi: s.multi,
    canUndo: s.h.past.length > 0 || !!s.base,
    canRedo: s.h.future.length > 0,
    saved,
    edit: (p, select) => dispatch({ type: 'edit', project: p, select }),
    preview: (p) => dispatch({ type: 'edit', project: p, preview: true }),
    settle: () => dispatch({ type: 'settle' }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    select: (id, add) => dispatch({
      type: 'select',
      ids: id === null ? [] : add || s.multi ? (s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id]) : [id],
    }),
    setSelection: (ids) => dispatch({ type: 'select', ids }),
    setMode: (mode) => dispatch({ type: 'mode', mode }),
    setMulti: (on) => dispatch({ type: 'multi', on }),
  }), [project, s.selected, s.mode, s.multi, s.h.past.length, s.h.future.length, s.base, saved]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useEditor(): Editor {
  const e = useContext(Ctx);
  if (!e) throw new Error('useEditor outside EditorProvider');
  return e;
}
