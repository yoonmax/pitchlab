import { addAnnotation, addEvent, addObject, addPlayer } from '../core/document.js';
import { fitCubic, simplify } from '../core/animation/bezier.js';
import { ballSegmentAt, compile, eventArrival, footPosition, ownerAt, positionAt } from '../core/animation/timeline.js';
import { clampToPitch, goalCenter } from '../core/pitch/geometry.js';
import { defaultDuration, EVENT_TYPES, isMotion, objectLabel } from '../core/tactics/events.js';
import { getEditor } from '../state/editorStore.js';
import { transport } from '../state/transport.js';
import { camera } from './camera.js';
import { getFormation } from '../core/formations/catalog.js';
import { slotToWorld } from '../core/formations/engine.js';

export const EVENT_TOOLS = {
  pass: { group: 'ball', variantGroup: 'pass' },
  shot: { group: 'ball', type: 'shot' },
  run: { group: 'motion', variantGroup: 'run' },
  dribble: { group: 'motion', type: 'dribble' },
  press: { group: 'motion', type: 'press' },
  defend: { group: 'motion', type: 'defend' },
};

export function nearestPlayer(doc, compiled, world, t, radius, { exclude = null, playersOnly = true } = {}) {
  let best = null;
  let bestD = radius;
  for (const o of Object.values(doc.objects)) {
    if (o.hidden || o.id === exclude) continue;
    if (playersOnly && o.type !== 'player') continue;
    const p = positionAt(compiled, o.id, t);
    if (!p) continue;
    const d = Math.hypot(p.x - world.x, p.y - world.y);
    if (d < bestD) { bestD = d; best = { id: o.id, x: p.x, y: p.y }; }
  }
  return best;
}

/**
 * The player a ball dropped here is meant for. A coach may drop it on a player,
 * or anywhere along the run they are about to make. Dropping on a run returns the
 * time they reach that spot, so the ball arrives with them.
 */
export function receiverAt(doc, compiled, type, from, world, t, actorId) {
  let best = null;
  let bestD = Math.max(3.2, 22 / camera.cam.zoom);
  const horizon = 6;
  const step = 0.2;
  for (const o of Object.values(doc.objects)) {
    if (o.type !== 'player' || o.hidden || o.id === actorId) continue;
    const moving = compiled.tracks[o.id]?.segs.some((s) => s.t1 > t);
    const span = moving ? horizon : 0;
    for (let dt = 0; dt <= span + 1e-6; dt += step) {
      const p = positionAt(compiled, o.id, t + dt);
      const d = Math.hypot(p.x - world.x, p.y - world.y);
      if (d < bestD) { bestD = d; best = { id: o.id, x: p.x, y: p.y, arriveAt: moving ? t + dt : null }; }
    }
  }
  return best;
}

/** How long a ball takes, matched to a receiver's arrival when that speed is believable. */
export function flightDuration(type, dist, t, arriveAt) {
  const base = defaultDuration(type, dist);
  if (arriveAt == null) return base;
  const wanted = arriveAt - t;
  if (wanted <= 0.15) return base;
  const speed = dist / wanted;
  const max = EVENT_TYPES[type].speed * 1.6;
  const min = 6;
  if (speed > max) return Math.max(0.3, +(dist / max).toFixed(2));
  if (speed < min) return +(dist / min).toFixed(2);
  return +wanted.toFixed(2);
}

/**
 * Work out when a ball action can start. If the player only gets the ball later,
 * the action starts when it reaches them, which is what a coach means by
 * "then he crosses it". Returns null when they never have the ball.
 */
export function resolveBallStart(doc, compiled, actor, t) {
  if (ownerAt(compiled, t) === actor) return { t, giveBall: false };
  const seg = ballSegmentAt(compiled, t);
  const noBallYet = compiled.events.every((e) => EVENT_TYPES[e.type]?.group !== 'ball' && e.type !== 'interception' && e.type !== 'tackle');
  if (noBallYet && seg?.kind !== 'held') return { t, giveBall: true };
  if (noBallYet && seg?.kind === 'held') return { t, giveBall: true };
  const later = compiled.ball.find((s) => s.kind === 'held' && s.owner === actor && s.t0 >= t - 1e-6);
  if (later) return { t: +(later.t0 + 0.15).toFixed(2), giveBall: false };
  if (seg?.kind === 'free' || seg?.kind === 'dead') {
    const p = positionAt(compiled, actor, t);
    if (Math.hypot(p.x - seg.x, p.y - seg.y) <= 5) return { t, giveBall: false };
  }
  return null;
}

