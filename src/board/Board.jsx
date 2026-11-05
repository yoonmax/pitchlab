import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ballAt, compile, eventArrival, eventEndPoint, eventStartPoint, footPosition, motionAt, positionAt } from '../core/animation/timeline.js';
import { cameraMatrix } from '../core/pitch/coordinates.js';
import { viewBounds } from '../core/pitch/geometry.js';
import { getTheme } from '../core/pitch/themes.js';
import { getFormation } from '../core/formations/catalog.js';
import { slotToWorld } from '../core/formations/engine.js';
import { resolveControls, smoothPathD, cubicPathD } from '../core/animation/bezier.js';
import { isMotion, EVENT_TYPES } from '../core/tactics/events.js';
import { addAnnotation, updateAnnotation, updateEvent, placeObjectAt, translateAnnotation } from '../core/document.js';
import { useEditor, getEditor } from '../state/editorStore.js';
import { transport } from '../state/transport.js';
import { camera } from './camera.js';
import { fx } from './fx.js';
import { annotationEnds, AnnotationMark, EventLines, OverlayLayer, PitchLayer } from './layers.jsx';
import { AnalysisStatic } from './analysisMarks.jsx';
import { lineScaleForZoom } from './lines.js';
import { hitRadius, ObjectMark } from './marks.jsx';
import { BALL_COLOR } from '../core/pitch/themes.js';
import { createAnnotationLine, createBox, createEventFromStroke, createFreehand, EVENT_TOOLS, nearestPlayer, placeFromTool, receiverAt, snapDrag } from './interaction.js';

const DRAW_TOOLS = new Set(['pass', 'shot', 'run', 'dribble', 'press', 'defend', 'arrow', 'pen', 'highlight', 'zone', 'shape', 'text', 'place', 'eraser']);

function useCameraZoom() {
  return useSyncExternalStore((fn) => camera.subscribe(fn), () => camera.cam.zoom);
}

function useCameraRot() {
  return useSyncExternalStore((fn) => camera.subscribe(fn), () => Math.round(camera.target.rot));
}

/** Analysis redraws at most ten times a second during playback; it never touches React above it. */
function LiveAnalysis({ doc, theme, analysis, selected }) {
  const [t, setT] = useState(transport.t);
  useEffect(() => {
    let last = 0;
    return transport.onFrame((now) => {
      const wall = performance.now();
      if (!transport.playing || wall - last > 100) {
        last = wall;
        setT(now);
      }
    });
  }, []);
  const rot = useCameraRot();
  return <AnalysisStatic doc={doc} t={t} analysis={analysis} theme={theme} rot={rot} pair={selected} />;
}

/** Annotations attached to a player redraw as that player moves. */
function AnnotationsLayer({ doc, compiled, theme, selection, accent, k }) {
  const hasAttached = useMemo(() => doc.annotationOrder.some((id) => {
    const a = doc.annotations[id];
    return a?.startAttach || a?.endAttach || a?.showFrom != null || a?.showUntil != null;
  }), [doc.annotationOrder, doc.annotations]);
  const [t, setT] = useState(transport.t);
  useEffect(() => {
    if (!hasAttached) return undefined;
    setT(transport.t);
    return transport.onFrame(setT);
  }, [hasAttached]);
  const rot = useCameraRot();
  const time = hasAttached ? t : 0;
  return (
    <g>
      {doc.annotationOrder.map((id) => {
        const a = doc.annotations[id];
        if (!a || a.hidden) return null;
        if (a.showFrom != null && time < a.showFrom) return null;
        if (a.showUntil != null && time > a.showUntil) return null;
        const ends = annotationEnds(a, compiled, time);
        return <AnnotationMark key={id} a={a} theme={theme} selected={selection.includes(id)} p0={ends.p0} p3={ends.p3} accent={accent} rot={rot} k={k} />;
      })}
    </g>
  );
}

const ObjectNode = memo(function ObjectNode({ obj, teams, selected, labelMode, theme, register, accent }) {
  return (
    <g ref={(el) => register(obj.id, el)} data-object={obj.id}>
      <circle className="obj-hit" r={hitRadius(obj)} fill="transparent" data-hit="object" data-id={obj.id} style={{ cursor: obj.locked ? 'not-allowed' : 'grab' }} />
      <g pointerEvents="none">
        <ObjectMark obj={obj} teams={teams} selected={selected} labelMode={labelMode} theme={theme} accent={accent} />
      </g>
    </g>
  );
});

function Handle({ x, y, kind, owner, id, which, zoom, theme, accent }) {
  const r = 6.5 / zoom;
  const isControl = kind === 'control';
  return (
    <g>
      <circle cx={x} cy={y} r={15 / zoom} fill="transparent" data-hit="handle" data-owner={owner} data-id={id} data-which={which} style={{ cursor: 'grab' }} className="handle-hit" />
      <circle
        cx={x} cy={y} r={isControl ? r * 0.85 : r} pointerEvents="none"
        fill={isControl ? theme.ground : accent} stroke={isControl ? accent : '#fbfaf5'} strokeWidth={1.6 / zoom}
      />
    </g>
  );
}

