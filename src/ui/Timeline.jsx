import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlignStartVertical, ChevronDown, ChevronUp, Diamond, Group, Link2, Pause, Play, Repeat, RotateCcw, SkipBack, SkipForward, Square, Ungroup } from 'lucide-react';
import { alignEvents, expandGroups, groupEvents, ungroupEvents } from '../core/document.js';
import { PLAYBACK_SPEEDS } from '../core/animation/playback.js';
import { compile, eventArrival } from '../core/animation/timeline.js';
import { EVENT_TYPES, formatTime, objectLabel } from '../core/tactics/events.js';
import { useEditor, getEditor } from '../state/editorStore.js';
import { transport } from '../state/transport.js';
import { addKeyframeForSelection } from '../state/actions.js';
import { IconButton } from './common.jsx';

const ROW_H = 26;
const LABEL_W = 92;
const RULER_H = 22;

export function useTransportState() {
  const [, force] = useState(0);
  useEffect(() => transport.onState(() => force((n) => n + 1)), []);
  return transport;
}

export function stepEvent(direction) {
  const { doc } = getEditor();
  const c = compile(doc);
  const times = new Set([0, c.duration]);
  for (const ev of c.events) { times.add(ev.t); times.add(+eventArrival(ev).toFixed(3)); }
  const sorted = [...times].sort((a, b) => a - b);
  const t = transport.t;
  transport.pause();
  if (direction > 0) transport.seek(sorted.find((v) => v > t + 0.005) ?? c.duration);
  else transport.seek([...sorted].reverse().find((v) => v < t - 0.005) ?? 0);
}

export function togglePlay() {
  const ed = getEditor();
  if (compile(ed.doc).duration <= 0) {
    ed.toast('Nothing to play yet. Press P and drag from one player to another to add a pass.');
    return;
  }
  transport.toggle();
}

function TimeReadout() {
  const ref = useRef(null);
  useEffect(() => {
    const write = (t) => { if (ref.current) ref.current.textContent = formatTime(t); };
    write(transport.t);
    return transport.onFrame(write);
  }, []);
  return <output ref={ref} className="timecode" data-testid="timecode" aria-label="Playhead time" />;
}

export function TransportControls({ compact }) {
  const tp = useTransportState();
  return (
    <div className="transport">
      <IconButton icon={Square} size={13} label="Stop and go to the start" onClick={() => tp.stop()} />
      <IconButton icon={RotateCcw} label="Restart" onClick={() => { if (compile(getEditor().doc).duration > 0) tp.restart(); }} />
      <IconButton icon={SkipBack} label="Previous event" shortcut="[" onClick={() => stepEvent(-1)} />
      <button type="button" className="playbtn" data-testid="play" aria-label={tp.playing ? 'Pause' : 'Play'} title={tp.playing ? 'Pause (Space)' : 'Play (Space)'} onClick={togglePlay}>
        {tp.playing ? <Pause size={15} fill="currentColor" strokeWidth={0} /> : <Play size={15} fill="currentColor" strokeWidth={0} />}
      </button>
      <IconButton icon={SkipForward} label="Next event" shortcut="]" onClick={() => stepEvent(1)} />
      <TimeReadout />
      <label className="speed" title="Playback speed">
        <span className="sr-only">Playback speed</span>
        <select value={tp.speed} data-testid="speed" onChange={(e) => tp.setSpeed(Number(e.target.value))}>
          {PLAYBACK_SPEEDS.map((s) => <option key={s} value={s}>{s}{'×'}</option>)}
        </select>
      </label>
      <IconButton icon={Repeat} label="Loop" active={tp.loop} onClick={() => tp.setLoop(!tp.loop)} />
      {compact && <MobileScrubber />}
    </div>
  );
}

function MobileScrubber() {
  const doc = useEditor((s) => s.doc);
  const ref = useRef(null);
  const duration = compile(doc).duration;
  useEffect(() => {
    const write = (t) => { if (ref.current) ref.current.value = t; };
    write(transport.t);
    return transport.onFrame(write);
  }, []);
  return (
    <input
      ref={ref} className="scrub-range" type="range" min={0} max={Math.max(duration, 1)} step={0.01} aria-label="Scrub timeline"
      onChange={(e) => { transport.pause(); transport.seek(Number(e.target.value)); }}
    />
  );
}

function clipShort(ev) {
  return EVENT_TYPES[ev.type]?.label ?? ev.type;
}

