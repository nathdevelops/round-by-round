import { fuseShapes, nextPieceId } from '@rbr/engine';
import { removeSelection, selectedShapes } from './state/actions';
import { useEffect } from 'react';
import { Stage } from './editor/Stage';
import { Inspector } from './panels/Inspector';
import { PatternPanel } from './panels/PatternPanel';
import { Shelf } from './panels/Shelf';
import { TopBar } from './panels/TopBar';
import { EditorProvider, useEditor } from './state/editor';

function Shortcuts() {
  const ed = useEditor();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); }
      else if (mod && k === 'y') { e.preventDefault(); ed.redo(); }
      else if (mod) return;
      else if (k === 'm') ed.setMode('translate');
      else if (k === 't') ed.setMode('rotate');
      else if (k === 'escape') { ed.select(null); ed.setMulti(false); }
      else if (k === 'f' && ed.selected.length > 1) {
        const { project, id } = fuseShapes(ed.project, selectedShapes(ed.project, ed.selected).map((s) => s.id), nextPieceId(ed.project));
        if (id) { ed.edit(project, [id]); ed.setMulti(false); }
      } else if ((k === 'delete' || k === 'backspace') && ed.selected.length) {
        e.preventDefault();
        ed.edit(removeSelection(ed.project, ed.selected), []);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed]);
  return null;
}

export function App() {
  return (
    <EditorProvider>
      <Shortcuts />
      <div className="app">
        <TopBar />
        <main className="workspace">
          <Shelf />
          <Stage />
          <aside className="side">
            <Inspector />
            <PatternPanel />
          </aside>
        </main>
      </div>
    </EditorProvider>
  );
}