/** Draggable points for whichever path is selected. */
function Handles({ doc, compiled, selection, theme, accent }) {
  const zoom = useCameraZoom();
  const out = [];
  const tether = (a, b, key) => <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={accent} strokeWidth={1 / zoom} strokeDasharray={`${3 / zoom} ${3 / zoom}`} pointerEvents="none" />;
  if (selection.events.length === 1) {
    const ev = doc.events[selection.events[0]];
    if (ev && EVENT_TYPES[ev.type]?.line !== 'none') {
      const p0 = eventStartPoint(compiled, ev);
      const p3 = eventEndPoint(compiled, ev);
      if (p0 && p3) {
        if (isMotion(ev.type)) {
          const { c1, c2 } = resolveControls(p0, ev.c1, ev.c2, p3);
          out.push(tether(p0, c1, 't1'), tether(p3, c2, 't2'));
          out.push(<Handle key="c1" x={c1.x} y={c1.y} kind="control" owner="event" id={ev.id} which="c1" zoom={zoom} theme={theme} accent={accent} />);
          out.push(<Handle key="c2" x={c2.x} y={c2.y} kind="control" owner="event" id={ev.id} which="c2" zoom={zoom} theme={theme} accent={accent} />);
          out.push(<Handle key="to" x={p3.x} y={p3.y} kind="end" owner="event" id={ev.id} which="to" zoom={zoom} theme={theme} accent={accent} />);
        } else {
          const c = ev.c ?? { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
          out.push(<Handle key="c" x={c.x} y={c.y} kind="control" owner="event" id={ev.id} which="c" zoom={zoom} theme={theme} accent={accent} />);
          out.push(<Handle key="to" x={p3.x} y={p3.y} kind="end" owner="event" id={ev.id} which="to" zoom={zoom} theme={theme} accent={accent} />);
        }
      }
    }
  }
  if (selection.annotations.length === 1) {
    const a = doc.annotations[selection.annotations[0]];
    if (a && !a.locked) {
      if (a.kind === 'arrow') {
        const ends = annotationEnds(a, compiled, transport.t);
        const { c1, c2 } = resolveControls(ends.p0, a.c1, a.c2, ends.p3);
        out.push(tether(ends.p0, c1, 't1'), tether(ends.p3, c2, 't2'));
        for (const [which, p, kind] of [['c1', c1, 'control'], ['c2', c2, 'control'], ['p0', ends.p0, 'end'], ['p3', ends.p3, 'end']]) {
          out.push(<Handle key={which} x={p.x} y={p.y} kind={kind} owner="annotation" id={a.id} which={which} zoom={zoom} theme={theme} accent={accent} />);
        }
      } else if (a.kind === 'rect' || a.kind === 'circle') {
        out.push(<Handle key="tl" x={a.x} y={a.y} kind="end" owner="annotation" id={a.id} which="tl" zoom={zoom} theme={theme} accent={accent} />);
        out.push(<Handle key="br" x={a.x + a.w} y={a.y + a.h} kind="end" owner="annotation" id={a.id} which="br" zoom={zoom} theme={theme} accent={accent} />);
      }
    }
  }
  return <g>{out}</g>;
}

function GhostFormation({ doc, ghost, customFormations, theme }) {
  const zoom = useCameraZoom();
  const formation = ghost && getFormation(ghost.id, customFormations);
  if (!formation) return null;
  const attack = doc.teams[ghost.team].attack;
  const teamPlayers = Object.values(doc.objects).filter((o) => o.type === 'player' && o.team === ghost.team && !o.sub);
  return (
    <g pointerEvents="none">
      {formation.slots.map((slot, i) => {
        const w = slotToWorld(doc.pitch, attack, slot);
        const nearest = teamPlayers.reduce((best, p) => {
          const d = Math.hypot(p.x - w.x, p.y - w.y);
          return d < best.d ? { d, p } : best;
        }, { d: Infinity, p: null });
        return (
          <g key={i}>
            {nearest.p && <line x1={nearest.p.x} y1={nearest.p.y} x2={w.x} y2={w.y} stroke={theme.overlay} strokeOpacity={0.35} strokeWidth={1 / zoom} />}
            <circle cx={w.x} cy={w.y} r={1.55} fill="none" stroke={theme.overlay} strokeWidth={0.16} strokeDasharray="0.5 0.4" />
          </g>
        );
      })}
    </g>
  );
}

export function Board() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const labelMode = useEditor((s) => s.labelMode);
  const pathMode = useEditor((s) => s.pathMode);
  const showAnnotations = useEditor((s) => s.showAnnotations);
  const analysis = useEditor((s) => s.analysis);
  const guides = useEditor((s) => s.guides);
  const ghost = useEditor((s) => s.ghost);
  const customFormations = useEditor((s) => s.customFormations);
  const presentation = useEditor((s) => s.presentation);
  const readOnly = useEditor((s) => s.readOnly);
  const followMode = useEditor((s) => s.followMode);
  const section = useEditor((s) => s.section);

  const compiled = compile(doc);
  const theme = getTheme(doc.pitch.theme);
  const accent = theme.ballLine;

  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const rootRef = useRef(null);
  const ballRef = useRef(null);
  const shadowRef = useRef(null);
  const ballBodyRef = useRef(null);
  const objectEls = useRef(new Map());
  const eventEls = useRef(new Map());
  const latest = useRef({});
  latest.current = { doc, compiled, pathMode, selection, followMode, presentation };

  const [draft, setDraft] = useState(null);
  const [editingText, setEditingText] = useState(null);

  const registerObject = useCallback((id, el) => {
    if (el) objectEls.current.set(id, el); else objectEls.current.delete(id);
  }, []);
  const registerEvent = useCallback((id, el) => {
    if (el) eventEls.current.set(id, el); else eventEls.current.delete(id);
  }, []);

  const hasAnalysis = analysis.hull || analysis.shape || analysis.network || analysis.heatmap || analysis.lanes || analysis.zones || analysis.offside || analysis.distance;

  /** Write the pose at time t to the DOM. Called from playback, without React. */
  const applyFrame = useCallback((t) => {
    const { doc: d, compiled: c, pathMode: mode, followMode: follow, selection: sel } = latest.current;
    const cam = camera.cam;
    const rot = cam.rot;
    const scale = Math.min(26 / (1.55 * cam.zoom), Math.max(1, 10.5 / (1.55 * cam.zoom)));
    for (const [id, el] of objectEls.current) {
      const m = motionAt(c, id, t);
      if (!m) continue;
      const b = fx.from ? fx.blend(id, m.x, m.y) : null;
      const x = b ? b.x : m.x;
      const y = b ? b.y : m.y;
      el.setAttribute('transform', `translate(${x.toFixed(3)} ${y.toFixed(3)}) rotate(${(-rot).toFixed(2)}) scale(${scale.toFixed(3)})`);
      const wedge = el.querySelector('[data-heading]');
      if (wedge) {
        wedge.setAttribute('opacity', m.moving ? '0.9' : '0');
        if (m.moving) wedge.setAttribute('transform', `rotate(${(m.heading + rot).toFixed(1)})`);
      }
    }
    const ball = ballAt(c, t);
    if (ballRef.current) {
      ballRef.current.setAttribute('transform', `translate(${ball.x.toFixed(3)} ${ball.y.toFixed(3)})`);
      const s = (1 + ball.h * 0.035) * Math.max(1, scale * 0.85);
      ballBodyRef.current.setAttribute('transform', `rotate(${-rot}) translate(0 ${(-ball.h * 0.34).toFixed(3)}) scale(${s.toFixed(3)})`);
      shadowRef.current.setAttribute('opacity', ball.h > 0.05 ? '0.3' : '0.2');
    }
    const playing = transport.playing;
    for (const [id, el] of eventEls.current) {
      const ev = d.events[id];
      if (!ev) continue;
      const end = eventArrival(ev);
      const start = ev.type === 'key' ? end - 0.4 : ev.t;
      const active = t >= start - 0.05 && t <= end + 0.25;
      let opacity = 1;
      if (mode === 'none') opacity = sel.events.includes(id) ? 1 : 0;
      else if (mode === 'active') opacity = active || sel.events.includes(id) ? 1 : 0;
      else if (playing || latest.current.presentation) opacity = active ? 1 : t > end ? 0.16 : 0.1;
      else if (t > 0.001) opacity = active ? 1 : t > end ? 0.34 : 0.72;
      el.setAttribute('opacity', opacity);
    }
    if (follow === 'ball') camera.follow(ball.x, ball.y);
    else if (follow === 'selected') {
      const id = sel.objects[0];
      const p = id ? positionAt(c, id, t) : null;
      if (p) camera.follow(p.x, p.y);
    }
  }, []);

  const applyCamera = useCallback(() => {
    const root = rootRef.current;
    if (!root || !camera.vw) return;
    const m = cameraMatrix(camera.cam, camera.vw, camera.vh);
    root.setAttribute('transform', `matrix(${m.map((v) => v.toFixed(4)).join(' ')})`);
  }, []);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const rotSetting = getEditor().rotationSetting;
      if (rotSetting !== 'manual' && camera.vw === 0 && height > width * 1.12) {
        camera.cam.rot = -90;
        camera.target.rot = -90;
      }
      camera.setViewport(width, height);
      applyCamera();
      applyFrame(transport.t);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyCamera, applyFrame]);

  useEffect(() => {
    let lastRot = null;
    let lastZoom = null;
    const off = camera.subscribe(() => {
      applyCamera();
      if (lastRot !== camera.cam.rot || lastZoom !== camera.cam.zoom) {
        lastRot = camera.cam.rot;
        lastZoom = camera.cam.zoom;
        applyFrame(transport.t);
      }
    });
    const offFrame = transport.onFrame(applyFrame);
    const offState = transport.onState(() => applyFrame(transport.t));
    fx.onUpdate = () => applyFrame(transport.t);
    return () => { off(); offFrame(); offState(); fx.onUpdate = null; };
  }, [applyCamera, applyFrame]);

  // React has just rendered: objects may be new, so write their pose straight away.
  useLayoutEffect(() => { applyCamera(); applyFrame(transport.t); });

  // The view changes what is framed.
  const boundsKey = `${doc.pitch.view}:${doc.pitch.length}:${doc.pitch.width}`;
  useEffect(() => {
    camera.setBounds(viewBounds(doc.pitch));
  }, [boundsKey]);

  useEffect(() => {
    if (followMode === 'none') camera.fit();
    else applyFrame(transport.t);
  }, [followMode, applyFrame]);

  /* ---------- Pointer handling ---------- */

  const pointers = useRef(new Map());
  const gesture = useRef(null);

  const toLocal = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toWorld = (e) => {
    const s = toLocal(e);
    return camera.toWorld(s.x, s.y);
  };

  const finishText = (id, value) => {
    const ed = getEditor();
    setEditingText(null);
    const text = value.trim();
    if (!text) {
      ed.commit((d) => { delete d.annotations[id]; d.annotationOrder = d.annotationOrder.filter((x) => x !== id); });
      return;
    }
    ed.commit((d) => updateAnnotation(d, id, { text }));
  };

  const startPinch = () => {
    const ed = getEditor();
    if (gesture.current?.type === 'objects' || gesture.current?.type === 'handle' || gesture.current?.type === 'annotation') ed.cancelGesture();
    setDraft(null);
    const pts = [...pointers.current.values()];
    gesture.current = {
      type: 'pinch',
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
    };
  };

  const onPointerDown = (e) => {
    const ed = getEditor();
    const local = toLocal(e);
    if (ed.menu) ed.openMenu(null);
    if (e.button === 2) return;
    pointers.current.set(e.pointerId, local);
    svgRef.current.setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) { startPinch(); return; }

    const world = camera.toWorld(local.x, local.y);
    const target = e.target.closest?.('[data-hit]');
    const hit = target ? { type: target.dataset.hit, id: target.dataset.id, owner: target.dataset.owner, which: target.dataset.which } : null;
    const t = transport.t;
    const mode = ed.tool;

    if (e.button === 1 || mode === 'move' && (!hit || hit.type === 'event') || ed.presentation || ed.readOnly) {
      if (ed.readOnly && hit?.type === 'object') ed.select({ objects: [hit.id] });
      gesture.current = { type: 'pan', last: local };
      return;
    }
    if (transport.playing) transport.pause();

    if (hit?.type === 'handle') {
      ed.beginGesture();
      gesture.current = { type: 'handle', ...hit, moved: false };
      return;
    }

    if (mode === 'select' || mode === 'move') {
      if (hit?.type === 'object') {
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        if (additive) { ed.toggleObjectSelection(hit.id); }
        else if (!ed.selection.objects.includes(hit.id)) ed.select({ objects: [hit.id] });
        const obj = doc.objects[hit.id];
        if (obj?.locked) return;
        let ids = getEditor().selection.objects.filter((id) => !doc.objects[id]?.locked);
        if (e.altKey) {
          ed.duplicateSelection();
          ids = getEditor().selection.objects;
        }
        if (!ids.length) return;
        const c = compile(getEditor().doc);
        const origin = {};
        for (const id of ids) origin[id] = positionAt(c, id, t);
        ed.beginGesture();
        gesture.current = { type: 'objects', ids, origin, start: world, primary: ids.includes(hit.id) ? hit.id : ids[0], moved: false };
        return;
      }
      if (hit?.type === 'ball') {
        if (t > 0.001) { ed.toast('The ball follows the events on the timeline. Go to the start to place it.', { kind: 'info' }); return; }
        ed.beginGesture();
        gesture.current = { type: 'ball', moved: false };
        return;
      }
      if (hit?.type === 'annotation') {
        const a = doc.annotations[hit.id];
        ed.select({ annotations: [hit.id] });
        if (!a || a.locked) return;
        ed.beginGesture();
        gesture.current = { type: 'annotation', id: hit.id, start: world, moved: false };
        return;
      }
      if (hit?.type === 'event') {
        if (e.shiftKey || e.metaKey || e.ctrlKey) ed.toggleEventSelection(hit.id);
        else ed.select({ events: [hit.id] });
        return;
      }
      if (mode === 'select') {
        if (!e.shiftKey) ed.clearSelection();
        gesture.current = { type: 'marquee', start: world, additive: e.shiftKey ? [...ed.selection.objects] : [] };
        setDraft({ kind: 'marquee', a: world, b: world });
      }
      return;
    }

    if (EVENT_TOOLS[mode]) {
      const c = compile(doc);
      const radius = Math.max(3, 24 / camera.cam.zoom);
      const actor = hit?.type === 'object' && doc.objects[hit.id]?.type === 'player'
        ? { id: hit.id, ...positionAt(c, hit.id, t) }
        : nearestPlayer(doc, c, world, t, radius);
      gesture.current = { type: 'stroke', tool: mode, actor: actor?.id ?? null, points: [actor ? { x: actor.x, y: actor.y } : world] };
      setDraft({ kind: 'stroke', tool: mode, actor: actor?.id ?? null, points: gesture.current.points, hit: null });
      return;
    }

    switch (mode) {
      case 'arrow': {
        const c = compile(doc);
        const snap = ed.snapping ? nearestPlayer(doc, c, world, t, Math.max(2.5, 18 / camera.cam.zoom)) : null;
        gesture.current = { type: 'arrow', startAttach: snap?.id ?? null, points: [snap ? { x: snap.x, y: snap.y } : world] };
        setDraft({ kind: 'stroke', tool: 'arrow', points: gesture.current.points });
        break;
      }
      case 'pen':
      case 'highlight':
      case 'zone':
        gesture.current = { type: 'freehand', kind: mode, points: [world] };
        setDraft({ kind: 'freehand', tool: mode, points: gesture.current.points });
        break;
      case 'shape':
        gesture.current = { type: 'box', kind: ed.variants.shape, start: world };
        setDraft({ kind: ed.variants.shape, a: world, b: world });
        break;
      case 'text':
        gesture.current = { type: 'text' };
        break;
      case 'place':
        placeFromTool(ed.variants.place, world);
        break;
      case 'eraser':
        gesture.current = { type: 'erase' };
        eraseAt(hit);
        break;
      default:
    }
  };

  const eraseAt = (hit) => {
    if (!hit) return;
    const ed = getEditor();
    if (hit.type === 'annotation' && !ed.doc.annotations[hit.id]?.locked) {
      ed.commit((d) => { delete d.annotations[hit.id]; d.annotationOrder = d.annotationOrder.filter((x) => x !== hit.id); });
    } else if (hit.type === 'event') {
      ed.commit((d) => { delete d.events[hit.id]; });
    } else if (hit.type === 'object' && ed.doc.objects[hit.id]?.type !== 'player' && !ed.doc.objects[hit.id]?.locked) {
      ed.commit((d) => {
        delete d.objects[hit.id];
        d.objectOrder = d.objectOrder.filter((x) => x !== hit.id);
      });
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    const local = toLocal(e);
    pointers.current.set(e.pointerId, local);
    const g = gesture.current;
    if (!g) return;
    const ed = getEditor();
    const world = camera.toWorld(local.x, local.y);
    const t = transport.t;

    switch (g.type) {
      case 'pinch': {
        const pts = [...pointers.current.values()];
        if (pts.length < 2) return;
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        camera.pan(mid.x - g.mid.x, mid.y - g.mid.y);
        if (g.dist > 0) camera.zoomAtPoint(mid.x, mid.y, dist / g.dist);
        g.dist = dist;
        g.mid = mid;
        break;
      }
      case 'pan':
        camera.pan(local.x - g.last.x, local.y - g.last.y);
        g.last = local;
        break;
      case 'objects': {
        const dx = world.x - g.start.x;
        const dy = world.y - g.start.y;
        const base = ed.gestureBase;
        const c = compile(base);
        const primary = g.origin[g.primary];
        const snapped = snapDrag(base, c, g.primary, { x: primary.x + dx, y: primary.y + dy }, t, e.altKey || g.ids.length > 1);
        const sx = snapped.x - primary.x;
        const sy = snapped.y - primary.y;
        g.moved = true;
        ed.updateGesture((d) => {
          for (const id of g.ids) placeObjectAt(d, c, id, t, +(g.origin[id].x + sx).toFixed(2), +(g.origin[id].y + sy).toFixed(2));
        });
        ed.setGuides(snapped.guides);
        break;
      }
      case 'ball': {
        g.moved = true;
        ed.updateGesture((d) => { d.ball = { x: +world.x.toFixed(2), y: +world.y.toFixed(2), owner: null, dead: d.ball.dead }; });
        break;
      }
      case 'annotation': {
        const dx = world.x - g.start.x;
        const dy = world.y - g.start.y;
        g.moved = true;
        ed.updateGesture((d) => { translateAnnotation(d.annotations[g.id], dx, dy); });
        break;
      }
      case 'handle':
        g.moved = true;
        moveHandle(g, world, e.altKey);
        break;
      case 'marquee':
        setDraft({ kind: 'marquee', a: g.start, b: world });
        break;
      case 'stroke':
      case 'arrow': {
        const last = g.points[g.points.length - 1];
        if (Math.hypot(last.x - world.x, last.y - world.y) > 0.25) g.points = [...g.points, world];
        let hitPlayer = null;
        if (g.type === 'stroke' && g.actor && EVENT_TOOLS[g.tool].group === 'ball' && g.tool !== 'shot') {
          const c = compile(doc);
          const from = footPosition(c, g.actor, t);
          hitPlayer = receiverAt(doc, c, ed.variants.pass, from, world, t, g.actor);
        }
        setDraft({ kind: 'stroke', tool: g.tool ?? 'arrow', actor: g.actor, points: g.points, hit: hitPlayer });
        break;
      }
      case 'freehand': {
        const last = g.points[g.points.length - 1];
        if (Math.hypot(last.x - world.x, last.y - world.y) > 0.2) g.points = [...g.points, world];
        setDraft({ kind: 'freehand', tool: g.kind, points: g.points });
        break;
      }
      case 'box':
        setDraft({ kind: g.kind, a: g.start, b: world });
        break;
      case 'erase': {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-hit]');
        if (el) eraseAt({ type: el.dataset.hit, id: el.dataset.id });
        break;
      }
      default:
    }
  };

  const moveHandle = (g, world, noSnap) => {
    const ed = getEditor();
    const base = ed.gestureBase;
    const c = compile(base);
    const t = transport.t;
    const p = { x: +world.x.toFixed(2), y: +world.y.toFixed(2) };
    if (g.owner === 'event') {
      const ev = base.events[g.id];
      ed.updateGesture((d) => {
        if (g.which === 'to' && !isMotion(ev.type)) {
          const from = eventStartPoint(c, ev);
          const rcv = noSnap || !ed.snapping || ev.type === 'shot' ? null : receiverAt(base, c, ev.type, from, p, ev.t, ev.actor);
          updateEvent(d, g.id, rcv ? { receiver: rcv.id, to: null } : { receiver: null, to: p });
        } else if (g.which === 'to') {
          updateEvent(d, g.id, { to: p });
        } else if (g.which === 'c') {
          updateEvent(d, g.id, { c: p });
        } else {
          const start = eventStartPoint(c, ev);
          const r = resolveControls(start, ev.c1, ev.c2, ev.to);
          updateEvent(d, g.id, { c1: r.c1, c2: r.c2, [g.which]: p });
        }
      });
    } else {
      const a = base.annotations[g.id];
      ed.updateGesture((d) => {
        if (g.which === 'p0' || g.which === 'p3') {
          const snap = noSnap || !ed.snapping ? null : nearestPlayer(base, c, p, t, Math.max(2.5, 18 / camera.cam.zoom));
          const attachKey = g.which === 'p0' ? 'startAttach' : 'endAttach';
          updateAnnotation(d, g.id, { [g.which]: snap ? { x: snap.x, y: snap.y } : p, [attachKey]: snap?.id ?? null });
        } else if (g.which === 'c1' || g.which === 'c2') {
          const ends = annotationEnds(a, c, t);
          const r = resolveControls(ends.p0, a.c1, a.c2, ends.p3);
          updateAnnotation(d, g.id, { c1: r.c1, c2: r.c2, [g.which]: p });
        } else if (g.which === 'tl') {
          updateAnnotation(d, g.id, { x: p.x, y: p.y, w: a.x + a.w - p.x, h: a.y + a.h - p.y });
        } else {
          updateAnnotation(d, g.id, { w: p.x - a.x, h: p.y - a.y });
        }
      });
    }
  };

  const onPointerUp = (e) => {
    const local = pointers.current.get(e.pointerId) ?? toLocal(e);
    pointers.current.delete(e.pointerId);
    svgRef.current.releasePointerCapture?.(e.pointerId);
    const g = gesture.current;
    if (g?.type === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null;
      else {
        const [only] = [...pointers.current.values()];
        gesture.current = { type: 'pan', last: only };
      }
      return;
    }
    gesture.current = null;
    if (!g) return;
    const ed = getEditor();
    const world = camera.toWorld(local.x, local.y);
    switch (g.type) {
      case 'objects':
      case 'annotation':
      case 'handle':
        ed.endGesture();
        break;
      case 'ball': {
        const base = ed.doc;
        const c = compile(base);
        const near = nearestPlayer(base, c, base.ball, 0, 3.2);
        if (near) ed.updateGesture((d) => { d.ball = { ...d.ball, owner: near.id }; });
        ed.endGesture();
        break;
      }
      case 'marquee': {
        setDraft(null);
        const c = compile(ed.doc);
        const inRect = (p) => p.x >= Math.min(g.start.x, world.x) && p.x <= Math.max(g.start.x, world.x) && p.y >= Math.min(g.start.y, world.y) && p.y <= Math.max(g.start.y, world.y);
        if (Math.hypot(g.start.x - world.x, g.start.y - world.y) < 0.6) break;
        const ids = Object.values(ed.doc.objects).filter((o) => !o.hidden && inRect(positionAt(c, o.id, transport.t))).map((o) => o.id);
        ed.select({ objects: [...new Set([...g.additive, ...ids])] });
        break;
      }
      case 'stroke': {
        setDraft(null);
        const end = g.points[g.points.length - 1];
        if (g.actor) {
          createEventFromStroke(g.tool, g.actor, g.points);
        } else if (Math.hypot(end.x - g.points[0].x, end.y - g.points[0].y) > 1) {
          const style = g.tool === 'pass' ? 'pass' : g.tool;
          createAnnotationLine(style, g.points);
        } else {
          ed.toast(`Start on a player to add this to the timeline.`, { kind: 'info' });
        }
        break;
      }
      case 'arrow': {
        setDraft(null);
        const variant = ed.variants.arrow;
        const c = compile(ed.doc);
        const snap = ed.snapping ? nearestPlayer(ed.doc, c, world, transport.t, Math.max(2.5, 18 / camera.cam.zoom), { exclude: g.startAttach }) : null;
        const pts = snap ? [...g.points.slice(0, -1), { x: snap.x, y: snap.y }] : g.points;
        createAnnotationLine('arrow', variant === 'straight' || variant === 'dashed' ? [pts[0], pts[pts.length - 1]] : pts, {
          curved: variant === 'curved', dash: variant === 'dashed' ? 'dashed' : 'solid',
          startAttach: g.startAttach, endAttach: snap?.id ?? null,
        });
        break;
      }
      case 'text': {
        let id;
        ed.commit((d) => {
          id = addAnnotation(d, { kind: 'text', x: world.x, y: world.y, text: 'Note', size: 2.4, head: 'none' });
        });
        ed.select({ annotations: [id] });
        setEditingText(id);
        ed.setTool('select');
        break;
      }
      case 'freehand':
        setDraft(null);
        createFreehand(g.kind, g.points);
        break;
      case 'box':
        setDraft(null);
        createBox(g.kind, g.start, world);
        break;
      default:
    }
  };

  const onPointerCancel = (e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (g && ['objects', 'annotation', 'handle', 'ball'].includes(g.type)) getEditor().cancelGesture();
  };

  useEffect(() => {
    const el = svgRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const isMouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 100 && Number.isInteger(e.deltaY));
      if (e.ctrlKey || e.metaKey) camera.zoomAtPoint(x, y, Math.exp(-e.deltaY * 0.01));
      else if (isMouseWheel) camera.zoomAtPoint(x, y, Math.exp(-e.deltaY * 0.0016 * (e.deltaMode === 1 ? 30 : 1)));
      else camera.pan(-e.deltaX, -e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && gesture.current) {
        const g = gesture.current;
        gesture.current = null;
        setDraft(null);
        if (['objects', 'annotation', 'handle', 'ball'].includes(g.type)) getEditor().cancelGesture();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const onContextMenu = (e) => {
    e.preventDefault();
    const ed = getEditor();
    if (ed.readOnly || ed.presentation) return;
    const under = document.elementFromPoint(e.clientX, e.clientY) ?? e.target;
    const target = under.closest?.('[data-hit]');
    const hit = target ? { type: target.dataset.hit, id: target.dataset.id } : null;
    const world = toWorld(e);
    if (hit?.type === 'object' && !ed.selection.objects.includes(hit.id)) ed.select({ objects: [hit.id] });
    if (hit?.type === 'annotation') ed.select({ annotations: [hit.id] });
    if (hit?.type === 'event') ed.select({ events: [hit.id] });
    ed.openMenu({ x: e.clientX, y: e.clientY, hit, world });
  };

  const onDoubleClick = (e) => {
    const ed = getEditor();
    if (ed.readOnly) return;
    const target = e.target.closest?.('[data-hit]');
    if (target?.dataset.hit === 'annotation' && ed.doc.annotations[target.dataset.id]?.kind === 'text') {
      setEditingText(target.dataset.id);
    } else if (target?.dataset.hit === 'object') {
      ed.togglePanel('inspector', true);
      requestAnimationFrame(() => document.getElementById('inspector-name')?.focus());
    } else if (!target && ed.tool === 'select') {
      camera.fit();
    }
  };

  const orderedObjects = useMemo(() => {
    const props = [];
    const players = [];
    for (const id of doc.objectOrder) {
      const o = doc.objects[id];
      if (!o || o.hidden) continue;
      (o.type === 'player' ? players : props).push(o);
    }
    return [...props, ...players];
  }, [doc.objectOrder, doc.objects]);

  const cursorClass = tool === 'move' ? 'cursor-grab' : DRAW_TOOLS.has(tool) ? (tool === 'eraser' ? 'cursor-erase' : 'cursor-cross') : '';
  const zoomForGuide = useCameraZoom();
  const lineK = lineScaleForZoom(zoomForGuide);

  const editingAnn = editingText && doc.annotations[editingText];
  const showHandles = !presentation && !readOnly && (tool === 'select' || tool === 'move');

  return (
    <div ref={wrapRef} className={`board ${cursorClass}`} data-testid="board" data-section={section}>
      <svg
        ref={svgRef} className="board-svg" width="100%" height="100%"
        role="application" aria-label={`Tactics board: ${doc.title}. Use the object list in the inspector to select players without a pointer.`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
        onContextMenu={onContextMenu} onDoubleClick={onDoubleClick}
      >
        <g ref={rootRef}>
          <PitchLayer pitch={doc.pitch} theme={theme} />
          <OverlayLayer pitch={doc.pitch} theme={theme} />
          {hasAnalysis && <LiveAnalysis doc={doc} theme={theme} analysis={analysis} selected={selection.objects} />}
          {ghost && <GhostFormation doc={doc} ghost={ghost} customFormations={customFormations} theme={theme} />}
          {showAnnotations && <AnnotationsLayer doc={doc} compiled={compiled} theme={theme} selection={selection.annotations} accent={accent} k={lineK} />}
          {!analysis.network && <EventLines compiled={compiled} theme={theme} selected={selection.events} accent={accent} eventRef={registerEvent} k={lineK} />}
          <g>
            {!analysis.network && orderedObjects.map((o) => (
              <ObjectNode
                key={o.id} obj={o} teams={doc.teams} selected={selection.objects.includes(o.id)}
                labelMode={labelMode} theme={theme} register={registerObject} accent={accent}
              />
            ))}
          </g>
          {!analysis.network && (
            <g ref={ballRef} data-hit="ball" style={{ cursor: 'grab' }}>
              <circle r={1.4} fill="transparent" />
              <ellipse ref={shadowRef} rx={0.6} ry={0.42} fill="#000" opacity={0.2} pointerEvents="none" />
              <g ref={ballBodyRef} pointerEvents="none">
                <circle r={0.64} fill={BALL_COLOR} stroke={theme.ground} strokeWidth={0.14} />
              </g>
            </g>
          )}
          {guides.map((g, i) => (
            g.axis === 'x'
              ? <line key={i} x1={g.value} x2={g.value} y1={-200} y2={doc.pitch.width + 200} stroke={accent} strokeWidth={1 / zoomForGuide} pointerEvents="none" />
              : <line key={i} y1={g.value} y2={g.value} x1={-200} x2={doc.pitch.length + 200} stroke={accent} strokeWidth={1 / zoomForGuide} pointerEvents="none" />
          ))}
          {showHandles && <Handles doc={doc} compiled={compiled} selection={selection} theme={theme} accent={accent} />}
          {draft && <Draft draft={draft} theme={theme} doc={doc} compiled={compiled} zoom={zoomForGuide} />}
        </g>
      </svg>
      {editingAnn && (
        <TextEditor key={editingText} annotation={editingAnn} onDone={(v) => finishText(editingText, v)} />
      )}
    </div>
  );
}

function TextEditor({ annotation, onDone }) {
  const s = camera.toScreen(annotation.x, annotation.y);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref} className="board-text-input" defaultValue={annotation.text} aria-label="Note text"
      style={{ left: s.x, top: s.y - (annotation.size ?? 2.4) * camera.cam.zoom * 1.1, fontSize: (annotation.size ?? 2.4) * camera.cam.zoom }}
      onBlur={(e) => onDone(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.target.blur(); } e.stopPropagation(); }}
    />
  );
}

