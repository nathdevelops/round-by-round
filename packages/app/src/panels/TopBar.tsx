import { emptyProject, parseProject, serializeProject, starterProject, ProjectFileError } from '@rbr/engine';
import { useRef, useState } from 'react';
import { useEditor } from '../state/editor';

type Dialog = null | 'save' | 'open' | 'new';

const fileName = (name: string) => `${name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'project'}.rbr.json`;

export function TopBar() {
  const ed = useEditor();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const text = dialog === 'save' ? serializeProject(ed.project) : '';

  const open = (t: string) => {
    try {
      ed.edit(parseProject(t), null);
      setDialog(null);
      setPaste('');
      setError('');
    } catch (e) {
      setError(e instanceof ProjectFileError ? e.message : 'That file could not be opened.');
    }
  };

  const close = () => { setDialog(null); setError(''); setCopied(false); };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="wordmark">Round by Round</span>
        <input type="text" id="project-name" aria-label="Project name" className="project-name" value={ed.project.name}
          onChange={(e) => ed.preview({ ...ed.project, name: e.target.value })} onBlur={() => ed.settle()} />
      </div>
      <div className="bar-actions">
        <button type="button" className="btn quiet small" onClick={ed.undo} disabled={!ed.canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" className="btn quiet small" onClick={ed.redo} disabled={!ed.canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <span className="divider" aria-hidden="true" />
        <button type="button" className="btn quiet small" onClick={() => setDialog('new')}>New</button>
        <button type="button" className="btn quiet small" onClick={() => setDialog('open')}>Open</button>
        <button type="button" className="btn small" onClick={() => setDialog('save')}>Save</button>
        <span className="meta saved" aria-live="polite">
          {ed.saved === 'saved' ? 'Kept in this browser' : ed.saved === 'pending' ? 'Saving…' : 'This browser won’t keep it; use Save'}
        </span>
      </div>

      {dialog && (
        <div className="scrim" role="presentation" onClick={close}>
          <div className="paper stitched dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
            {dialog === 'save' && (
              <>
                <h2 id="dlg-title">Save project</h2>
                <p className="meta">Your work is kept in this browser automatically. Save a file to move it to another computer or share it.</p>
                <div className="row">
                  <a className="btn" href={URL.createObjectURL(new Blob([text], { type: 'application/json' }))} download={fileName(ed.project.name)}>Download file</a>
                  <button type="button" className="btn quiet" onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false))}>{copied ? 'Copied' : 'Copy as text'}</button>
                </div>
                <textarea id="save-text" readOnly rows={6} value={text} aria-label="Project file text" onFocus={(e) => e.currentTarget.select()} />
              </>
            )}
            {dialog === 'open' && (
              <>
                <h2 id="dlg-title">Open project</h2>
                <p className="meta">Pick a .rbr.json file, or paste project text. You can undo this.</p>
                <div className="row">
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Choose file</button>
                  <input ref={fileRef} type="file" id="open-file" accept=".json,application/json" hidden onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) open(await f.text());
                    e.target.value = '';
                  }} />
                </div>
                <textarea id="open-text" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="…or paste project text here" aria-label="Paste project text" />
                {error && <p className="error" role="alert">{error}</p>}
                <div className="row"><button type="button" className="btn quiet" disabled={!paste.trim()} onClick={() => open(paste)}>Open pasted text</button></div>
              </>
            )}
            {dialog === 'new' && (
              <>
                <h2 id="dlg-title">Start something new</h2>
                <p className="meta">You can undo this if you change your mind.</p>
                <div className="row">
                  <button type="button" className="btn" onClick={() => { ed.edit(emptyProject(), null); close(); }}>Blank table</button>
                  <button type="button" className="btn quiet" onClick={() => { ed.edit(starterProject(), null); close(); }}>Mushroom to start from</button>
                </div>
              </>
            )}
            <button type="button" className="btn quiet small close" onClick={close}>Close</button>
          </div>
        </div>
      )}
    </header>
  );
}
