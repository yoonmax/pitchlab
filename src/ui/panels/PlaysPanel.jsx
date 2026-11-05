import { AlertTriangle, CornerDownRight, Plus, Save } from 'lucide-react';
import { summarize } from '../../core/tactics/summary.js';
import { compile } from '../../core/animation/timeline.js';
import { SET_PIECES } from '../../core/data/setpieces.js';
import { EXAMPLES, exampleDocs } from '../../core/data/examples.js';
import { useEditor, getEditor } from '../../state/editorStore.js';
import { transport } from '../../state/transport.js';
import { addDefensiveWall, newFromScratch, openExample, openSetPiece, placeBallForSetPiece, saveAsCopy } from '../../state/actions.js';
import { SectionTitle } from '../common.jsx';

export function SummaryList() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const lines = summarize(doc);
  if (lines.length === 0) {
    return <p className="empty">This play has no events yet. Choose Pass or Run, then drag from a player.</p>;
  }
  return (
    <ol className="summary" data-testid="summary">
      {lines.map((l, i) => (
        <li key={i}>
          <button
            type="button" className={l.eventId && selection.events.includes(l.eventId) ? 'is-sel' : ''}
            onClick={() => { transport.pause(); transport.seek(l.t); if (l.eventId) getEditor().select({ events: [l.eventId] }); }}
          >
            <time>{l.clock}</time><span>{l.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function PlaysPanel() {
  const doc = useEditor((s) => s.doc);
  const compiled = compile(doc);
  const errors = compiled.issues;
  const groups = [...new Set(SET_PIECES.map((s) => s.group))];
  const docs = exampleDocs();
  const { length: L, width: W } = doc.pitch;
  return (
    <>
      <SectionTitle action={<button type="button" className="btn btn-sm" onClick={() => saveAsCopy()}><Save size={13} aria-hidden="true" /> Save a copy</button>}>This play</SectionTitle>
      <SummaryList />
      {errors.length > 0 && (
        <ul className="issues">
          {errors.map((e, i) => (
            <li key={i}>
              <button type="button" className={`issue ${e.level === 'error' ? 'is-error' : ''}`} onClick={() => { const ev = doc.events[e.eventId]; if (ev) { transport.seek(ev.t); getEditor().select({ events: [ev.id] }); } }}>
                <AlertTriangle size={13} aria-hidden="true" /> {e.message}
              </button>
            </li>
          ))}
        </ul>
      )}
      <SectionTitle action={<button type="button" className="btn btn-sm" data-testid="new-play" onClick={() => newFromScratch({ blank: true, kind: 'play' })}><Plus size={13} aria-hidden="true" /> Start from scratch</button>}>Start from an example</SectionTitle>
      <ul className="linklist">
        {EXAMPLES.map((e, i) => (
          <li key={e.id}><button type="button" data-testid={`example-${e.id}`} onClick={() => openExample(e.id)}><span>{docs[i].title}</span><small>{docs[i].category}</small></button></li>
        ))}
      </ul>
      <SectionTitle>Set pieces</SectionTitle>
      <p className="field-hint">Open a template, then move players, redraw runs and change the delivery. Saved routines appear in the library.</p>
      {groups.map((g) => (
        <div key={g} className="stack-sm">
          <h4 className="minor">{g}</h4>
          <ul className="linklist">
            {SET_PIECES.filter((s) => s.group === g).map((s) => (
              <li key={s.id}><button type="button" data-testid={`setpiece-${s.id}`} onClick={() => openSetPiece(s.id)}><CornerDownRight size={13} aria-hidden="true" /><span>{s.label}</span></button></li>
            ))}
          </ul>
        </div>
      ))}
      <SectionTitle>Set-piece tools</SectionTitle>
      <h4 className="minor">Place the ball</h4>
      <div className="action-row wrap">
        <button type="button" className="btn btn-sm" onClick={() => placeBallForSetPiece(L - 0.6, 0.6)}>Corner, top</button>
        <button type="button" className="btn btn-sm" onClick={() => placeBallForSetPiece(L - 0.6, W - 0.6)}>Corner, bottom</button>
        <button type="button" className="btn btn-sm" onClick={() => placeBallForSetPiece(L - doc.pitch.penaltyMark, W / 2)}>Penalty mark</button>
        <button type="button" className="btn btn-sm" onClick={() => placeBallForSetPiece(L / 2, W / 2)}>Centre spot</button>
      </div>
      <h4 className="minor">Add a defensive wall</h4>
      <p className="field-hint">Stands 9.15 m from the ball, on the line to the goal {doc.teams.home.name} attacks.</p>
      <div className="action-row">
        {[3, 4, 5].map((n) => <button type="button" key={n} className="btn btn-sm" data-testid={`wall-${n}`} onClick={() => addDefensiveWall(n)}>{n} players</button>)}
      </div>
    </>
  );
}