function Draft({ draft, theme, zoom }) {
  if (draft.kind === 'marquee') {
    return <rect x={Math.min(draft.a.x, draft.b.x)} y={Math.min(draft.a.y, draft.b.y)} width={Math.abs(draft.a.x - draft.b.x)} height={Math.abs(draft.a.y - draft.b.y)} fill={theme.overlay} fillOpacity={0.1} stroke={theme.overlay} strokeWidth={1 / zoom} pointerEvents="none" />;
  }
  if (draft.kind === 'rect') {
    return <rect x={Math.min(draft.a.x, draft.b.x)} y={Math.min(draft.a.y, draft.b.y)} width={Math.abs(draft.a.x - draft.b.x)} height={Math.abs(draft.a.y - draft.b.y)} fill={theme.arrow} fillOpacity={0.14} stroke={theme.arrow} strokeWidth={0.24} pointerEvents="none" />;
  }
  if (draft.kind === 'circle') {
    return <ellipse cx={(draft.a.x + draft.b.x) / 2} cy={(draft.a.y + draft.b.y) / 2} rx={Math.abs(draft.a.x - draft.b.x) / 2} ry={Math.abs(draft.a.y - draft.b.y) / 2} fill={theme.arrow} fillOpacity={0.14} stroke={theme.arrow} strokeWidth={0.24} pointerEvents="none" />;
  }
  if (draft.kind === 'freehand') {
    const d = smoothPathD(draft.points);
    if (draft.tool === 'zone') return <path d={`${d}Z`} fill={theme.arrow} fillOpacity={0.14} stroke={theme.arrow} strokeWidth={0.24} pointerEvents="none" />;
    if (draft.tool === 'highlight') return <path d={d} fill="none" stroke={theme.arrow} strokeOpacity={0.34} strokeWidth={2.7} strokeLinecap="round" pointerEvents="none" />;
    return <path d={d} fill="none" stroke={theme.arrow} strokeWidth={0.24} strokeLinecap="round" pointerEvents="none" />;
  }
  const pts = draft.points;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const isBall = EVENT_TOOLS[draft.tool]?.group === 'ball';
  const color = isBall ? theme.ballLine : theme.arrow;
  const end = draft.hit ?? b;
  const d = isBall ? cubicPathD(a, null, null, end) : smoothPathD(pts.length > 40 ? pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1) : pts);
  return (
    <g pointerEvents="none">
      <path d={d} fill="none" stroke={color} strokeWidth={0.28} strokeDasharray={draft.tool === 'run' ? '1.1 0.7' : undefined} strokeLinecap="round" />
      <circle cx={end.x} cy={end.y} r={draft.hit ? 2.4 : 0.5} fill={draft.hit ? 'none' : color} stroke={color} strokeWidth={0.22} />
      {!draft.actor && EVENT_TOOLS[draft.tool] && <circle cx={a.x} cy={a.y} r={0.5} fill={color} />}
    </g>
  );
}
