import { ballAt, compile, ownerAt, positionAt } from '../animation/timeline.js';
import { BALL_TYPES } from './events.js';

/* ---------- Computational geometry ---------- */

/** Monotone chain convex hull. Returns points in order, without repeating the first. */
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

/* ---------- Team shape ---------- */

export function teamPositions(doc, team, t, { outfieldOnly = false } = {}) {
  const compiled = compile(doc);
  const out = [];
  for (const o of Object.values(doc.objects)) {
    if (o.type !== 'player' || o.team !== team || o.sub || o.hidden) continue;
    if (outfieldOnly && o.gk) continue;
    const p = positionAt(compiled, o.id, t);
    out.push({ id: o.id, number: o.number, gk: o.gk, ...p });
  }
  return out;
}

export function teamShape(doc, team, t) {
  const outfield = teamPositions(doc, team, t, { outfieldOnly: true });
  if (outfield.length === 0) return null;
  const xs = outfield.map((p) => p.x);
  const ys = outfield.map((p) => p.y);
  const hull = convexHull(outfield);
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    count: outfield.length,
    width: Math.max(...ys) - Math.min(...ys),
    depth: Math.max(...xs) - Math.min(...xs),
    area: polygonArea(hull),
    hull,
    centroid: { x: mean(xs), y: mean(ys) },
    lines: lineGroups(outfield),
    meanNearest: meanNearestDistance(outfield),
  };
}

/** Group players into lines by splitting at the two largest gaps along the pitch. */
export function lineGroups(players) {
  if (players.length < 3) return [];
  const sorted = [...players].sort((a, b) => a.x - b.x);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push({ i, gap: sorted[i].x - sorted[i - 1].x });
  const cuts = gaps.sort((a, b) => b.gap - a.gap).slice(0, 2).map((g) => g.i).sort((a, b) => a - b);
  const groups = [sorted.slice(0, cuts[0]), sorted.slice(cuts[0], cuts[1]), sorted.slice(cuts[1])];
  return groups.map((g) => ({
    x: g.reduce((sum, p) => sum + p.x, 0) / g.length,
    minY: Math.min(...g.map((p) => p.y)),
    maxY: Math.max(...g.map((p) => p.y)),
    count: g.length,
  }));
}

export function meanNearestDistance(points) {
  if (points.length < 2) return 0;
  let total = 0;
  for (const p of points) {
    let best = Infinity;
    for (const q of points) {
      if (p === q) continue;
      best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
    }
    total += best;
  }
  return total / points.length;
}

/* ---------- Passing network ---------- */

/** Completed passes from the timeline. Counts only passes that actually reach a player. */
export function passesFromTimeline(doc, t0 = 0, t1 = Infinity) {
  const compiled = compile(doc);
  const out = [];
  for (let i = 0; i < compiled.ball.length; i++) {
    const seg = compiled.ball[i];
    if (seg.kind !== 'flight' || seg.t0 < t0 || seg.t0 > t1) continue;
    const ev = doc.events[seg.eventId];
    if (!ev || !BALL_TYPES.includes(ev.type)) continue;
    const after = compiled.ball[i + 1];
    if (after?.kind !== 'held') continue;
    out.push({ from: ev.actor, to: after.owner, t: seg.t0, type: ev.type });
  }
  return out;
}

export function passingNetwork(doc, team, t0 = 0, t1 = Infinity) {
  const compiled = compile(doc);
  const end = Math.min(t1, Math.max(compiled.duration, 0.001));
  const passes = passesFromTimeline(doc, t0, t1).filter((p) => doc.objects[p.from]?.team === team && doc.objects[p.to]?.team === team);
  const edges = new Map();
  for (const p of passes) {
    const key = `${p.from}>${p.to}`;
    const e = edges.get(key) ?? { from: p.from, to: p.to, count: 0 };
    e.count += 1;
    edges.set(key, e);
  }
  const nodes = {};
  for (const o of Object.values(doc.objects)) {
    if (o.type !== 'player' || o.team !== team || o.sub) continue;
    let sx = 0, sy = 0, n = 0;
    const steps = Math.max(1, Math.ceil((end - t0) / 0.2));
    for (let i = 0; i <= steps; i++) {
      const p = positionAt(compiled, o.id, t0 + ((end - t0) * i) / steps);
      sx += p.x; sy += p.y; n += 1;
    }
    nodes[o.id] = { id: o.id, number: o.number, x: sx / n, y: sy / n, sent: 0, received: 0 };
  }
  for (const p of passes) {
    if (nodes[p.from]) nodes[p.from].sent += 1;
    if (nodes[p.to]) nodes[p.to].received += 1;
  }
  return { nodes, edges: [...edges.values()], total: passes.length };
}

