import {
  commit, historyOf, parseProject, redo, serializeProject, starterProject, undo,
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
  selected: string | null;
  /** Waiting for a click on another shape to snap the selection onto. */
  placing: boolean;
  mode: GizmoMode;
}

type Action =
  | { type: 'edit'; project: Project; preview?: boolean; select?: string | null }
  | { type: 'settle' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; id: string | null }
  | { type: 'placing'; on: boolean }
  | { type: 'mode'; mode: GizmoMode };

function settle(s: State): State {
  if (!s.base) return s;
  return { ...s, base: null, h: commit({ ...s.h, present: s.base }, s.h.present) };
}

function keepSelection(s: State): State {
  const ok = s.selected && s.h.present.shapes.some((x) => x.id === s.selected);
  return ok ? s : { ...s, selected: null, placing: false };
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
      return { ...settle(s), selected: a.id, placing: false };
    case 'placing':
      return { ...s, placing: a.on && !!s.selected };
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
  return starterProject();
}

export interface Editor {
  project: Project;
  selected: string | null;
  placing: boolean;
  mode: GizmoMode;
  canUndo: boolean;
  canRedo: boolean;
  saved: 'saved' | 'pending' | 'unavailable';
  /** Replace the project with one undo step. */
  edit(project: Project, select?: string | null): void;
  /** Show a change mid-gesture; call settle() when the gesture ends. */
  preview(project: Project): void;
  settle(): void;
  undo(): void;
  redo(): void;
  select(id: string | null): void;
  setPlacing(on: boolean): void;
  setMode(mode: GizmoMode): void;
}

const Ctx = createContext<Editor | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [s, dispatch] = useReducer(reducer, undefined, () => ({
    h: historyOf(loadSaved()), base: null, selected: null, placing: false, mode: 'translate' as GizmoMode,
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
    placing: s.placing,
    mode: s.mode,
    canUndo: s.h.past.length > 0 || !!s.base,
    canRedo: s.h.future.length > 0,
    saved,
    edit: (p, select) => dispatch({ type: 'edit', project: p, select }),
    preview: (p) => dispatch({ type: 'edit', project: p, preview: true }),
    settle: () => dispatch({ type: 'settle' }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    select: (id) => dispatch({ type: 'select', id }),
    setPlacing: (on) => dispatch({ type: 'placing', on }),
    setMode: (mode) => dispatch({ type: 'mode', mode }),
  }), [project, s.selected, s.placing, s.mode, s.h.past.length, s.h.future.length, s.base, saved]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useEditor(): Editor {
  const e = useContext(Ctx);
  if (!e) throw new Error('useEditor outside EditorProvider');
  return e;
}
