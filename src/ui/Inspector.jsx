import { useEffect, useState } from 'react';
import { AlignCenterHorizontal, AlignCenterVertical, ArrowDownToLine, ArrowUpToLine, Copy, EyeOff, Eye, Lock, PanelRightClose, Trash2, Unlock } from 'lucide-react';
import { CATEGORIES, duplicateEvents, OBJECT_TYPES, placeObjectAt, reassignTeam, reorderObject, setSpeedForEvent, updateAnnotation, updateEvent, updateObject } from '../core/document.js';
import { compile, eventEndPoint, eventStartPoint, ownerAt, positionAt } from '../core/animation/timeline.js';
import { cubicLength } from '../core/animation/bezier.js';
import { EASINGS } from '../core/animation/easing.js';
import { EVENT_TYPES, isMotion, MOTION_TYPES, BALL_TYPES, objectLabel, SPEED_PROFILES, formatTime } from '../core/tactics/events.js';
import { createPitch, DEFAULT_OVERLAYS, PITCH_PRESETS, PITCH_VIEWS, resizePitch } from '../core/pitch/geometry.js';
import { PITCH_THEMES, getTheme } from '../core/pitch/themes.js';
import { ROLE_NAMES } from '../core/formations/catalog.js';
import { useEditor, getEditor } from '../state/editorStore.js';
import { transport } from '../state/transport.js';
import { Check, ColorField, Field, IconButton, NumberInput, Segmented, SectionTitle, TextInput } from './common.jsx';

function useDocCommit() {
  return useEditor((s) => s.commit);
}

/** Current playhead, read when something needs it, updated at most when paused. */
function usePlayheadWhenPaused() {
  const [t, setT] = useState(transport.t);
  useEffect(() => {
    let frame = 0;
    return transport.onFrame((now) => {
      if (transport.playing) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setT(now));
    });
  }, []);
  return t;
}

function ObjectActions({ ids }) {
  const ed = useEditor();
  const obj = ed.doc.objects[ids[0]];
  const locked = obj?.locked;
  const hidden = obj?.hidden;
  return (
    <div className="action-row">
      <IconButton icon={Copy} label="Duplicate" shortcut={'⌘D'} onClick={() => ed.duplicateSelection()} />
      <IconButton icon={locked ? Unlock : Lock} label={locked ? 'Unlock' : 'Lock'} active={locked} onClick={() => ed.commit((d) => ids.forEach((id) => updateObject(d, id, { locked: !locked })))} />
      <IconButton icon={hidden ? EyeOff : Eye} label={hidden ? 'Show' : 'Hide'} active={hidden} onClick={() => ed.commit((d) => ids.forEach((id) => updateObject(d, id, { hidden: !hidden })))} />
      <IconButton icon={ArrowUpToLine} label="Bring to front" onClick={() => ed.commit((d) => ids.forEach((id) => reorderObject(d, id, 'front')))} />
      <IconButton icon={ArrowDownToLine} label="Send to back" onClick={() => ed.commit((d) => ids.forEach((id) => reorderObject(d, id, 'back')))} />
      <IconButton icon={Trash2} label="Delete" shortcut="Delete" onClick={() => ed.deleteSelection()} className="is-danger" />
    </div>
  );
}