/** Network from imported events, using each player's mean recorded position. */
export function passingNetworkFromData(dataset, team) {
  const events = dataset.events.filter((e) => e.team === team && e.type === 'pass');
  const sums = new Map();
  const add = (player, x, y) => {
    if (!player) return;
    const s = sums.get(player) ?? { id: player, number: player, sx: 0, sy: 0, n: 0, sent: 0, received: 0 };
    s.sx += x; s.sy += y; s.n += 1;
    sums.set(player, s);
  };
  const edges = new Map();
  for (const e of events) {
    add(e.player, e.x, e.y);
    if (e.receiver && e.endX != null) add(e.receiver, e.endX, e.endY);
    if (e.receiver) {
      const key = `${e.player}>${e.receiver}`;
      const edge = edges.get(key) ?? { from: e.player, to: e.receiver, count: 0 };
      edge.count += 1;
      edges.set(key, edge);
    }
  }
  const nodes = {};
  for (const s of sums.values()) nodes[s.id] = { id: s.id, number: s.number, x: s.sx / s.n, y: s.sy / s.n };
  for (const e of edges.values()) {
    if (nodes[e.from]) nodes[e.from].sent = (nodes[e.from].sent ?? 0) + e.count;
    if (nodes[e.to]) nodes[e.to].received = (nodes[e.to].received ?? 0) + e.count;
  }
  return { nodes, edges: [...edges.values()], total: events.length };
}

/* ---------- Heatmap and zone control ---------- */

function emptyGrid(pitch, cell) {
  const nx = Math.ceil(pitch.length / cell);
  const ny = Math.ceil(pitch.width / cell);
  return { nx, ny, cell, values: new Float32Array(nx * ny), max: 0 };
}

function splat(grid, x, y, sigma = 4, weight = 1) {
  const r = Math.ceil((sigma * 2) / grid.cell);
  const cx = Math.floor(x / grid.cell);
  const cy = Math.floor(y / grid.cell);
  for (let j = cy - r; j <= cy + r; j++) {
    if (j < 0 || j >= grid.ny) continue;
    for (let i = cx - r; i <= cx + r; i++) {
      if (i < 0 || i >= grid.nx) continue;
      const dx = (i + 0.5) * grid.cell - x;
      const dy = (j + 0.5) * grid.cell - y;
      grid.values[j * grid.nx + i] += weight * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
  }
}

function finish(grid) {
  let max = 0;
  for (const v of grid.values) if (v > max) max = v;
  grid.max = max;
  return grid;
}

/** Heatmap of where selected players actually were over a span of the timeline. */
export function heatmapFromTimeline(doc, ids, t0 = 0, t1 = Infinity, cell = 2.5) {
  const compiled = compile(doc);
  const grid = emptyGrid(doc.pitch, cell);
  const end = Math.min(t1, compiled.duration);
  if (end <= t0) {
    for (const id of ids) {
      const p = positionAt(compiled, id, t0);
      if (p) splat(grid, p.x, p.y);
    }
    return finish(grid);
  }
  const steps = Math.ceil((end - t0) / 0.1);
  for (const id of ids) {
    for (let i = 0; i <= steps; i++) {
      const p = positionAt(compiled, id, t0 + ((end - t0) * i) / steps);
      if (p) splat(grid, p.x, p.y);
    }
  }
  return finish(grid);
}

/** Heatmap of where imported events took place. */
export function heatmapFromData(pitch, events, cell = 2.5) {
  const grid = emptyGrid(pitch, cell);
  for (const e of events) if (Number.isFinite(e.x) && Number.isFinite(e.y)) splat(grid, e.x, e.y);
  return finish(grid);
}

/** Heatmap of the ball's path over a span. */
export function ballHeatmap(doc, t0 = 0, t1 = Infinity, cell = 2.5) {
  const compiled = compile(doc);
  const grid = emptyGrid(doc.pitch, cell);
  const end = Math.min(t1, compiled.duration);
  const steps = Math.max(1, Math.ceil((end - t0) / 0.1));
  for (let i = 0; i <= steps; i++) {
    const p = ballAt(compiled, t0 + ((end - t0) * i) / steps);
    splat(grid, p.x, p.y);
  }
  return finish(grid);
}

/**
 * Who could reach each part of the pitch first, assuming every player moves at
 * the same speed. This is a nearest-player (Voronoi) approximation: useful for
 * reading space, but it ignores momentum, facing and the ball.
 */
export function zoneControl(doc, t, cell = 3) {
  const home = teamPositions(doc, 'home', t);
  const away = teamPositions(doc, 'away', t);
  const nx = Math.ceil(doc.pitch.length / cell);
  const ny = Math.ceil(doc.pitch.width / cell);
  const cells = new Int8Array(nx * ny);
  let homeCount = 0;
  let awayCount = 0;
  if (home.length === 0 && away.length === 0) return { nx, ny, cell, cells, homeShare: 0, awayShare: 0 };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * cell;
      const y = (j + 0.5) * cell;
      const nearest = (list) => list.reduce((best, p) => Math.min(best, (p.x - x) ** 2 + (p.y - y) ** 2), Infinity);
      const h = nearest(home);
      const a = nearest(away);
      const v = h < a ? 1 : a < h ? -1 : 0;
      cells[j * nx + i] = v;
      if (v > 0) homeCount += 1;
      else if (v < 0) awayCount += 1;
    }
  }
  const total = nx * ny;
  return { nx, ny, cell, cells, homeShare: homeCount / total, awayShare: awayCount / total };
}