/** The time a movement can start: this player's previous move must have finished. */
export function resolveMotionStart(doc, actor, t) {
  let earliest = t;
  for (const ev of Object.values(doc.events)) {
    if (ev.actor !== actor || !isMotion(ev.type)) continue;
    const arrival = eventArrival(ev);
    if (arrival > earliest && ev.t <= earliest + 1e-6) earliest = arrival;
  }
  return +earliest.toFixed(3);
}

/** Turn a finished drag with a tool into a timeline event. */
export function createEventFromStroke(tool, actorId, points, altTarget) {
  const editor = getEditor();
  const { doc, variants } = editor;
  const compiled = compile(doc);
  const def = EVENT_TOOLS[tool];
  const type = def.type ?? variants[def.variantGroup];
  const meta = EVENT_TYPES[type];
  const last = points[points.length - 1];
  const t = transport.t;
  const name = objectLabel(doc.objects[actorId]);

  if (meta.group === 'motion') {
    let startT = resolveMotionStart(doc, actorId, t);
    let giveBall = false;
    if (meta.needsBall) {
      const b = resolveBallStart(doc, compiled, actorId, startT);
      if (!b) { editor.toast(`${name} does not have the ball at this point. Move the playhead, or pass to them first.`, { kind: 'warn' }); return null; }
      startT = Math.max(startT, b.t);
      giveBall = b.giveBall;
    }
    const start = positionAt(compiled, actorId, startT);
    const pts = [start, ...simplify(points.slice(1), 0.12)];
    const clean = pts.length > 1 ? pts : [start, last];
    const fit = fitCubic(denseResample(clean));
    const dist = strokeLength(clean);
    if (dist < 0.8) return null;
    const duration = defaultDuration(type, dist);
    let id;
    editor.commit((d) => {
      if (giveBall) { d.ball.owner = actorId; d.ball.dead = false; }
      id = addEvent(d, { type, actor: actorId, t: startT, duration, to: last, c1: fit.c1, c2: fit.c2 });
    });
    editor.select({ events: [id] });
    if (meta.needsBall && editor.advanceAfterBall) transport.seek(startT + duration);
    return id;
  }

  const res = resolveBallStart(doc, compiled, actorId, t);
  if (!res) { editor.toast(`${name} does not have the ball at this point. Move the playhead, or pass to them first.`, { kind: 'warn' }); return null; }
  const from = footPosition(compiled, actorId, res.t);
  let to = last;
  if (type === 'shot' && Math.hypot(last.x - from.x, last.y - from.y) < 2) {
    const side = doc.teams[doc.objects[actorId].team]?.attack ?? 'right';
    to = goalCenter(doc.pitch, side);
  }
  const receiver = altTarget ?? (type === 'shot' ? null : receiverAt(doc, compiled, type, from, to, res.t, actorId));
  const target = receiver ?? to;
  const dist = Math.hypot(target.x - from.x, target.y - from.y);
  if (dist < 1) return null;
  const duration = flightDuration(type, dist, res.t, receiver?.arriveAt);
  let id;
  editor.commit((d) => {
    if (res.giveBall) { d.ball.owner = actorId; d.ball.dead = false; }
    id = addEvent(d, {
      type, actor: actorId, t: res.t, duration, receiver: receiver?.id ?? null,
      to: receiver ? null : { x: to.x, y: to.y }, loft: meta.loft ?? 0,
    });
  });
  editor.select({ events: [id] });
  if (editor.advanceAfterBall) transport.seek(res.t + duration + 0.1);
  return id;
}

function strokeLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

