import { EVENT_TYPES, isMotion, isBallFlight } from '../tactics/events.js';
import { buildArcTable, cubicAt, cubicTangent, resolveControls, uAtFraction } from './bezier.js';
import { ease } from './easing.js';

/**
 * compile(doc) turns a document into segments. sample(compiled, t) reads a pose
 * from them. Both are pure, and sample has no memory of earlier calls, so play,
 * pause, scrub, any playback speed, exports and the 3D replay all see the same
 * state at the same time.
 */

const compiledCache = new WeakMap();
const tableCache = new WeakMap();

function segmentTable(ev, p0, c1, c2) {
  const hit = tableCache.get(ev);
  if (hit && hit.x === p0.x && hit.y === p0.y) return hit.table;
  const table = buildArcTable(p0, c1, c2, ev.to);
  tableCache.set(ev, { x: p0.x, y: p0.y, table });
  return table;
}

/** A keyframe stores its arrival in t. Every other event stores its start in t. */
export function sortedEvents(doc) {
  return Object.values(doc.events).sort((a, b) => a.t - b.t || (a.order ?? 0) - (b.order ?? 0) || (a.id < b.id ? -1 : 1));
}

export function eventArrival(ev) {
  return ev.type === 'key' ? ev.t : ev.t + ev.duration;
}

function compileTrack(obj, events, issues) {
  const motions = events
    .filter((e) => e.actor === obj.id && isMotion(e.type) && e.to)
    .sort((a, b) => eventArrival(a) - eventArrival(b));
  const segs = [];
  let px = obj.x;
  let py = obj.y;
  let prevEnd = 0;
  for (const ev of motions) {
    const arrival = eventArrival(ev);
    let t0 = ev.type === 'key' ? prevEnd : ev.t;
    if (t0 < prevEnd - 1e-6) {
      issues.push({ eventId: ev.id, level: 'warn', message: 'Starts before this player finishes the previous movement, so it runs shorter.' });
      t0 = prevEnd;
    }
    const t1 = Math.max(arrival, t0);
    const p0 = { x: px, y: py };
    const { c1, c2 } = resolveControls(p0, ev.c1, ev.c2, ev.to);
    segs.push({ id: ev.id, type: ev.type, t0, t1, p0, c1, c2, p3: ev.to, table: segmentTable(ev, p0, c1, c2), ease: ev.ease ?? (ev.type === 'key' ? 'linear' : 'smooth') });
    px = ev.to.x;
    py = ev.to.y;
    prevEnd = t1;
  }
  return { id: obj.id, x: obj.x, y: obj.y, segs };
}

function trackAt(track, t) {
  const { segs } = track;
  if (segs.length === 0 || t <= segs[0].t0) return { x: track.x, y: track.y, seg: null };
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].t0 <= t) lo = mid;
    else hi = mid - 1;
  }
  const s = segs[lo];
  if (t >= s.t1) return { x: s.p3.x, y: s.p3.y, seg: null };
  const f = ease(s.ease, (t - s.t0) / Math.max(1e-6, s.t1 - s.t0));
  const u = uAtFraction(s.table, f);
  const q = cubicAt(s.p0, s.c1, s.c2, s.p3, u);
  return { x: q.x, y: q.y, seg: s, u };
}

export function positionAt(compiled, id, t) {
  const tr = compiled.tracks[id];
  if (!tr) return null;
  const q = trackAt(tr, t);
  return { x: q.x, y: q.y };
}

/** Position plus whether the object is moving, and its heading if so. */
export function motionAt(compiled, id, t) {
  const tr = compiled.tracks[id];
  if (!tr) return null;
  const q = trackAt(tr, t);
  if (!q.seg) return { x: q.x, y: q.y, moving: false, heading: 0 };
  const d = cubicTangent(q.seg.p0, q.seg.c1, q.seg.c2, q.seg.p3, q.u ?? 0);
  return { x: q.x, y: q.y, moving: true, heading: (Math.atan2(d.y, d.x) * 180) / Math.PI };
}

/**
 * Where the ball sits relative to its owner. It blends from a resting spot to
 * ahead of the player with speed, measured over a window so it never snaps.
 */
export function footPosition(compiled, id, t, dribbling = false) {
  const here = positionAt(compiled, id, t);
  if (!here) return null;
  const w = 0.22;
  const a = positionAt(compiled, id, Math.max(0, t - w));
  const b = positionAt(compiled, id, t + w);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const speed = Math.hypot(dx, dy) / (2 * w);
  const k = Math.min(1, speed / 3);
  const rest = { x: 0.95, y: 0.7 };
  let ox = rest.x * (1 - k);
  let oy = rest.y * (1 - k);
  if (speed > 1e-3) {
    const reach = 1.25 * (dribbling ? 1 + 0.32 * Math.sin(t * Math.PI * 2 * 1.5) : 1);
    ox += (dx / (2 * w * speed)) * reach * k;
    oy += (dy / (2 * w * speed)) * reach * k;
  }
  return { x: here.x + ox, y: here.y + oy };
}

