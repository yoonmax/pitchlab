import { useEffect, useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { createDrillMeta, createDocument, addObject } from '../../core/document.js';
import { OBJECT_TYPES } from '../../core/document.js';
import { DRILL_CATALOG } from '../../core/data/drills.js';
import { uid } from '../../core/ids.js';
import { deleteSession, listDocuments, listSessions, saveDocument, saveSession } from '../../core/storage/repository.js';
import { useEditor, getEditor } from '../../state/editorStore.js';
import { camera } from '../../board/camera.js';
import { openDrillTemplate } from '../../state/actions.js';
import { Field, IconButton, NumberInput, SectionTitle, TextInput } from '../common.jsx';

const EQUIPMENT = ['cone', 'pole', 'mannequin', 'smallgoal', 'fullgoal', 'coach', 'ballprop'];
const FIELDS = [
  ['objective', 'Objective', 2], ['players', 'Number of players', 0], ['equipment', 'Equipment', 0], ['fieldSize', 'Field size', 0],
  ['instructions', 'Instructions', 4], ['coachingPoints', 'Coaching points', 4], ['progressions', 'Progressions', 3], ['variations', 'Variations', 3],
];

export function DrillsPanel() {
  const doc = useEditor((s) => s.doc);
  const commit = useEditor((s) => s.commit);
  const drill = doc.drill;
  const types = [...new Set(DRILL_CATALOG.map((d) => d.type))];
  const startBlank = () => {
    const d = createDocument({ fields: { title: 'New drill', kind: 'drill', category: 'Drills', drill: createDrillMeta() } });
    d.pitch.view = 'blank';
    d.pitch.theme = 'technical';
    getEditor().loadDoc(d, { fresh: true, keepSection: true });
  };
  const addProp = (type) => {
    let id;
    const c = { x: camera.cam.cx, y: camera.cam.cy };
    commit((d) => { id = addObject(d, { type, x: c.x + (Math.random() - 0.5) * 6, y: c.y + (Math.random() - 0.5) * 6 }); });
    getEditor().select({ objects: [id] });
  };
  const set = (k, v) => commit((d) => {
    if (!d.drill) d.drill = createDrillMeta();
    d.drill[k] = v;
  });
  return (
    <>
      <SectionTitle action={<button type="button" className="btn btn-sm" data-testid="new-drill" onClick={startBlank}><Plus size={13} aria-hidden="true" /> New drill</button>}>Templates</SectionTitle>
      {types.map((t) => (
        <details key={t} className="disclosure" open={t === 'Rondos'}>
          <summary>{t}</summary>
          <ul className="linklist">
            {DRILL_CATALOG.filter((d) => d.type === t).map((d) => (
              <li key={d.id}><button type="button" data-testid={`drill-${d.id}`} onClick={() => openDrillTemplate(d.id)}><span>{d.label}</span></button></li>
            ))}
          </ul>
        </details>
      ))}
      <SectionTitle>Add equipment</SectionTitle>
      <div className="action-row wrap">
        {EQUIPMENT.map((t) => <button type="button" key={t} className="btn btn-sm" data-testid={`add-${t}`} onClick={() => addProp(t)}>{OBJECT_TYPES[t].label}</button>)}
      </div>
      <p className="field-hint">Add players from the plus tool in the toolbar. Use Run and Pass to animate the drill.</p>
      {drill ? (
        <>
          <SectionTitle>Drill details</SectionTitle>
          <Field label="Name" htmlFor="drill-name"><TextInput id="drill-name" value={doc.title} onCommit={(v) => commit((d) => { d.title = v || 'Untitled drill'; })} /></Field>
          <Field label="Duration"><NumberInput value={drill.durationMin} unit="min" step={1} min={0} max={600} onCommit={(v) => set('durationMin', v)} /></Field>
          {FIELDS.map(([k, label, rows]) => (
            <Field key={k} label={label} htmlFor={`drill-${k}`}>
              <TextInput id={`drill-${k}`} multiline={rows > 0} rows={rows} value={drill[k]} onCommit={(v) => set(k, v)} />
            </Field>
          ))}
        </>
      ) : (
        <button type="button" className="btn" onClick={() => commit((d) => { d.kind = 'drill'; d.category = 'Drills'; d.drill = createDrillMeta(); })}>Add drill details to this play</button>
      )}
    </>
  );
}

/** A training session is an ordered list of saved drills, in the library. */
export function SessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [drills, setDrills] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const refresh = async () => {
    const list = await listSessions();
    setSessions(list.sort((a, b) => b.updatedAt - a.updatedAt));
    const docs = await listDocuments();
    setDrills(docs.filter((d) => d.kind === 'drill' || d.drill));
  };
  useEffect(() => { refresh().catch(() => {}); }, []);
  const active = sessions.find((s) => s.id === activeId) ?? null;
  const update = async (patch) => {
    await saveSession({ ...active, ...patch });
    await refresh();
  };
  const create = async () => {
    const s = { id: uid('s'), title: 'New training session', notes: '', drills: [] };
    await saveSession(s);
    setActiveId(s.id);
    await refresh();
  };
  const addTemplate = async (entry) => {
    const { buildExample } = await import('../../core/data/examples.js');
    const doc = entry.build ? entry.build() : buildExample(entry.example);
    await saveDocument(doc);
    await update({ drills: [...(active.drills ?? []), doc.id] });
    await refresh();
  };
  const total = active ? (active.drills ?? []).reduce((sum, id) => sum + (drills.find((d) => d.id === id)?.drill?.durationMin ?? 0), 0) : 0;
  return (
    <div className="sessions">
      <div className="sessions-list">
        <button type="button" className="btn" data-testid="new-session" onClick={create}><Plus size={14} aria-hidden="true" /> New session</button>
        {sessions.length === 0 && <p className="empty">Build a training session from drills, then print it as a plan.</p>}
        <ul className="linklist">
          {sessions.map((s) => (
            <li key={s.id}><button type="button" className={activeId === s.id ? 'is-sel' : ''} onClick={() => setActiveId(s.id)}><span>{s.title}</span><small>{(s.drills ?? []).length} drills</small></button></li>
          ))}
        </ul>
      </div>
      {active ? (
        <div className="sessions-detail">
          <Field label="Session name" htmlFor="session-title"><TextInput id="session-title" value={active.title} onCommit={(v) => update({ title: v || 'Untitled session' })} /></Field>
          <Field label="Notes" htmlFor="session-notes"><TextInput id="session-notes" multiline value={active.notes} onCommit={(v) => update({ notes: v })} /></Field>
          <SectionTitle action={<span className="tag">{total} minutes</span>}>Drills in this session</SectionTitle>
          {(active.drills ?? []).length === 0 && <p className="empty">Add a saved drill or a template below.</p>}
          <ol className="session-drills">
            {(active.drills ?? []).map((id, i) => {
              const d = drills.find((x) => x.id === id);
              return (
                <li key={`${id}-${i}`}>
                  <span>{d?.title ?? 'Missing drill'}</span>
                  <small>{d?.drill?.durationMin ?? 0} min</small>
                  <IconButton icon={Trash2} size={14} label="Remove from session" onClick={() => update({ drills: active.drills.filter((_, n) => n !== i) })} />
                </li>
              );
            })}
          </ol>
          <div className="action-row wrap">
            <select className="input input-sm" aria-label="Add a saved drill" value="" onChange={(e) => { if (e.target.value) update({ drills: [...(active.drills ?? []), e.target.value] }); }}>
              <option value="">Add a saved drill</option>
              {drills.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
            </select>
            <select className="input input-sm" aria-label="Add a drill template" data-testid="session-add-template" value="" onChange={(e) => { const entry = DRILL_CATALOG.find((d) => d.id === e.target.value); if (entry) addTemplate(entry); }}>
              <option value="">Add a template</option>
              {DRILL_CATALOG.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div className="action-row">
            <button type="button" className="btn" data-testid="print-session" disabled={!(active.drills ?? []).length} onClick={() => getEditor().openModal({ type: 'print', session: active, drills: active.drills.map((id) => drills.find((d) => d.id === id)).filter(Boolean) })}><Printer size={14} aria-hidden="true" /> Print plan</button>
            <button type="button" className="btn" onClick={async () => { await deleteSession(active.id); setActiveId(null); await refresh(); }}><Trash2 size={14} aria-hidden="true" /> Delete session</button>
          </div>
        </div>
      ) : <div className="sessions-detail"><p className="empty">Select or create a session.</p></div>}
    </div>
  );
}