/* ---------- Passing lanes ---------- */

/** For the ball carrier, which team-mates can be reached without passing close to an opponent. */
export function passingLanes(doc, t, laneWidth = 1.6) {
  const compiled = compile(doc);
  const owner = ownerAt(compiled, t);
  if (!owner) return null;
  const carrier = doc.objects[owner];
  const from = positionAt(compiled, owner, t);
  const opponents = teamPositions(doc, carrier.team === 'home' ? 'away' : 'home', t);
  const mates = teamPositions(doc, carrier.team, t).filter((p) => p.id !== owner);
  const lanes = mates.map((m) => {
    const blockers = opponents.filter((o) => distanceToSegment(o, from, m) < laneWidth);
    return {
      to: m.id, from, end: { x: m.x, y: m.y },
      open: blockers.length === 0, blockedBy: blockers.map((b) => b.id),
      distance: Math.hypot(m.x - from.x, m.y - from.y),
      angle: (Math.atan2(m.y - from.y, m.x - from.x) * 180) / Math.PI,
    };
  });
  return { owner, from, lanes };
}

export function distanceBetween(doc, a, b, t) {
  const compiled = compile(doc);
  const p = positionAt(compiled, a, t);
  const q = positionAt(compiled, b, t);
  if (!p || !q) return null;
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/* ---------- Offside ---------- */

/**
 * Offside position only, following Law 11: nearer the opponents' goal line than
 * both the ball and the second-last opponent, and in the opposing half. Being in
 * an offside position is not an offence on its own.
 */
export function offsideAnalysis(doc, attackingTeam, t, ballOverride = null) {
  const compiled = compile(doc);
  const attack = doc.teams[attackingTeam].attack;
  const defending = attackingTeam === 'home' ? 'away' : 'home';
  const dir = attack === 'right' ? 1 : -1;
  const depth = (x) => (attack === 'right' ? x : doc.pitch.length - x);
  const defenders = teamPositions(doc, defending, t).sort((a, b) => depth(b.x) - depth(a.x));
  const ball = ballOverride ?? ballAt(compiled, t);
  const halfway = doc.pitch.length / 2;
  const second = defenders[1] ?? null;
  const secondDepth = second ? depth(second.x) : -Infinity;
  const ballDepth = depth(ball.x);
  const lineDepth = Math.max(secondDepth, ballDepth, depth(halfway));
  const lineX = attack === 'right' ? lineDepth : doc.pitch.length - lineDepth;
  const players = teamPositions(doc, attackingTeam, t).map((p) => {
    const d = depth(p.x);
    const inOpposingHalf = d > depth(halfway);
    const offside = inOpposingHalf && d > ballDepth + 1e-6 && d > secondDepth + 1e-6;
    return { ...p, offside };
  });
  return {
    attackingTeam, attack, dir, lineX,
    secondLast: second, ball: { x: ball.x, y: ball.y },
    limitedBy: lineDepth === secondDepth ? 'second-last' : lineDepth === ballDepth ? 'ball' : 'halfway',
    enoughDefenders: defenders.length >= 2,
    players,
    flagged: players.filter((p) => p.offside),
  };
}