/** The possession line. It runs along the row of whoever holds the ball and crosses rows on each pass. */
function PossessionThread({ compiled, rowIndex, pps, horizon, height }) {
  const line = ROW_H - 3.5;
  const yOf = (id) => (rowIndex.has(id) ? rowIndex.get(id) * ROW_H + line : ROW_H / 2);
  let d = '';
  const segs = compiled.ball;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const x0 = s.t0 * pps;
    const x1 = Math.min(s.t1, horizon) * pps;
    if (s.kind === 'held') {
      const y = yOf(s.owner);
      d += `M${x0} ${y}H${x1}`;
    } else if (s.kind === 'flight') {
      const prev = segs[i - 1];
      const next = segs[i + 1];
      const from = prev?.kind === 'held' ? yOf(prev.owner) : ROW_H / 2;
      const to = next?.kind === 'held' ? yOf(next.owner) : ROW_H / 2;
      const midX = (x0 + x1) / 2;
      d += `M${x0} ${from}C${midX} ${from} ${midX} ${to} ${x1} ${to}`;
    } else {
      const y = ROW_H / 2;
      d += `M${x0} ${y}H${x1}`;
    }
  }
  return (
    <svg className="thread" width={horizon * pps} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke="var(--ball)" strokeWidth="2" />
    </svg>
  );
}

