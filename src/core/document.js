import { uid } from './ids.js';
import { createPitch } from './pitch/geometry.js';
import { KIT_DEFAULTS } from './pitch/themes.js';
import { EVENT_TYPES, defaultDuration, isMotion } from './tactics/events.js';
import { cubicLength } from './animation/bezier.js';

export const SCHEMA_VERSION = 2;

export const CATEGORIES = ['Build-up', 'Attacking', 'Pressing', 'Defensive', 'Transition', 'Corners', 'Free kicks', 'Throw-ins', 'Drills'];

export const OBJECT_TYPES = {
  player: { label: 'Player', radius: 1.55 },
  cone: { label: 'Cone', radius: 0.7 },
  pole: { label: 'Pole', radius: 0.45 },
  mannequin: { label: 'Mannequin', radius: 1 },
  smallgoal: { label: 'Small goal', radius: 1.6 },
  fullgoal: { label: 'Full goal', radius: 3.66 },
  coach: { label: 'Coach', radius: 1.4 },
  ballprop: { label: 'Spare ball', radius: 0.55 },
};

export function createDocument(options = {}) {
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION,
    id: uid('doc'),
    kind: 'play',
    title: 'Untitled play',
    description: '',
    tags: [],
    category: 'Attacking',
    notes: '',
    createdAt: now,
    updatedAt: now,
    pitch: createPitch(options.preset ?? '11v11'),
    teams: {
      home: { name: 'Home', color: KIT_DEFAULTS.home.color, gk: KIT_DEFAULTS.home.gk, attack: 'right' },
      away: { name: 'Away', color: KIT_DEFAULTS.away.color, gk: KIT_DEFAULTS.away.gk, attack: 'left' },
    },
    objects: {},
    objectOrder: [],
    annotations: {},
    annotationOrder: [],
    events: {},
    ball: { x: 52.5, y: 34, owner: null, dead: false },
    drill: null,
    ...options.fields,
  };
}

export function createDrillMeta(fields = {}) {
  return {
    objective: '', players: '', durationMin: 15, equipment: '', fieldSize: '',
    instructions: '', coachingPoints: '', progressions: '', variations: '', ...fields,
  };
}

/* ---------- Objects ---------- */

export function addObject(doc, fields) {
  const id = fields.id ?? uid(fields.type === 'player' || !fields.type ? 'p' : 'o');
  doc.objects[id] = {
    id, type: 'player', team: 'neutral', x: 0, y: 0, number: '', name: '', position: '', color: null,
    gk: false, sub: false, locked: false, hidden: false, notes: '', rotation: 0, ...fields,
  };
  doc.objectOrder.push(id);
  return id;
}

export function addPlayer(doc, fields = {}) {
  const team = fields.team ?? 'home';
  const number = fields.number ?? nextNumber(doc, team);
  return addObject(doc, { type: 'player', team, number, ...fields });
}

export function nextNumber(doc, team) {
  const taken = new Set(Object.values(doc.objects).filter((o) => o.type === 'player' && o.team === team).map((o) => Number(o.number)));
  let n = 1;
  while (taken.has(n)) n += 1;
  return n;
}

export function updateObject(doc, id, patch) {
  if (doc.objects[id]) Object.assign(doc.objects[id], patch);
}

export function deleteObjects(doc, ids) {
  const gone = new Set(ids);
  for (const id of ids) delete doc.objects[id];
  doc.objectOrder = doc.objectOrder.filter((id) => !gone.has(id));
  for (const [eid, ev] of Object.entries(doc.events)) {
    if (gone.has(ev.actor)) delete doc.events[eid];
    else if (gone.has(ev.receiver)) {
      // Keep the pass as a ball into space rather than leaving a dangling reference.
      ev.receiver = null;
    }
  }
  for (const a of Object.values(doc.annotations)) {
    if (gone.has(a.startAttach)) a.startAttach = null;
    if (gone.has(a.endAttach)) a.endAttach = null;
  }
  if (gone.has(doc.ball.owner)) doc.ball.owner = null;
}

