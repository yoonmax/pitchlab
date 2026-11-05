import { useRef, useState } from 'react';
import { Copy, Download, Eye, Trash2, Upload, UserPlus } from 'lucide-react';
import { CORE_FORMATION_IDS, FORMATIONS, formationsForPlayers, getFormation } from '../../core/formations/catalog.js';
import { addSubstitute, validateFormation } from '../../core/formations/engine.js';
import { saveFormation } from '../../core/storage/repository.js';
import { uid } from '../../core/ids.js';
import { PITCH_PRESETS } from '../../core/pitch/geometry.js';
import { useEditor, getEditor } from '../../state/editorStore.js';
import { animateShapeChange, applyFormationToTeam, refreshFormations, removeFormation, saveCurrentAsFormation } from '../../state/actions.js';
import { Field, IconButton, SectionTitle, Segmented } from '../common.jsx';

function FormationGlyph({ formation }) {
  return (
    <svg viewBox="0 0 44 30" aria-hidden="true" className="fglyph">
      <rect x="0.5" y="0.5" width="43" height="29" rx="1.5" fill="none" stroke="currentColor" strokeOpacity="0.25" />
      {formation.slots.map((s, i) => (
        <circle key={i} cx={1 + (s.d / 1.45) * 42} cy={1 + s.w * 28} r={s.role === 'GK' ? 1.2 : 1.6} fill="currentColor" fillOpacity={s.role === 'GK' ? 0.5 : 1} />
      ))}
    </svg>
  );
}

function FormationGrid({ list, team, current, ghost }) {
  return (
    <div className="fgrid">
      {list.map((f) => (
        <div key={f.id} className={`fcard ${current === f.id ? 'is-on' : ''}`}>
          <button type="button" className="fcard-main" data-testid={`formation-${f.id}`} aria-pressed={current === f.id} onClick={() => applyFormationToTeam(team, f.id)}>
            <FormationGlyph formation={f} />
            <span>{f.name}</span>
          </button>
          <button
            type="button" className={`fcard-compare ${ghost?.id === f.id ? 'is-on' : ''}`} aria-label={`Compare with ${f.name}`} aria-pressed={ghost?.id === f.id} title="Compare on the pitch. Dragged players snap to these positions."
            onClick={() => getEditor().setGhost(ghost?.id === f.id ? null : { id: f.id, team })}
          ><Eye size={13} aria-hidden="true" /></button>
        </div>
      ))}
    </div>
  );
}

export function FormationsPanel() {
  const doc = useEditor((s) => s.doc);
  const custom = useEditor((s) => s.customFormations);
  const ghost = useEditor((s) => s.ghost);
  const [team, setTeam] = useState('home');
  const [name, setName] = useState('');
  const [fromShape, setFromShape] = useState('3-2-5');
  const [duration, setDuration] = useState(1.8);
  const fileRef = useRef(null);
  const current = doc.teams[team].formation;
  const players = PITCH_PRESETS[doc.pitch.preset]?.players ?? 11;
  const list = players === 11 ? CORE_FORMATION_IDS.map((id) => getFormation(id)) : formationsForPlayers(players);
  const shapes = FORMATIONS.filter((f) => f.shape);
  const allShapes = [...list, ...shapes, ...custom];
  const onImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let raw;
    try { raw = JSON.parse(await file.text()); } catch { getEditor().toast('That file is not valid JSON.', { kind: 'warn' }); return; }
    const res = validateFormation(raw);
    if (!res.ok) { getEditor().toast(res.errors[0], { kind: 'warn' }); return; }
    await saveFormation(res.formation);
    await refreshFormations();
    getEditor().toast(`Imported "${res.formation.name}"`);
  };
  const exportOne = async (f) => {
    const { downloadBlob, safeFilename } = await import('../../export/render.js');
    downloadBlob(new Blob([JSON.stringify({ name: f.name, slots: f.slots }, null, 2)], { type: 'application/json' }), safeFilename(`${f.name} formation`, 'json'));
  };
  return (
    <>
      <Field label="Team">
        <Segmented label="Team" value={team} onChange={setTeam} options={[{ value: 'home', label: doc.teams.home.name }, { value: 'away', label: doc.teams.away.name }]} />
      </Field>
      <SectionTitle>Formations</SectionTitle>
      <FormationGrid list={list} team={team} current={current} ghost={ghost} />
      {players === 11 && (
        <>
          <SectionTitle>Phase shapes</SectionTitle>
          <FormationGrid list={shapes} team={team} current={current} ghost={ghost} />
        </>
      )}
      <SectionTitle>Shape change on the timeline</SectionTitle>
      <p className="field-hint">Adds a movement for every player, starting at the playhead. Use it to go from an in-possession shape to an out-of-possession shape.</p>
      <Field label="Change to" htmlFor="shape-target">
        <select id="shape-target" className="input" value={fromShape} onChange={(e) => setFromShape(e.target.value)}>
          {allShapes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </Field>
      <Field label={`Over ${duration.toFixed(1)} seconds`} htmlFor="shape-duration">
        <input id="shape-duration" type="range" min={0.6} max={5} step={0.1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
      </Field>
      <button type="button" className="btn" data-testid="shape-change" onClick={() => animateShapeChange(team, fromShape, duration)}>Add shape change</button>

      <SectionTitle>Your formations</SectionTitle>
      <div className="inline-form">
        <input className="input" placeholder="Name this shape" aria-label="New formation name" value={name} data-testid="formation-name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} maxLength={60} />
        <button type="button" className="btn" data-testid="formation-save" disabled={!name.trim()} onClick={async () => { await saveCurrentAsFormation(team, name.trim()); setName(''); }}>Save</button>
      </div>
      <p className="field-hint">Saves where {doc.teams[team].name} stands at the playhead.</p>
      {custom.length > 0 ? (
        <ul className="customlist">
          {custom.map((f) => (
            <li key={f.id}>
              <button type="button" className="customlist-main" onClick={() => applyFormationToTeam(team, f.id)}><FormationGlyph formation={f} /><span>{f.name}</span></button>
              <IconButton icon={Eye} size={14} label={`Compare with ${f.name}`} active={ghost?.id === f.id} onClick={() => getEditor().setGhost(ghost?.id === f.id ? null : { id: f.id, team })} />
              <IconButton icon={Copy} size={14} label={`Duplicate ${f.name}`} onClick={async () => { await saveFormation({ ...f, id: uid('f'), name: `${f.name} copy` }); await refreshFormations(); }} />
              <IconButton icon={Download} size={14} label={`Export ${f.name}`} onClick={() => exportOne(f)} />
              <IconButton icon={Trash2} size={14} label={`Delete ${f.name}`} onClick={() => removeFormation(f)} />
            </li>
          ))}
        </ul>
      ) : <p className="empty">Move players where you want them, then save the shape to use it again.</p>}
      <div className="action-row">
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current.click()}><Upload size={13} aria-hidden="true" /> Import a formation</button>
        <button type="button" className="btn btn-sm" onClick={() => getEditor().commit((d) => { addSubstitute(d, team); })}><UserPlus size={13} aria-hidden="true" /> Add substitute</button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
    </>
  );
}