export function Timeline() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const readOnly = useEditor((s) => s.readOnly);
  const open = useEditor((s) => s.panels.timeline);
  const togglePanel = useEditor((s) => s.togglePanel);
  const advance = useEditor((s) => s.advanceAfterBall);
  const compiled = compile(doc);
  const [pps, setPps] = useState(56);
  const [showAll, setShowAll] = useState(false);
  const bodyRef = useRef(null);
  const playheadRef = useRef(null);
  const rulerRef = useRef(null);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const dragRef = useRef(null);

  const rows = useMemo(() => {
    const involved = new Set();
    for (const ev of compiled.events) {
      involved.add(ev.actor);
      if (ev.receiver) involved.add(ev.receiver);
    }
    for (const s of compiled.ball) if (s.kind === 'held') involved.add(s.owner);
    for (const id of selection.objects) involved.add(id);
    const teamRank = { home: 0, away: 1, neutral: 2 };
    return Object.values(doc.objects)
      .filter((o) => o.type === 'player' && (showAll || involved.has(o.id)))
      .sort((a, b) => teamRank[a.team] - teamRank[b.team] || Number(a.number) - Number(b.number));
  }, [compiled, doc.objects, showAll, selection.objects]);

  const rowIndex = useMemo(() => {
    const m = new Map();
    rows.forEach((r, i) => m.set(r.id, i + 1));
    return m;
  }, [rows]);

  const hasNotes = doc.annotationOrder.length > 0;
  const rowCount = rows.length + 1 + (hasNotes ? 1 : 0);
  const horizon = Math.max(compiled.duration + 4, 14);
  const width = horizon * pps;
  const height = rowCount * ROW_H;

  useEffect(() => {
    const write = (t) => {
      const x = t * ppsRef.current;
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${x}px)`;
      rulerRef.current?.setAttribute('aria-valuenow', t.toFixed(1));
      const scroller = bodyRef.current;
      if (scroller && transport.playing) {
        const visible = x - scroller.scrollLeft;
        if (visible > scroller.clientWidth - 80 - LABEL_W || visible < 0) scroller.scrollLeft = x - 120;
      }
    };
    write(transport.t);
    return transport.onFrame(write);
  }, [pps]);

  /* ---------- Scrubbing ---------- */

  const seekFromEvent = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    transport.seek(Math.max(0, (e.clientX - r.left) / ppsRef.current));
  }, []);

  const onRulerDown = (e) => {
    transport.pause();
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  };
  const onRulerMove = (e) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromEvent(e);
  };
  const onRulerKey = (e) => {
    const step = e.shiftKey ? 1 : 0.1;
    if (e.key === 'ArrowRight') { transport.pause(); transport.seek(transport.t + step); e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'ArrowLeft') { transport.pause(); transport.seek(transport.t - step); e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'Home') { transport.seek(0); e.preventDefault(); }
    if (e.key === 'End') { transport.seek(compiled.duration); e.preventDefault(); }
  };

  /* ---------- Clips ---------- */

  const snapTimes = useMemo(() => {
    const set = [];
    for (const ev of compiled.events) {
      set.push({ t: ev.t, id: ev.id });
      set.push({ t: eventArrival(ev), id: ev.id });
    }
    return set;
  }, [compiled.events]);

  const onClipDown = (e, ev, mode) => {
    e.stopPropagation();
    const ed = getEditor();
    transport.pause();
    if (e.shiftKey || e.metaKey || e.ctrlKey) ed.toggleEventSelection(ev.id);
    else if (!ed.selection.events.includes(ev.id)) ed.select({ events: [ev.id] });
    if (ed.readOnly) return;
    const ids = expandGroups(ed.doc, getEditor().selection.events.length ? getEditor().selection.events : [ev.id]);
    const base = {};
    for (const id of ids) base[id] = { t: ed.doc.events[id].t, duration: ed.doc.events[id].duration };
    ed.beginGesture();
    dragRef.current = { mode, id: ev.id, ids, base, startX: e.clientX };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onClipMove = (e) => {
    const g = dragRef.current;
    if (!g) return;
    const ed = getEditor();
    let dt = (e.clientX - g.startX) / ppsRef.current;
    if (g.mode === 'move') {
      const anchor = g.base[g.id].t + dt;
      if (!e.altKey) {
        const tol = 7 / ppsRef.current;
        const pool = [...snapTimes.filter((s) => !g.ids.includes(s.id)).map((s) => s.t), transport.t, 0];
        for (const s of pool) if (Math.abs(s - anchor) < tol) { dt = s - g.base[g.id].t; break; }
      }
      const minT = Math.min(...g.ids.map((id) => g.base[id].t));
      dt = Math.max(dt, -minT);
      ed.updateGesture((d) => {
        for (const id of g.ids) if (d.events[id]) d.events[id].t = +(g.base[id].t + dt).toFixed(3);
      });
    } else {
      ed.updateGesture((d) => {
        const v = d.events[g.id];
        if (v) v.duration = Math.max(0.1, +(g.base[g.id].duration + dt).toFixed(3));
      });
    }
  };

  const onClipUp = (e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    getEditor().endGesture();
  };

  const onClipKey = (e, ev) => {
    const step = e.shiftKey ? 0.5 : 0.1;
    const shift = (dt) => {
      e.preventDefault();
      e.stopPropagation();
      getEditor().commit((d) => {
        for (const id of expandGroups(d, [ev.id])) if (d.events[id]) d.events[id].t = Math.max(0, +(d.events[id].t + dt).toFixed(3));
      });
    };
    if (e.key === 'ArrowLeft') shift(-step);
    if (e.key === 'ArrowRight') shift(step);
  };

  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setPps((p) => Math.min(240, Math.max(18, p * Math.exp(-e.deltaY * 0.004))));
    }
  };

  const multi = selection.events.length > 1;
  const anyGrouped = selection.events.some((id) => doc.events[id]?.group);

  const ticks = useMemo(() => {
    const out = [];
    const major = pps < 30 ? 5 : 1;
    for (let s = 0; s <= horizon; s += major) out.push(s);
    return out;
  }, [pps, horizon]);

  return (
    <section className={`timeline ${open ? '' : 'is-closed'}`} aria-label="Timeline">
      <div className="timeline-bar">
        <TransportControls compact={!open} />
        <div className="timeline-tools">
          {open && !readOnly && (
            <>
              <IconButton icon={Diamond} size={14} label="Add keyframe at the playhead" shortcut="K" onClick={addKeyframeForSelection} disabled={!selection.objects.length} />
              {multi && <IconButton icon={AlignStartVertical} label="Line up the starts of these events" onClick={() => getEditor().commit((d) => alignEvents(d, selection.events, 'start'))} />}
              {multi && !anyGrouped && <IconButton icon={Group} label="Group these events so they move together" onClick={() => getEditor().commit((d) => { groupEvents(d, selection.events); })} />}
              {anyGrouped && <IconButton icon={Ungroup} label="Ungroup" onClick={() => getEditor().commit((d) => ungroupEvents(d, selection.events))} />}
              <IconButton
                icon={Link2} active={advance} label={advance ? 'Move the playhead on after each ball action (on)' : 'Move the playhead on after each ball action (off)'}
                onClick={() => useEditor.setState({ advanceAfterBall: !advance })}
              />
              <button type="button" className={`textbtn ${showAll ? 'is-on' : ''}`} aria-pressed={showAll} onClick={() => setShowAll(!showAll)}>All players</button>
              <label className="zoomrange" title="Timeline zoom">
                <span className="sr-only">Timeline zoom</span>
                <input type="range" min={18} max={240} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
              </label>
            </>
          )}
          <IconButton icon={open ? ChevronDown : ChevronUp} label={open ? 'Collapse timeline' : 'Expand timeline'} onClick={() => togglePanel('timeline')} />
        </div>
      </div>
      {open && (
        <div className="score" ref={bodyRef} onWheel={onWheel}>
          <div className="score-inner" style={{ width: width + LABEL_W, height: height + RULER_H }}>
            <div className="score-labels" style={{ width: LABEL_W, height: height + RULER_H }}>
              <div className="score-corner" style={{ height: RULER_H }} />
              <div className="score-label is-ball" style={{ height: ROW_H }}><i className="dot-ball" />Ball</div>
              {rows.map((o) => (
                <button
                  type="button" key={o.id} style={{ height: ROW_H }}
                  className={`score-label ${selection.objects.includes(o.id) ? 'is-sel' : ''}`}
                  onClick={() => getEditor().select({ objects: [o.id] })}
                >
                  <i className={`dot-team team-${o.team}`} style={{ '--team': o.color ?? doc.teams[o.team]?.color ?? '#8a8d82' }} />
                  {objectLabel(o)}
                  {o.position ? <small>{o.position}</small> : null}
                </button>
              ))}
              {hasNotes && <div className="score-label" style={{ height: ROW_H }}>Notes</div>}
            </div>
            <div className="score-track" style={{ left: LABEL_W, width, height: height + RULER_H }}>
              <div
                ref={rulerRef} className="ruler" style={{ height: RULER_H, width }} data-testid="ruler"
                role="slider" tabIndex={0} aria-label="Playhead" aria-valuemin={0} aria-valuemax={Math.round(horizon)} aria-valuenow={0}
                onPointerDown={onRulerDown} onPointerMove={onRulerMove} onKeyDown={onRulerKey}
              >
                {ticks.map((s) => (
                  <span key={s} className="tick" style={{ left: s * pps }}>{s}</span>
                ))}
              </div>
              <div className="rows" style={{ top: RULER_H, width, height }}>
                {ticks.map((s) => <i key={s} className="gridline" style={{ left: s * pps }} />)}
                {Array.from({ length: rowCount }, (_, i) => <i key={i} className="rowline" style={{ top: (i + 1) * ROW_H }} />)}
                {compiled.events.length === 0 && (
                  <p className="score-hint" style={{ top: ROW_H + 8 }}>Passes and runs appear here as you draw them. Drag a clip to change when it happens, or its right edge to change how long it takes.</p>
                )}
                <PossessionThread compiled={compiled} rowIndex={rowIndex} pps={pps} horizon={horizon} height={height} />
                {compiled.events.map((ev) => {
                  const row = rowIndex.get(ev.actor);
                  if (row == null) return null;
                  const meta = EVENT_TYPES[ev.type];
                  const sel = selection.events.includes(ev.id);
                  const invalid = compiled.invalid.has(ev.id);
                  const top = row * ROW_H + 2;
                  if (ev.type === 'key') {
                    return (
                      <button
                        type="button" key={ev.id} className={`keyframe ${sel ? 'is-sel' : ''}`} style={{ left: ev.t * pps - 7, top: row * ROW_H + 4 }}
                        aria-label={`Keyframe for ${objectLabel(doc.objects[ev.actor])} at ${ev.t.toFixed(1)} seconds`}
                        onPointerDown={(e) => onClipDown(e, ev, 'move')} onPointerMove={onClipMove} onPointerUp={onClipUp}
                        onKeyDown={(e) => onClipKey(e, ev)} onFocus={() => getEditor().select({ events: [ev.id] })}
                        data-testid="keyframe"
                      />
                    );
                  }
                  const w = Math.max(10, (ev.duration || 0.2) * pps);
                  return (
                    <button
                      type="button" key={ev.id} data-testid={`clip-${ev.type}`}
                      className={`clip clip-${meta.group} ${sel ? 'is-sel' : ''} ${invalid ? 'is-invalid' : ''} ${ev.group ? 'is-grouped' : ''}`}
                      style={{ left: ev.t * pps, top, width: w, height: ROW_H - 8 }}
                      aria-label={`${meta.label} by ${objectLabel(doc.objects[ev.actor])}, starts ${ev.t.toFixed(1)} seconds, lasts ${ev.duration.toFixed(1)} seconds${invalid ? ', cannot happen as placed' : ''}`}
                      title={invalid ? compiled.issues.find((i) => i.eventId === ev.id)?.message : meta.label}
                      onPointerDown={(e) => onClipDown(e, ev, 'move')} onPointerMove={onClipMove} onPointerUp={onClipUp}
                      onKeyDown={(e) => onClipKey(e, ev)}
                    >
                      <span>{clipShort(ev)}</span>
                      {!readOnly && <i className="clip-grip" onPointerDown={(e) => onClipDown(e, ev, 'resize')} onPointerMove={onClipMove} onPointerUp={onClipUp} />}
                    </button>
                  );
                })}
                {hasNotes && doc.annotationOrder.map((id) => {
                  const a = doc.annotations[id];
                  if (!a) return null;
                  const from = a.showFrom ?? 0;
                  const to = a.showUntil ?? horizon;
                  return (
                    <button
                      type="button" key={id} className={`notebar ${selection.annotations.includes(id) ? 'is-sel' : ''}`}
                      style={{ left: from * pps, width: Math.max(8, (to - from) * pps), top: (rowCount - 1) * ROW_H + 8, height: ROW_H - 16 }}
                      aria-label={`Annotation: ${a.kind}`}
                      onClick={() => getEditor().select({ annotations: [id] })}
                    />
                  );
                })}
              </div>
              <div className="playhead" ref={playheadRef} style={{ height: height + RULER_H }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