export function duplicateObjects(doc, ids, dx = 3, dy = 3) {
  const out = [];
  for (const id of ids) {
    const src = doc.objects[id];
    if (!src) continue;
    const copy = { ...src, id: undefined, x: src.x + dx, y: src.y + dy };
    delete copy.id;
    if (copy.type === 'player') copy.number = nextNumber(doc, copy.team);
    out.push(addObject(doc, copy));
  }
  return out;
}

export function reassignTeam(doc, id, team) {
  const o = doc.objects[id];
  if (!o) return;
  o.team = team;
  o.color = null;
  if (o.type === 'player') {
    const clash = Object.values(doc.objects).some((p) => p.id !== id && p.type === 'player' && p.team === team && String(p.number) === String(o.number));
    if (clash) o.number = nextNumber(doc, team);
  }
}

export function reorderObject(doc, id, direction) {
  const list = doc.objectOrder;
  const i = list.indexOf(id);
  if (i < 0) return;
  list.splice(i, 1);
  if (direction === 'front') list.push(id);
  else if (direction === 'back') list.unshift(id);
  else if (direction === 'forward') list.splice(Math.min(list.length, i + 1), 0, id);
  else list.splice(Math.max(0, i - 1), 0, id);
}

/* ---------- Events ---------- */

export function addEvent(doc, fields) {
  const id = fields.id ?? uid('e');
  const meta = EVENT_TYPES[fields.type];
  const order = Object.keys(doc.events).length;
  doc.events[id] = {
    id, type: 'run', actor: null, t: 0, duration: 1, comment: '', order,
    ...(isMotion(fields.type) ? { to: null, c1: null, c2: null } : { to: null, receiver: null, c: null, loft: meta?.loft ?? 0 }),
    ...fields,
  };
  return id;
}

export function updateEvent(doc, id, patch) {
  if (doc.events[id]) Object.assign(doc.events[id], patch);
}

export function deleteEvents(doc, ids) {
  for (const id of ids) delete doc.events[id];
}

export function duplicateEvents(doc, ids, offset = 0.5) {
  const out = [];
  for (const id of ids) {
    const src = doc.events[id];
    if (!src) continue;
    const { id: _drop, ...rest } = src;
    out.push(addEvent(doc, { ...JSON.parse(JSON.stringify(rest)), t: src.t + offset }));
  }
  return out;
}

/** Move events in time; events that share a group move together. */
export function shiftEvents(doc, ids, dt) {
  const all = expandGroups(doc, ids);
  let minT = Infinity;
  for (const id of all) minT = Math.min(minT, doc.events[id]?.t ?? Infinity);
  const delta = Math.max(dt, -minT);
  for (const id of all) if (doc.events[id]) doc.events[id].t = round(doc.events[id].t + delta);
}

export function expandGroups(doc, ids) {
  const set = new Set(ids);
  const groups = new Set(ids.map((id) => doc.events[id]?.group).filter(Boolean));
  if (groups.size) for (const ev of Object.values(doc.events)) if (groups.has(ev.group)) set.add(ev.id);
  return [...set];
}

export function groupEvents(doc, ids) {
  const g = uid('g');
  for (const id of ids) if (doc.events[id]) doc.events[id].group = g;
  return g;
}

export function ungroupEvents(doc, ids) {
  for (const id of expandGroups(doc, ids)) if (doc.events[id]) doc.events[id].group = null;
}

export function alignEvents(doc, ids, edge = 'start') {
  const evs = ids.map((id) => doc.events[id]).filter(Boolean);
  if (evs.length < 2) return;
  if (edge === 'start') {
    const t = Math.min(...evs.map((e) => e.t));
    for (const e of evs) e.t = t;
  } else {
    const end = Math.max(...evs.map((e) => e.t + (e.type === 'key' ? 0 : e.duration)));
    for (const e of evs) e.t = e.type === 'key' ? end : round(end - e.duration);
  }
}

export function setEventDuration(doc, id, duration) {
  const ev = doc.events[id];
  if (ev) ev.duration = Math.max(0.1, round(duration));
}

