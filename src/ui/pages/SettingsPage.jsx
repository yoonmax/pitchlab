import { useRef, useState } from 'react';
import { useEditor, getEditor } from '../../state/editorStore.js';
import { setThemeMode } from '../../state/persistence.js';
import { backupAll, restoreBackup } from '../../state/actions.js';
import { DEFAULT_TOOL_KEYS, FIXED_SHORTCUTS } from '../../state/shortcuts.js';
import { TOOLS } from '../ToolRail.jsx';
import { Check, Field, SectionTitle, Segmented } from '../common.jsx';

export function ShortcutTable() {
  const keys = useEditor((s) => s.toolKeys) ?? DEFAULT_TOOL_KEYS;
  return (
    <div className="shortcut-columns">
      <div>
        <h4 className="minor">Tools</h4>
        <ul className="shortcuts">
          {TOOLS.filter((t) => !t.sep && keys[t.id]).map((t) => <li key={t.id}><kbd>{keys[t.id].toUpperCase()}</kbd><span>{t.label}</span></li>)}
        </ul>
      </div>
      <div>
        <h4 className="minor">Everything else</h4>
        <ul className="shortcuts">
          {FIXED_SHORTCUTS.map(([k, label]) => <li key={k}><kbd>{k}</kbd><span>{label}</span></li>)}
        </ul>
      </div>
    </div>
  );
}

function Rebinder() {
  const keys = useEditor((s) => s.toolKeys) ?? DEFAULT_TOOL_KEYS;
  const [listening, setListening] = useState(null);
  const [message, setMessage] = useState('');
  const assign = (id, key) => {
    const k = key.toLowerCase();
    if (!/^[a-z]$/.test(k) || k === 'k') { setMessage('Choose a letter other than K, which adds a keyframe.'); return; }
    const clash = Object.entries(keys).find(([tool, v]) => v === k && tool !== id);
    const next = { ...keys, [id]: k };
    if (clash) next[clash[0]] = keys[id];
    useEditor.setState({ toolKeys: next });
    setMessage(clash ? `Swapped with ${TOOLS.find((t) => t.id === clash[0])?.label}.` : '');
    setListening(null);
  };
  return (
    <>
      <ul className="rebind">
        {TOOLS.filter((t) => !t.sep && keys[t.id]).map((t) => (
          <li key={t.id}>
            <span>{t.label}</span>
            <button
              type="button" className={`keycap ${listening === t.id ? 'is-listening' : ''}`} aria-label={`Change shortcut for ${t.label}, currently ${keys[t.id]}`}
              onClick={() => setListening(t.id)}
              onKeyDown={(e) => { if (listening === t.id && e.key !== 'Tab') { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') setListening(null); else assign(t.id, e.key); } }}
              onBlur={() => setListening(null)}
            >{listening === t.id ? 'Press a key' : keys[t.id].toUpperCase()}</button>
          </li>
        ))}
      </ul>
      {message && <p className="field-hint" role="status">{message}</p>}
      <button type="button" className="linkbtn" onClick={() => { useEditor.setState({ toolKeys: { ...DEFAULT_TOOL_KEYS } }); setMessage(''); }}>Reset to the defaults</button>
    </>
  );
}

export function SettingsPage() {
  const themeMode = useEditor((s) => s.themeMode);
  const labelMode = useEditor((s) => s.labelMode);
  const pathMode = useEditor((s) => s.pathMode);
  const snapping = useEditor((s) => s.snapping);
  const advance = useEditor((s) => s.advanceAfterBall);
  const fileRef = useRef(null);
  const set = (patch) => useEditor.setState(patch);
  return (
    <main className="page settings" data-testid="settings">
      <div className="page-head"><h1>Settings</h1></div>
      <div className="settings-grid">
        <section>
          <SectionTitle>Appearance</SectionTitle>
          <Field label="Theme"><Segmented label="Theme" value={themeMode} onChange={setThemeMode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} /></Field>
          <Field label="Player labels">
            <Segmented label="Player labels" value={labelMode} onChange={(v) => set({ labelMode: v })} options={[{ value: 'number', label: 'Numbers only' }, { value: 'name', label: 'Names' }, { value: 'position', label: 'Positions' }]} />
          </Field>
          <Field label="Lines on the board">
            <Segmented label="Lines on the board" value={pathMode} onChange={(v) => set({ pathMode: v })} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Current only' }, { value: 'none', label: 'Hidden' }]} />
          </Field>
          <SectionTitle>Editing</SectionTitle>
          <div className="stack-sm">
            <Check checked={snapping} onChange={(v) => set({ snapping: v })} id="s-snap">Snap to players and alignment guides (hold Alt while dragging to turn off)</Check>
            <Check checked={advance} onChange={(v) => set({ advanceAfterBall: v })} id="s-adv">Move the playhead on after each ball action, so plays are quick to chain</Check>
          </div>
        </section>
        <section>
          <SectionTitle>Tool shortcuts</SectionTitle>
          <Rebinder />
        </section>
        <section>
          <SectionTitle>Your data</SectionTitle>
          <p className="prose">Plays are saved only in this browser, on this device. They do not sync. Clearing site data removes them, so export a backup for anything you want to keep.</p>
          <div className="action-row wrap">
            <button type="button" className="btn" data-testid="backup" onClick={async () => {
              const { downloadBlob } = await import('../../export/render.js');
              downloadBlob(new Blob([await backupAll()], { type: 'application/json' }), 'pitchlab-backup.json');
            }}>Export a backup</button>
            <button type="button" className="btn" onClick={() => fileRef.current.click()}>Restore a backup</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const n = await restoreBackup(await f.text());
                getEditor().toast(`Restored ${n} plays`);
              } catch (err) { getEditor().toast(err.message, { kind: 'warn' }); }
            }} />
          </div>
          <SectionTitle>About</SectionTitle>
          <p className="prose">pitchlab is open source under the MIT licence. Interface type is Schibsted Grotesk and shirt numbers are Barlow Condensed, both under the SIL Open Font Licence. Offside guidance follows the IFAB Laws of the Game 2026/27. Small-sided pitch and goal sizes follow FA Handbook section 38.</p>
        </section>
      </div>
    </main>
  );
}