function PlayerPanel({ obj }) {
  const doc = useEditor((s) => s.doc);
  const commit = useDocCommit();
  const t = usePlayheadWhenPaused();
  const compiled = compile(doc);
  const pos = positionAt(compiled, obj.id, t);
  const set = (patch) => commit((d) => updateObject(d, obj.id, patch));
  const moves = compiled.events.filter((e) => e.actor === obj.id);
  const hasBall = doc.ball.owner === obj.id;
  const atStart = t < 0.001;
  const teamDefault = doc.teams[obj.team]?.[obj.gk ? 'gk' : 'color'] ?? '#8a8d82';
  return (
    <>
      <SectionTitle action={<span className="tag">{doc.teams[obj.team]?.name ?? 'Neutral'}</span>}>{objectLabel(obj)}{obj.name ? ` ${obj.name}` : ''}</SectionTitle>
      <ObjectActions ids={[obj.id]} />
      <div className="grid-2">
        <Field label="Name" htmlFor="inspector-name"><TextInput id="inspector-name" value={obj.name} maxLength={40} onCommit={(v) => set({ name: v })} placeholder="Player name" /></Field>
        <Field label="Number" htmlFor="inspector-number"><TextInput id="inspector-number" value={String(obj.number ?? '')} maxLength={3} onCommit={(v) => set({ number: v })} /></Field>
      </div>
      <Field label="Position" htmlFor="inspector-position">
        <select id="inspector-position" className="input" value={ROLE_NAMES.includes(obj.position) ? obj.position : '__custom'} onChange={(e) => set({ position: e.target.value === '__custom' ? '' : e.target.value, gk: e.target.value === 'GK' })}>
          <option value="__custom">{obj.position && !ROLE_NAMES.includes(obj.position) ? obj.position : 'Not set'}</option>
          {ROLE_NAMES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Team">
        <Segmented
          label="Team" value={obj.team} onChange={(v) => commit((d) => reassignTeam(d, obj.id, v))}
          options={[{ value: 'home', label: doc.teams.home.name }, { value: 'away', label: doc.teams.away.name }, { value: 'neutral', label: 'Neutral' }]}
        />
      </Field>
      <Field label="Colour"><ColorField value={obj.color} fallback={teamDefault} onChange={(c) => set({ color: c })} /></Field>
      <div className="grid-2">
        <Field label={atStart ? 'Start x' : `x at ${t.toFixed(1)}s`}><NumberInput value={pos.x} unit="m" step={0.5} label="Position along the pitch" onCommit={(v) => commit((d) => placeObjectAt(d, compile(doc), obj.id, transport.t, v, pos.y))} /></Field>
        <Field label={atStart ? 'Start y' : `y at ${t.toFixed(1)}s`}><NumberInput value={pos.y} unit="m" step={0.5} label="Position across the pitch" onCommit={(v) => commit((d) => placeObjectAt(d, compile(doc), obj.id, transport.t, pos.x, v))} /></Field>
      </div>
      <div className="stack-sm">
        <Check checked={hasBall} onChange={(v) => commit((d) => { d.ball.owner = v ? obj.id : null; d.ball.dead = false; if (!v) { d.ball.x = obj.x + 1; d.ball.y = obj.y + 1; } })}>Has the ball at the start</Check>
        <Check checked={obj.gk} onChange={(v) => set({ gk: v })}>Goalkeeper</Check>
        <Check checked={obj.sub} onChange={(v) => set({ sub: v })}>Substitute</Check>
      </div>
      {moves.length > 0 && (
        <>
          <SectionTitle>Movement and events</SectionTitle>
          <ul className="movelist">
            {moves.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => { getEditor().select({ events: [e.id] }); transport.pause(); transport.seek(e.t); }}>
                  <span>{EVENT_TYPES[e.type].label}</span>
                  <time>{formatTime(e.t)}</time>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Field label="Notes" htmlFor="inspector-notes"><TextInput id="inspector-notes" multiline value={obj.notes} onCommit={(v) => set({ notes: v })} placeholder="Instructions for this player" /></Field>
    </>
  );
}

function PropPanel({ obj }) {
  const commit = useDocCommit();
  const t = usePlayheadWhenPaused();
  const doc = useEditor((s) => s.doc);
  const pos = positionAt(compile(doc), obj.id, t);
  const isGoal = obj.type === 'smallgoal' || obj.type === 'fullgoal';
  return (
    <>
      <SectionTitle>{OBJECT_TYPES[obj.type]?.label}</SectionTitle>
      <ObjectActions ids={[obj.id]} />
      <div className="grid-2">
        <Field label="x"><NumberInput value={pos.x} unit="m" step={0.5} onCommit={(v) => commit((d) => placeObjectAt(d, compile(doc), obj.id, transport.t, v, pos.y))} /></Field>
        <Field label="y"><NumberInput value={pos.y} unit="m" step={0.5} onCommit={(v) => commit((d) => placeObjectAt(d, compile(doc), obj.id, transport.t, pos.x, v))} /></Field>
      </div>
      {isGoal && <Field label="Rotation"><NumberInput value={obj.rotation} unit="°" step={15} min={-360} max={360} onCommit={(v) => commit((d) => updateObject(d, obj.id, { rotation: v }))} /></Field>}
      <Field label="Colour"><ColorField value={obj.color} fallback="#e39a2d" onChange={(c) => commit((d) => updateObject(d, obj.id, { color: c }))} /></Field>
      <Field label="Notes"><TextInput multiline value={obj.notes} onCommit={(v) => commit((d) => updateObject(d, obj.id, { notes: v }))} /></Field>
    </>
  );
}

function MultiPanel({ ids }) {
  const doc = useEditor((s) => s.doc);
  const commit = useDocCommit();
  const compiled = compile(doc);
  const positions = ids.map((id) => ({ id, ...positionAt(compiled, id, transport.t) }));
  const align = (axis, mode) => commit((d) => {
    const vals = positions.map((p) => p[axis]);
    let target;
    if (mode === 'min') target = Math.min(...vals);
    else if (mode === 'max') target = Math.max(...vals);
    else target = vals.reduce((a, b) => a + b, 0) / vals.length;
    for (const p of positions) placeObjectAt(d, compiled, p.id, transport.t, axis === 'x' ? target : p.x, axis === 'y' ? target : p.y);
  });
  const distribute = (axis) => commit((d) => {
    const sorted = [...positions].sort((a, b) => a[axis] - b[axis]);
    const first = sorted[0][axis];
    const step = (sorted[sorted.length - 1][axis] - first) / Math.max(1, sorted.length - 1);
    sorted.forEach((p, i) => placeObjectAt(d, compiled, p.id, transport.t, axis === 'x' ? first + step * i : p.x, axis === 'y' ? first + step * i : p.y));
  });
  return (
    <>
      <SectionTitle>{ids.length} objects selected</SectionTitle>
      <ObjectActions ids={ids} />
      <Field label="Line up">
        <div className="action-row">
          <button type="button" className="btn btn-sm" onClick={() => align('x', 'mean')}><AlignCenterVertical size={14} aria-hidden="true" /> Same depth</button>
          <button type="button" className="btn btn-sm" onClick={() => align('y', 'mean')}><AlignCenterHorizontal size={14} aria-hidden="true" /> Same width</button>
        </div>
      </Field>
      <Field label="Space evenly">
        <div className="action-row">
          <button type="button" className="btn btn-sm" onClick={() => distribute('x')}>Along the pitch</button>
          <button type="button" className="btn btn-sm" onClick={() => distribute('y')}>Across the pitch</button>
        </div>
      </Field>
      <Field label="Team">
        <Segmented label="Team" value={null} onChange={(v) => commit((d) => ids.forEach((id) => reassignTeam(d, id, v)))} options={[{ value: 'home', label: doc.teams.home.name }, { value: 'away', label: doc.teams.away.name }, { value: 'neutral', label: 'Neutral' }]} />
      </Field>
    </>
  );
}

function EventPanel({ ev }) {
  const doc = useEditor((s) => s.doc);
  const commit = useDocCommit();
  const compiled = compile(doc);
  const meta = EVENT_TYPES[ev.type];
  const motion = isMotion(ev.type);
  const issues = compiled.issues.filter((i) => i.eventId === ev.id);
  const set = (patch) => commit((d) => updateEvent(d, ev.id, patch));
  const players = Object.values(doc.objects).filter((o) => o.type === 'player');
  const start = eventStartPoint(compiled, ev);
  const end = eventEndPoint(compiled, ev);
  const seg = compiled.tracks[ev.actor]?.segs.find((s) => s.id === ev.id);
  const motionDuration = seg ? seg.t1 - seg.t0 : ev.duration;
  const length = motion && start && end ? cubicLength(start, ev.c1, ev.c2, end) : start && end ? Math.hypot(end.x - start.x, end.y - start.y) : 0;
  const speed = motionDuration > 0 ? length / motionDuration : 0;
  const types = motion ? MOTION_TYPES : meta.group === 'ball' ? BALL_TYPES : [ev.type];
  const changeType = (type) => {
    const m = EVENT_TYPES[type];
    commit((d) => updateEvent(d, ev.id, { type, ...(m.group === 'ball' ? { loft: m.loft ?? 0 } : {}) }));
  };
  return (
    <>
      <SectionTitle>{meta.label}</SectionTitle>
      <div className="action-row">
        <IconButton icon={Copy} label="Duplicate event" onClick={() => { let ids; commit((d) => { ids = duplicateEvents(d, [ev.id]); }); getEditor().select({ events: ids }); }} />
        <IconButton icon={Trash2} label="Delete event" onClick={() => getEditor().deleteSelection()} className="is-danger" />
      </div>
      {issues.map((i, n) => <p key={n} className={`issue ${i.level === 'error' ? 'is-error' : ''}`} role="alert">{i.message}</p>)}
      <Field label="Type" htmlFor="ev-type">
        <select id="ev-type" className="input" value={ev.type} onChange={(e) => changeType(e.target.value)}>
          {types.map((t) => <option key={t} value={t}>{EVENT_TYPES[t].label}</option>)}
        </select>
      </Field>
      <Field label="Player" htmlFor="ev-actor">
        <select id="ev-actor" className="input" value={ev.actor} onChange={(e) => set({ actor: e.target.value })}>
          {players.map((o) => <option key={o.id} value={o.id}>{objectLabel(o)} {doc.teams[o.team]?.name ?? ''}</option>)}
        </select>
      </Field>
      {meta.group === 'ball' && (
        <Field label="Target" htmlFor="ev-receiver">
          <select id="ev-receiver" className="input" value={ev.receiver ?? ''} onChange={(e) => {
            const id = e.target.value || null;
            commit((d) => updateEvent(d, ev.id, id ? { receiver: id, to: null } : { receiver: null, to: end ?? { x: 52.5, y: 34 } }));
          }}>
            <option value="">A point on the pitch</option>
            {players.filter((o) => o.id !== ev.actor).map((o) => <option key={o.id} value={o.id}>{objectLabel(o)} {doc.teams[o.team]?.name ?? ''}</option>)}
          </select>
        </Field>
      )}
      <div className="grid-2">
        <Field label={ev.type === 'key' ? 'Time' : 'Start'}><NumberInput value={ev.t} unit="s" step={0.1} min={0} onCommit={(v) => set({ t: v })} /></Field>
        {ev.type !== 'key' && <Field label="Duration"><NumberInput value={ev.duration} unit="s" step={0.1} min={0.1} onCommit={(v) => set({ duration: v })} /></Field>}
      </div>
      {motion && ev.type !== 'key' && (
        <Field label="Speed" hint={`${speed.toFixed(1)} m/s over ${length.toFixed(1)} m${speed > 10.5 ? '. That is faster than a sprint.' : ''}`}>
          <div className="action-row">
            {SPEED_PROFILES.map((s) => <button type="button" key={s.id} className="btn btn-sm" onClick={() => commit((d) => setSpeedForEvent(d, compiled, ev.id, s.speed))}>{s.label}</button>)}
          </div>
        </Field>
      )}
      {motion && (
        <Field label="Interpolation" htmlFor="ev-ease">
          <select id="ev-ease" className="input" value={ev.ease ?? (ev.type === 'key' ? 'linear' : 'smooth')} onChange={(e) => set({ ease: e.target.value })}>
            {Object.entries(EASINGS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      )}
      {motion && (ev.c1 || ev.c2) && <button type="button" className="linkbtn" onClick={() => set({ c1: null, c2: null })}>Straighten this path</button>}
      {meta.group === 'ball' && (
        <>
          <Field label="Height at the top of the arc" hint="An illustration of flight, not a physics simulation."><NumberInput value={ev.loft} unit="m" step={0.5} min={0} max={40} onCommit={(v) => set({ loft: v })} /></Field>
          {ev.c && <button type="button" className="linkbtn" onClick={() => set({ c: null })}>Remove the curve</button>}
        </>
      )}
      <Field label="Comment" htmlFor="ev-comment"><TextInput id="ev-comment" multiline rows={2} value={ev.comment} onCommit={(v) => set({ comment: v })} placeholder="Shown in the play summary" /></Field>
    </>
  );
}

const DASHES = [{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }];

function AnnotationPanel({ a }) {
  const commit = useDocCommit();
  const doc = useEditor((s) => s.doc);
  const set = (patch) => commit((d) => updateAnnotation(d, a.id, patch));
  const theme = getTheme(doc.pitch.theme);
  const isLine = a.kind === 'arrow';
  const hasFill = a.kind === 'zone' || a.kind === 'rect' || a.kind === 'circle';
  const names = { arrow: 'Line', pen: 'Freehand', highlight: 'Highlight', zone: 'Zone', rect: 'Rectangle', circle: 'Circle', text: 'Text' };
  return (
    <>
      <SectionTitle>{names[a.kind] ?? 'Annotation'}</SectionTitle>
      <div className="action-row">
        <IconButton icon={Copy} label="Duplicate" onClick={() => getEditor().duplicateSelection()} />
        <IconButton icon={a.locked ? Unlock : Lock} label={a.locked ? 'Unlock' : 'Lock'} active={a.locked} onClick={() => set({ locked: !a.locked })} />
        <IconButton icon={a.hidden ? EyeOff : Eye} label={a.hidden ? 'Show' : 'Hide'} active={a.hidden} onClick={() => set({ hidden: !a.hidden })} />
        <IconButton icon={Trash2} label="Delete" onClick={() => getEditor().deleteSelection()} className="is-danger" />
      </div>
      {a.kind === 'text' && (
        <>
          <Field label="Text"><TextInput multiline rows={2} value={a.text} onCommit={(v) => set({ text: v })} /></Field>
          <Field label="Size"><NumberInput value={a.size} unit="m" step={0.2} min={0.8} max={12} onCommit={(v) => set({ size: v })} /></Field>
        </>
      )}
      <Field label="Colour"><ColorField value={a.color} fallback={theme.arrow} onChange={(c) => set({ color: c })} /></Field>
      {a.kind !== 'text' && (
        <Field label="Thickness" htmlFor="ann-width">
          <input id="ann-width" type="range" min={0.5} max={8} step={0.25} value={a.width ?? 2} onChange={(e) => set({ width: Number(e.target.value) })} />
        </Field>
      )}
      <Field label="Opacity" htmlFor="ann-opacity">
        <input id="ann-opacity" type="range" min={0.1} max={1} step={0.05} value={a.opacity ?? 1} onChange={(e) => set({ opacity: Number(e.target.value) })} />
      </Field>
      {a.kind !== 'text' && a.kind !== 'highlight' && <Field label="Line style"><Segmented small label="Line style" value={a.dash} onChange={(v) => set({ dash: v })} options={DASHES} /></Field>}
      {isLine && (
        <>
          <Field label="Arrowheads"><Segmented small label="Arrowheads" value={a.head ?? 'end'} onChange={(v) => set({ head: v })} options={[{ value: 'none', label: 'None' }, { value: 'end', label: 'End' }, { value: 'both', label: 'Both' }]} /></Field>
          {(a.c1 || a.c2) && <button type="button" className="linkbtn" onClick={() => set({ c1: null, c2: null })}>Straighten this line</button>}
          {(a.startAttach || a.endAttach) && <p className="field-hint">Attached to {[a.startAttach, a.endAttach].filter(Boolean).map((id) => objectLabel(doc.objects[id])).join(' and ')}. This line follows them on the timeline.</p>}
        </>
      )}
      {hasFill && (
        <Field label="Fill" htmlFor="ann-fill">
          <input id="ann-fill" type="range" min={0} max={0.8} step={0.02} value={a.fill ?? 0.16} onChange={(e) => set({ fill: Number(e.target.value) })} />
        </Field>
      )}
      <div className="grid-2">
        <Field label="Show from"><NumberInput value={a.showFrom ?? 0} unit="s" step={0.1} min={0} onCommit={(v) => set({ showFrom: v > 0 ? v : null })} /></Field>
        <Field label="Show until"><NumberInput value={a.showUntil ?? ''} unit="s" step={0.1} min={0} onCommit={(v) => set({ showUntil: v > 0 ? v : null })} /></Field>
      </div>
    </>
  );
}

function PlayPanel() {
  const doc = useEditor((s) => s.doc);
  const commit = useDocCommit();
  const readOnly = useEditor((s) => s.readOnly);
  if (readOnly) {
    return (
      <>
        <SectionTitle>{doc.title}</SectionTitle>
        {doc.description && <p className="prose">{doc.description}</p>}
        {doc.notes && <p className="prose">{doc.notes}</p>}
      </>
    );
  }
  return (
    <>
      <SectionTitle>Play details</SectionTitle>
      <Field label="Title" htmlFor="doc-title"><TextInput id="doc-title" value={doc.title} maxLength={120} onCommit={(v) => commit((d) => { d.title = v || 'Untitled play'; })} /></Field>
      <Field label="Description" htmlFor="doc-desc"><TextInput id="doc-desc" multiline value={doc.description} onCommit={(v) => commit((d) => { d.description = v; })} /></Field>
      <Field label="Category" htmlFor="doc-cat">
        <select id="doc-cat" className="input" value={doc.category} onChange={(e) => commit((d) => { d.category = e.target.value; })}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Tags" htmlFor="doc-tags" hint="Separate tags with commas."><TextInput id="doc-tags" value={doc.tags.join(', ')} onCommit={(v) => commit((d) => { d.tags = v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30); })} /></Field>
      <Field label="Notes" htmlFor="doc-notes"><TextInput id="doc-notes" multiline value={doc.notes} onCommit={(v) => commit((d) => { d.notes = v; })} /></Field>
      <SectionTitle>Teams</SectionTitle>
      {['home', 'away'].map((team) => (
        <div key={team} className="stack-sm">
          <Field label={team === 'home' ? 'Filled markers' : 'Ringed markers'}><TextInput value={doc.teams[team].name} maxLength={40} onCommit={(v) => commit((d) => { d.teams[team].name = v || d.teams[team].name; })} /></Field>
          <ColorField value={doc.teams[team].color} allowReset={false} label={`${doc.teams[team].name} colour`} onChange={(c) => commit((d) => { d.teams[team].color = c; })} />
          <Field label="Attacks towards">
            <Segmented small label="Attack direction" value={doc.teams[team].attack} onChange={(v) => commit((d) => { d.teams[team].attack = v; d.teams[team === 'home' ? 'away' : 'home'].attack = v === 'right' ? 'left' : 'right'; })} options={[{ value: 'left', label: 'Left goal' }, { value: 'right', label: 'Right goal' }]} />
          </Field>
        </div>
      ))}
    </>
  );
}

export function PitchSettings() {
  const pitch = useEditor((s) => s.doc.pitch);
  const commit = useDocCommit();
  const set = (patch) => commit((d) => { Object.assign(d.pitch, patch); });
  const source = PITCH_PRESETS[pitch.preset]?.source;
  return (
    <>
      <SectionTitle>Pitch</SectionTitle>
      <Field label="Format">
        <Segmented
          small label="Format" value={pitch.preset} onChange={(v) => commit((d) => {
            const { view, theme, stripes, overlays } = d.pitch;
            d.pitch = { ...createPitch(v), view, theme, stripes, overlays };
          })}
          options={Object.keys(PITCH_PRESETS).map((k) => ({ value: k, label: k }))}
        />
      </Field>
      <div className="grid-2">
        <Field label="Length"><NumberInput value={pitch.length} unit="m" step={1} min={15} max={130} onCommit={(v) => commit((d) => { d.pitch = resizePitch(d.pitch, v, d.pitch.width); })} /></Field>
        <Field label="Width"><NumberInput value={pitch.width} unit="m" step={1} min={10} max={100} onCommit={(v) => commit((d) => { d.pitch = resizePitch(d.pitch, d.pitch.length, v); })} /></Field>
      </div>
      {source && <p className="field-hint">{source}</p>}
      <details className="disclosure">
        <summary>Markings</summary>
        <div className="grid-2">
          <Field label="Penalty area depth"><NumberInput value={pitch.penaltyDepth} unit="m" step={0.5} min={0} max={40} onCommit={(v) => set({ penaltyDepth: v })} /></Field>
          <Field label="Penalty area width"><NumberInput value={pitch.penaltyWidth} unit="m" step={0.5} min={0} max={90} onCommit={(v) => set({ penaltyWidth: v })} /></Field>
          <Field label="Goal area depth"><NumberInput value={pitch.goalAreaDepth} unit="m" step={0.5} min={0} max={20} onCommit={(v) => set({ goalAreaDepth: v })} /></Field>
          <Field label="Goal area width"><NumberInput value={pitch.goalAreaWidth} unit="m" step={0.5} min={0} max={60} onCommit={(v) => set({ goalAreaWidth: v })} /></Field>
          <Field label="Penalty mark"><NumberInput value={pitch.penaltyMark} unit="m" step={0.5} min={0} max={30} onCommit={(v) => set({ penaltyMark: v })} /></Field>
          <Field label="Centre circle"><NumberInput value={pitch.centerRadius} unit="m" step={0.5} min={0} max={30} onCommit={(v) => set({ centerRadius: v })} /></Field>
          <Field label="Goal width"><NumberInput value={pitch.goalWidth} unit="m" step={0.1} min={0} max={20} onCommit={(v) => set({ goalWidth: v })} /></Field>
          <Field label="Corner arc"><NumberInput value={pitch.cornerRadius} unit="m" step={0.1} min={0} max={5} onCommit={(v) => set({ cornerRadius: v })} /></Field>
        </div>
      </details>
      <Field label="View" htmlFor="pitch-view">
        <select id="pitch-view" className="input" value={pitch.view} onChange={(e) => set({ view: e.target.value })}>
          {PITCH_VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </Field>
      <Field label="Style">
        <div className="themes">
          {Object.entries(PITCH_THEMES).map(([id, th]) => (
            <button type="button" key={id} className={`theme-chip ${pitch.theme === id ? 'is-on' : ''}`} onClick={() => set({ theme: id })} aria-pressed={pitch.theme === id}>
              <svg viewBox="0 0 34 22" aria-hidden="true">
                <rect width="34" height="22" fill={th.ground} />
                <rect x="3" y="3" width="28" height="16" fill="none" stroke={th.line} strokeWidth="0.8" />
                <path d="M17 3v16" stroke={th.line} strokeWidth="0.8" />
                <circle cx="17" cy="11" r="3.4" fill="none" stroke={th.line} strokeWidth="0.8" />
              </svg>
              <span>{th.label}</span>
            </button>
          ))}
        </div>
      </Field>
      <div className="stack-sm">
        <Check checked={pitch.stripes} onChange={(v) => set({ stripes: v })}>Grass stripes</Check>
        {[['grid', 'Grid every 10 m'], ['coords', 'Coordinates'], ['thirds', 'Thirds'], ['zones', 'Six zones along the pitch'], ['channels', 'Five equal channels'], ['halfSpaces', 'Half-spaces'], ['lanes', 'Five-lane positional grid']].map(([k, label]) => (
          <Check key={k} checked={pitch.overlays?.[k]} onChange={(v) => commit((d) => { d.pitch.overlays = { ...DEFAULT_OVERLAYS, ...d.pitch.overlays, [k]: v }; })}>{label}</Check>
        ))}
      </div>
    </>
  );
}

export function ObjectList() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const ed = getEditor();
  const items = doc.objectOrder.map((id) => doc.objects[id]).filter(Boolean);
  const owner = ownerAt(compile(doc), 0);
  const name = (o) => (o.type === 'player' ? objectLabel(o) : OBJECT_TYPES[o.type]?.label);
  return (
    <>
      <SectionTitle>Objects on the board</SectionTitle>
      <p className="field-hint">Select here to work without the pitch. Arrow keys then nudge the selection.</p>
      <ul className="objectlist" aria-label="Objects on the board">
        {items.map((o) => (
          <li key={o.id}>
            <button
              type="button" aria-pressed={selection.objects.includes(o.id)} className={selection.objects.includes(o.id) ? 'is-sel' : ''}
              onClick={(e) => (e.shiftKey ? ed.toggleObjectSelection(o.id) : ed.select({ objects: [o.id] }))}
            >
              <i className={`dot-team team-${o.team}`} style={{ '--team': o.color ?? doc.teams[o.team]?.color ?? '#8a8d82' }} />
              <span>{name(o)}</span>
              <small>{doc.teams[o.team]?.name ?? ''} {o.position}{o.name ? ` ${o.name}` : ''}{owner === o.id ? ', has the ball' : ''}{o.sub ? ', substitute' : ''}{o.locked ? ', locked' : ''}{o.hidden ? ', hidden' : ''}</small>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Inspector() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const togglePanel = useEditor((s) => s.togglePanel);
  const readOnly = useEditor((s) => s.readOnly);
  const [tab, setTab] = useState('props');
  const hasSelection = selection.objects.length || selection.annotations.length || selection.events.length;
  useEffect(() => { if (hasSelection) setTab('props'); }, [hasSelection]);

  let body;
  if (selection.objects.length > 1) body = <MultiPanel ids={selection.objects} />;
  else if (selection.objects.length === 1 && doc.objects[selection.objects[0]]) {
    const o = doc.objects[selection.objects[0]];
    body = o.type === 'player' ? <PlayerPanel key={o.id} obj={o} /> : <PropPanel key={o.id} obj={o} />;
  } else if (selection.events.length >= 1 && doc.events[selection.events[selection.events.length - 1]]) {
    const ev = doc.events[selection.events[selection.events.length - 1]];
    body = <EventPanel key={ev.id} ev={ev} />;
  } else if (selection.annotations.length === 1 && doc.annotations[selection.annotations[0]]) {
    const a = doc.annotations[selection.annotations[0]];
    body = <AnnotationPanel key={a.id} a={a} />;
  } else body = <PlayPanel />;

  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="panel-tabs">
        <Segmented small label="Inspector section" value={tab} onChange={setTab} options={[{ value: 'props', label: hasSelection ? 'Selection' : 'Play' }, { value: 'pitch', label: 'Pitch' }, { value: 'objects', label: 'Objects' }]} />
        <IconButton icon={PanelRightClose} label="Hide inspector" onClick={() => togglePanel('inspector', false)} />
      </div>
      <div className="panel-body">
        <fieldset disabled={readOnly} className="plain-fieldset">
          {tab === 'props' && body}
          {tab === 'pitch' && <PitchSettings />}
          {tab === 'objects' && <ObjectList />}
        </fieldset>
      </div>
    </aside>
  );
}