const PICKUP_RANGE = 5;
const COLLECT_RANGE = 3.2;

function compileBall(doc, compiled, ordered) {
  const { issues } = compiled;
  const start = doc.ball ?? {};
  const has = (id) => id && doc.objects[id];
  let state = has(start.owner)
    ? { kind: 'held', owner: start.owner, t0: 0 }
    : { kind: start.dead ? 'dead' : 'free', x: start.x ?? doc.pitch.length / 2, y: start.y ?? doc.pitch.width / 2, t0: 0 };
  const segs = [];
  const name = (id) => {
    const o = doc.objects[id];
    return o?.number != null && o.number !== '' ? `#${o.number}` : o?.name || 'This player';
  };

  const ballPos = (s, t) => {
    if (s.kind === 'held') return footPosition(compiled, s.owner, t);
    if (s.kind === 'flight') return flightPos(s, t);
    return { x: s.x, y: s.y };
  };
  const push = (s, t1) => { if (t1 > s.t0 - 1e-9) segs.push({ ...s, t1 }); };

  const settle = (t) => {
    while (state.kind === 'flight' && t >= state.t1) {
      const f = state;
      push(f, f.t1);
      state = { ...f.next(), t0: f.t1 };
    }
  };

  const actions = [];
  for (const ev of ordered) {
    const meta = EVENT_TYPES[ev.type];
    if (!meta) continue;
    if (isBallFlight(ev.type)) actions.push({ ev, at: ev.t });
    else if (ev.type === 'interception') actions.push({ ev, at: ev.t });
    else if (ev.type === 'tackle') actions.push({ ev, at: Math.max(ev.t, ev.t + ev.duration - 0.2) });
    else if (meta.needsBall) actions.push({ ev, at: ev.t });
  }
  actions.sort((a, b) => a.at - b.at);

  for (const { ev, at } of actions) {
    settle(at);
    const actorOk = has(ev.actor);
    if (!actorOk) {
      issues.push({ eventId: ev.id, level: 'error', message: 'This event has no player.' });
      continue;
    }
    const actorPos = positionAt(compiled, ev.actor, at);

    if (ev.type === 'dribble') {
      const owns = state.kind === 'held' && state.owner === ev.actor;
      if (!owns) issues.push({ eventId: ev.id, level: 'error', message: `${name(ev.actor)} does not have the ball when this dribble starts.` });
      continue;
    }

    if (ev.type === 'interception' || ev.type === 'tackle') {
      if (state.kind === 'held' && state.owner === ev.actor) {
        issues.push({ eventId: ev.id, level: 'error', message: `${name(ev.actor)} already has the ball.` });
        continue;
      }
      if (ev.type === 'tackle' && state.kind !== 'held') {
        issues.push({ eventId: ev.id, level: 'error', message: 'Nobody has the ball to tackle at this moment.' });
        continue;
      }
      const from = ballPos(state, at);
      push(state, at);
      const t1 = at + (ev.type === 'tackle' ? 0.2 : Math.max(0.12, ev.duration ?? 0.3));
      const to = footPosition(compiled, ev.actor, t1);
      const actor = ev.actor;
      state = { kind: 'flight', t0: at, t1, from, to, c: null, loft: 0, ease: 'linear', eventId: ev.id, receiver: actor, next: () => ({ kind: 'held', owner: actor }) };
      continue;
    }

    // Passes, crosses, shots and other deliveries need the ball at the actor's feet.
    if (state.kind === 'flight') {
      issues.push({ eventId: ev.id, level: 'error', message: `The ball is still travelling when ${name(ev.actor)} tries to play it.` });
      continue;
    }
    const owns = state.kind === 'held' && state.owner === ev.actor;
    const near = state.kind !== 'held' && Math.hypot(actorPos.x - state.x, actorPos.y - state.y) <= PICKUP_RANGE;
    if (!owns && !near) {
      issues.push({ eventId: ev.id, level: 'error', message: `${name(ev.actor)} does not have the ball at this moment.` });
      continue;
    }
    const from = ballPos(state, ev.t);
    push(state, ev.t);
    const t1 = ev.t + Math.max(0.05, ev.duration);
    const receiver = has(ev.receiver) ? ev.receiver : null;
    const to = receiver ? footPosition(compiled, receiver, t1) : ev.to;
    const meta = EVENT_TYPES[ev.type];
    const next = () => {
      if (receiver) return { kind: 'held', owner: receiver };
      if (meta.dead) return { kind: 'dead', x: to.x, y: to.y };
      // A ball played into space belongs to whoever is on it when it lands.
      let best = null;
      let bestD = COLLECT_RANGE;
      for (const o of Object.values(doc.objects)) {
        if (o.type !== 'player' || o.id === ev.actor) continue;
        const p = positionAt(compiled, o.id, t1);
        const d = Math.hypot(p.x - to.x, p.y - to.y);
        if (d < bestD) { bestD = d; best = o.id; }
      }
      return best ? { kind: 'held', owner: best } : { kind: 'free', x: to.x, y: to.y };
    };
    state = {
      kind: 'flight', t0: ev.t, t1, from, to, c: ev.c ?? null,
      loft: ev.loft ?? meta.loft ?? 0, ease: ev.ease ?? (meta.loft ? 'linear' : 'decel'),
      eventId: ev.id, receiver, next,
    };
  }
  settle(Infinity);
  push(state, Infinity);
  return segs.map(({ next: _n, ...rest }) => rest);
}