function denseResample(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.floor(l / 1.5));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** Annotation from a line stroke that did not start on a player. */
export function createAnnotationLine(style, points, { curved = false, dash = 'solid', startAttach = null, endAttach = null } = {}) {
  const editor = getEditor();
  const p0 = points[0];
  const p3 = points[points.length - 1];
  if (Math.hypot(p3.x - p0.x, p3.y - p0.y) < 1) return null;
  let c1 = null;
  let c2 = null;
  if (points.length > 3) {
    const fit = fitCubic(denseResample(simplify(points, 0.12)));
    c1 = fit.c1;
    c2 = fit.c2;
  }
  if (curved && !c1) {
    const dx = p3.x - p0.x;
    const dy = p3.y - p0.y;
    const k = 0.22;
    c1 = { x: p0.x + dx / 3 - dy * k, y: p0.y + dy / 3 + dx * k };
    c2 = { x: p0.x + (dx * 2) / 3 - dy * k, y: p0.y + (dy * 2) / 3 + dx * k };
  }
  let id;
  editor.commit((d) => {
    id = addAnnotation(d, { kind: 'arrow', lineStyle: style, p0, p3, c1, c2, dash, startAttach, endAttach });
  });
  editor.select({ annotations: [id] });
  return id;
}

export function createFreehand(kind, points) {
  const editor = getEditor();
  const simplified = simplify(points, kind === 'zone' ? 0.45 : 0.14);
  if (simplified.length < 2) return null;
  let id;
  editor.commit((d) => {
    id = addAnnotation(d, { kind, points: simplified, width: kind === 'highlight' ? 3 : 2, head: 'none', fill: 0.2 });
  });
  editor.select({ annotations: [id] });
  return id;
}

export function createBox(kind, a, b) {
  const editor = getEditor();
  if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) return null;
  let id;
  editor.commit((d) => {
    id = addAnnotation(d, { kind, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), head: 'none', width: 2, fill: 0.14 });
  });
  editor.select({ annotations: [id] });
  return id;
}

export function placeFromTool(variant, world) {
  const editor = getEditor();
  const { doc } = editor;
  const p = clampToPitch(doc.pitch, world.x, world.y);
  let id;
  editor.commit((d) => {
    if (variant === 'player-home') id = addPlayer(d, { team: 'home', ...p });
    else if (variant === 'player-away') id = addPlayer(d, { team: 'away', ...p });
    else if (variant === 'player-neutral') id = addPlayer(d, { team: 'neutral', ...p, number: '' });
    else id = addObject(d, { type: variant, ...p });
  });
  editor.select({ objects: [id] });
  return id;
}

/** Snap a dragged object to other players' lines and to a ghost formation. */
export function snapDrag(doc, compiled, id, p, t, disabled) {
  const editor = getEditor();
  if (!editor.snapping || disabled) return { x: p.x, y: p.y, guides: [] };
  const tol = 7 / camera.cam.zoom;
  let { x, y } = p;
  const guides = [];

  const ghost = editor.ghost && getFormation(editor.ghost.id, editor.customFormations);
  if (ghost && doc.objects[id]?.team === editor.ghost.team) {
    const attack = doc.teams[editor.ghost.team].attack;
    for (const slot of ghost.slots) {
      const w = slotToWorld(doc.pitch, attack, slot);
      if (Math.hypot(w.x - p.x, w.y - p.y) < Math.max(1.6, tol * 2)) return { x: w.x, y: w.y, guides: [] };
    }
  }

  let bestX = tol;
  let bestY = tol;
  let lineX = null;
  let lineY = null;
  for (const o of Object.values(doc.objects)) {
    if (o.id === id || o.hidden || o.type !== 'player' || o.sub) continue;
    const q = positionAt(compiled, o.id, t);
    if (Math.abs(q.x - p.x) < bestX) { bestX = Math.abs(q.x - p.x); lineX = q.x; }
    if (Math.abs(q.y - p.y) < bestY) { bestY = Math.abs(q.y - p.y); lineY = q.y; }
  }
  if (lineX !== null) { x = lineX; guides.push({ axis: 'x', value: lineX }); }
  if (lineY !== null) { y = lineY; guides.push({ axis: 'y', value: lineY }); }
  return { x, y, guides };
}