/** Add or update a keyframe. The player's start for this move comes from the previous arrival. */
export function setKeyframe(doc, objectId, t, x, y, extra = {}) {
  const existing = Object.values(doc.events).find((e) => e.type === 'key' && e.actor === objectId && Math.abs(e.t - t) < 0.02);
  if (existing) {
    existing.to = { x, y };
    Object.assign(existing, extra);
    return existing.id;
  }
  return addEvent(doc, { type: 'key', actor: objectId, t: round(t), duration: 0, to: { x, y }, ease: 'smooth', ...extra });
}

/**
 * Dragging an object on the board. At the very start of the timeline this moves
 * its starting position; later it writes where the object should be at that time.
 */
export function placeObjectAt(doc, compiled, id, t, x, y) {
  if (t <= 0.001) {
    const o = doc.objects[id];
    if (o) { o.x = x; o.y = y; }
    return null;
  }
  // Moving a player at the exact end of a movement edits that movement.
  const arrivals = Object.values(doc.events).filter((e) => e.actor === id && isMotion(e.type) && Math.abs((e.type === 'key' ? e.t : e.t + e.duration) - t) < 0.02);
  if (arrivals[0]) {
    arrivals[0].to = { x, y };
    return arrivals[0].id;
  }
  return setKeyframe(doc, id, t, x, y);
}

export function setSpeedForEvent(doc, compiled, id, metresPerSecond) {
  const ev = doc.events[id];
  if (!ev || !isMotion(ev.type) || !ev.to) return;
  const seg = compiled.tracks[ev.actor]?.segs.find((s) => s.id === id);
  const p0 = seg?.p0 ?? { x: doc.objects[ev.actor].x, y: doc.objects[ev.actor].y };
  ev.duration = Math.max(0.2, round(cubicLength(p0, ev.c1, ev.c2, ev.to) / metresPerSecond));
}

export function makeBallEvent(type, actor, t, target, distance) {
  return {
    type, actor, t: round(t), duration: defaultDuration(type, distance),
    receiver: target.receiver ?? null, to: target.point ?? null,
  };
}

const round = (v) => Math.round(v * 1000) / 1000;

/* ---------- Annotations ---------- */

export const ANNOTATION_DEFAULTS = {
  color: null, width: 2, opacity: 1, dash: 'solid', head: 'end', fill: 0.16,
};

export function addAnnotation(doc, fields) {
  const id = fields.id ?? uid('a');
  doc.annotations[id] = { id, kind: 'arrow', locked: false, hidden: false, startAttach: null, endAttach: null, ...ANNOTATION_DEFAULTS, ...fields };
  doc.annotationOrder.push(id);
  return id;
}

export function updateAnnotation(doc, id, patch) {
  if (doc.annotations[id]) Object.assign(doc.annotations[id], patch);
}

export function deleteAnnotations(doc, ids) {
  const gone = new Set(ids);
  for (const id of ids) delete doc.annotations[id];
  doc.annotationOrder = doc.annotationOrder.filter((id) => !gone.has(id));
}

export function duplicateAnnotations(doc, ids, dx = 3, dy = 3) {
  const out = [];
  for (const id of ids) {
    const src = doc.annotations[id];
    if (!src) continue;
    const copy = JSON.parse(JSON.stringify(src));
    delete copy.id;
    translateAnnotation(copy, dx, dy);
    copy.startAttach = null;
    copy.endAttach = null;
    out.push(addAnnotation(doc, copy));
  }
  return out;
}

export function translateAnnotation(a, dx, dy) {
  const mv = (p) => { if (p) { p.x += dx; p.y += dy; } };
  mv(a.p0); mv(a.p3); mv(a.c1); mv(a.c2);
  if (a.points) a.points.forEach(mv);
  if (a.x != null) { a.x += dx; a.y += dy; }
}

export function duplicateDocument(doc, fields = {}) {
  const copy = JSON.parse(JSON.stringify(doc));
  const now = Date.now();
  copy.id = uid('doc');
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.title = fields.title ?? `${doc.title} copy`;
  delete copy.example;
  delete copy.deletedAt;
  return copy;
}