function flightPos(s, t) {
  const f = ease(s.ease, (t - s.t0) / Math.max(1e-6, s.t1 - s.t0));
  const u = Math.min(1, Math.max(0, f));
  if (s.c) {
    const v = 1 - u;
    return {
      x: v * v * s.from.x + 2 * v * u * s.c.x + u * u * s.to.x,
      y: v * v * s.from.y + 2 * v * u * s.c.y + u * u * s.to.y,
    };
  }
  return { x: s.from.x + (s.to.x - s.from.x) * u, y: s.from.y + (s.to.y - s.from.y) * u };
}

export function ballSegmentAt(compiled, t) {
  const segs = compiled.ball;
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].t0 <= t) lo = mid;
    else hi = mid - 1;
  }
  return segs[lo];
}

export function ballAt(compiled, t) {
  const s = ballSegmentAt(compiled, t);
  if (!s) return { x: 0, y: 0, h: 0, kind: 'free', owner: null };
  if (s.kind === 'held') {
    const dribbling = (compiled.dribbles[s.owner] ?? []).some((d) => t >= d.t0 && t < d.t1);
    const p = footPosition(compiled, s.owner, t, dribbling);
    return { x: p.x, y: p.y, h: 0, kind: 'held', owner: s.owner };
  }
  if (s.kind === 'flight') {
    const p = flightPos(s, t);
    const u = (t - s.t0) / Math.max(1e-6, s.t1 - s.t0);
    return { x: p.x, y: p.y, h: 4 * s.loft * u * (1 - u), kind: 'flight', owner: null, eventId: s.eventId };
  }
  return { x: s.x, y: s.y, h: 0, kind: s.kind, owner: null };
}

/** The ball holder at a time, or null. Exactly one state applies at any instant. */
export function ownerAt(compiled, t) {
  const s = ballSegmentAt(compiled, t);
  return s?.kind === 'held' ? s.owner : null;
}

export function compile(doc) {
  const cached = compiledCache.get(doc);
  if (cached) return cached;
  const ordered = sortedEvents(doc);
  const compiled = { tracks: {}, ball: [], issues: [], events: ordered, duration: 0, dribbles: {} };
  for (const id of Object.keys(doc.objects)) {
    compiled.tracks[id] = compileTrack(doc.objects[id], ordered, compiled.issues);
    const dr = compiled.tracks[id].segs.filter((s) => s.type === 'dribble');
    if (dr.length) compiled.dribbles[id] = dr;
  }
  compiled.ball = compileBall(doc, compiled, ordered);
  let end = 0;
  for (const ev of ordered) end = Math.max(end, eventArrival(ev));
  for (const s of compiled.ball) if (s.kind === 'flight') end = Math.max(end, s.t1);
  compiled.contentEnd = end;
  compiled.duration = end > 0 ? +(end + 0.8).toFixed(3) : 0;
  compiled.invalid = new Set(compiled.issues.filter((i) => i.level === 'error').map((i) => i.eventId));
  compiledCache.set(doc, compiled);
  return compiled;
}

/** Full pose at time t: every object and the ball. Allocates, so per-frame code uses `poseInto`. */
export function sample(compiled, t) {
  const objects = {};
  for (const id of Object.keys(compiled.tracks)) objects[id] = positionAt(compiled, id, t);
  return { t, objects, ball: ballAt(compiled, t) };
}

/** Start point of a motion event, derived from where the actor actually is. */
export function eventStartPoint(compiled, ev) {
  if (isMotion(ev.type)) {
    const seg = compiled.tracks[ev.actor]?.segs.find((s) => s.id === ev.id);
    return seg ? seg.p0 : positionAt(compiled, ev.actor, ev.t);
  }
  const flight = compiled.ball.find((s) => s.eventId === ev.id && s.kind === 'flight');
  if (flight) return flight.from;
  return positionAt(compiled, ev.actor, ev.t);
}

/** End point of an event; follows the receiver for a pass. */
export function eventEndPoint(compiled, ev) {
  if (!isMotion(ev.type)) {
    const flight = compiled.ball.find((s) => s.eventId === ev.id && s.kind === 'flight');
    if (flight) return flight.to;
    if (ev.receiver && compiled.tracks[ev.receiver]) return positionAt(compiled, ev.receiver, ev.t + ev.duration);
  }
  return ev.to ?? positionAt(compiled, ev.actor, eventArrival(ev));
}
