/**
 * Pitch geometry. World units are metres. The origin is the top-left corner of
 * the pitch with x along the touchline (0 to length) and y across it (0 to width).
 * Home attacks towards x = length unless a document says otherwise.
 */

const YD = 0.9144;

export const PITCH_PRESETS = {
  '11v11': {
    label: '11v11', players: 11, length: 105, width: 68,
    goalWidth: 7.32, goalDepth: 2,
    penaltyDepth: 16.5, penaltyWidth: 40.32,
    goalAreaDepth: 5.5, goalAreaWidth: 18.32,
    penaltyMark: 11, centerRadius: 9.15, arcRadius: 9.15, cornerRadius: 1,
    source: 'Law 1 markings from the IFAB Laws of the Game. 105 by 68 m is the common match size.',
    markingsVerified: true,
  },
  '9v9': {
    label: '9v9', players: 9, length: 73, width: 46,
    goalWidth: 4.88, goalDepth: 1.4,
    penaltyDepth: 13 * YD, penaltyWidth: 32 * YD,
    goalAreaDepth: 4 * YD, goalAreaWidth: 14 * YD,
    penaltyMark: 9 * YD, centerRadius: 7 * YD, arcRadius: 7 * YD, cornerRadius: 0.8,
    source: 'Pitch and goal size from FA Handbook section 38 (U11/U12). Interior markings are editable defaults; check your league.',
    markingsVerified: false,
  },
  '7v7': {
    label: '7v7', players: 7, length: 55, width: 37,
    goalWidth: 3.66, goalDepth: 1.2,
    penaltyDepth: 10 * YD, penaltyWidth: 18 * YD,
    goalAreaDepth: 0, goalAreaWidth: 0,
    penaltyMark: 8 * YD, centerRadius: 6 * YD, arcRadius: 0, cornerRadius: 0.6,
    source: 'Pitch and goal size from FA Handbook section 38 (U9/U10). Interior markings are editable defaults; check your league.',
    markingsVerified: false,
  },
  '5v5': {
    label: '5v5', players: 5, length: 37, width: 27,
    goalWidth: 3.66, goalDepth: 1.2,
    penaltyDepth: 9 * YD, penaltyWidth: 16 * YD,
    goalAreaDepth: 0, goalAreaWidth: 0,
    penaltyMark: 7 * YD, centerRadius: 4 * YD, arcRadius: 0, cornerRadius: 0.5,
    source: 'Pitch and goal size from FA Handbook section 38 (U7/U8). Interior markings are editable defaults; check your league.',
    markingsVerified: false,
  },
};

export const PITCH_VIEWS = [
  { id: 'full', label: 'Full pitch' },
  { id: 'half', label: 'Attacking half' },
  { id: 'attacking-third', label: 'Attacking third' },
  { id: 'defensive-third', label: 'Defensive third' },
  { id: 'blank', label: 'Blank canvas' },
];

export const DEFAULT_OVERLAYS = {
  grid: false, coords: false, thirds: false, zones: false, channels: false, halfSpaces: false, lanes: false,
};

export function createPitch(preset = '11v11', overrides = {}) {
  const p = PITCH_PRESETS[preset] ?? PITCH_PRESETS['11v11'];
  const { label: _l, players: _p, source: _s, markingsVerified: _m, ...dims } = p;
  return {
    preset, ...dims, view: 'full', theme: 'forest', stripes: true,
    overlays: { ...DEFAULT_OVERLAYS }, ...overrides,
  };
}

/** Change the outer dimensions while keeping every interior marking inside the field. */
export function resizePitch(pitch, length, width) {
  const L = clamp(length, 15, 130);
  const W = clamp(width, 10, 100);
  const penaltyWidth = Math.min(pitch.penaltyWidth, W - 2);
  const goalAreaWidth = Math.min(pitch.goalAreaWidth, penaltyWidth);
  const goalWidth = Math.min(pitch.goalWidth, Math.max(goalAreaWidth, W - 2));
  const penaltyDepth = Math.min(pitch.penaltyDepth, L / 2 - 1);
  const goalAreaDepth = Math.min(pitch.goalAreaDepth, penaltyDepth);
  const centerRadius = Math.min(pitch.centerRadius, W / 2 - 1, L / 2 - 1);
  return {
    ...pitch, preset: 'custom', length: L, width: W, penaltyWidth, goalAreaWidth, goalWidth,
    penaltyDepth, goalAreaDepth, centerRadius, penaltyMark: Math.min(pitch.penaltyMark, penaltyDepth),
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Where a penalty arc meets the edge of the penalty area, relative to the mark. */
export function penaltyArcAngle(pitch) {
  const dx = pitch.penaltyDepth - pitch.penaltyMark;
  if (!pitch.arcRadius || dx >= pitch.arcRadius || dx < 0) return null;
  return Math.acos(dx / pitch.arcRadius);
}

/**
 * The markings as primitives. Renderers (SVG, print, 3D texture) draw from this
 * one list so they cannot disagree.
 */
export function pitchPrimitives(pitch) {
  const { length: L, width: W } = pitch;
  const cy = W / 2;
  const out = [
    { kind: 'rect', id: 'boundary', x: 0, y: 0, w: L, h: W },
    { kind: 'line', id: 'halfway', x1: L / 2, y1: 0, x2: L / 2, y2: W },
    { kind: 'circle', id: 'center-circle', cx: L / 2, cy, r: pitch.centerRadius },
    { kind: 'spot', id: 'center-spot', cx: L / 2, cy },
  ];
  for (const side of [0, 1]) {
    const edge = side ? L : 0;
    const dir = side ? -1 : 1;
    const name = side ? 'right' : 'left';
    const box = (id, d, w) => ({
      kind: 'rect', id: `${id}-${name}`,
      x: side ? L - d : 0, y: cy - w / 2, w: d, h: w,
    });
    if (pitch.penaltyDepth > 0) out.push(box('penalty-area', pitch.penaltyDepth, pitch.penaltyWidth));
    if (pitch.goalAreaDepth > 0) out.push(box('goal-area', pitch.goalAreaDepth, pitch.goalAreaWidth));
    if (pitch.penaltyMark > 0) out.push({ kind: 'spot', id: `penalty-mark-${name}`, cx: edge + dir * pitch.penaltyMark, cy });
    const a = penaltyArcAngle(pitch);
    if (a !== null) {
      const mark = edge + dir * pitch.penaltyMark;
      const r = pitch.arcRadius;
      out.push({
        kind: 'arc', id: `penalty-arc-${name}`, r,
        x1: mark + dir * r * Math.cos(a), y1: cy - r * Math.sin(a),
        x2: mark + dir * r * Math.cos(a), y2: cy + r * Math.sin(a),
        sweep: side ? 0 : 1,
      });
    }
    out.push({
      kind: 'rect', id: `goal-${name}`, goal: true,
      x: side ? L : -pitch.goalDepth, y: cy - pitch.goalWidth / 2, w: pitch.goalDepth, h: pitch.goalWidth,
    });
  }
  const r = pitch.cornerRadius;
  if (r > 0) {
    out.push(
      { kind: 'arc', id: 'corner-tl', r, x1: r, y1: 0, x2: 0, y2: r, sweep: 1 },
      { kind: 'arc', id: 'corner-tr', r, x1: L, y1: r, x2: L - r, y2: 0, sweep: 1 },
      { kind: 'arc', id: 'corner-bl', r, x1: 0, y1: W - r, x2: r, y2: W, sweep: 1 },
      { kind: 'arc', id: 'corner-br', r, x1: L - r, y1: W, x2: L, y2: W - r, sweep: 1 },
    );
  }
  return out;
}

const f = (n) => +n.toFixed(3);

export function primitivesToPath(prims) {
  let d = '';
  for (const p of prims) {
    if (p.kind === 'rect') d += `M${f(p.x)} ${f(p.y)}h${f(p.w)}v${f(p.h)}h${f(-p.w)}z`;
    else if (p.kind === 'line') d += `M${f(p.x1)} ${f(p.y1)}L${f(p.x2)} ${f(p.y2)}`;
    else if (p.kind === 'circle') {
      d += `M${f(p.cx - p.r)} ${f(p.cy)}a${f(p.r)} ${f(p.r)} 0 1 0 ${f(p.r * 2)} 0a${f(p.r)} ${f(p.r)} 0 1 0 ${f(-p.r * 2)} 0`;
    } else if (p.kind === 'arc') {
      d += `M${f(p.x1)} ${f(p.y1)}A${f(p.r)} ${f(p.r)} 0 0 ${p.sweep} ${f(p.x2)} ${f(p.y2)}`;
    }
  }
  return d;
}

/** The part of the world a view frames, in metres. */
export function viewBounds(pitch) {
  const { length: L, width: W } = pitch;
  const m = 3;
  if (pitch.view === 'blank' && pitch.frame) return pitch.frame;
  switch (pitch.view) {
    case 'half': return { x: L / 2 - m, y: -m, w: L / 2 + m * 2 + pitch.goalDepth, h: W + m * 2 };
    case 'attacking-third': return { x: (L * 2) / 3 - m, y: -m, w: L / 3 + m * 2 + pitch.goalDepth, h: W + m * 2 };
    case 'defensive-third': return { x: -m - pitch.goalDepth, y: -m, w: L / 3 + m * 2 + pitch.goalDepth, h: W + m * 2 };
    default: return { x: -m - pitch.goalDepth, y: -m, w: L + 2 * (m + pitch.goalDepth), h: W + m * 2 };
  }
}

/** Five lanes: wings outside the penalty area, half-spaces to the goal area, one central lane. */
export function laneEdges(pitch) {
  const W = pitch.width;
  const pa = pitch.penaltyWidth > 0 ? pitch.penaltyWidth : W * 0.6;
  const ga = pitch.goalAreaWidth > 0 ? pitch.goalAreaWidth : pa * 0.45;
  const c = W / 2;
  return [c - pa / 2, c - ga / 2, c + ga / 2, c + pa / 2];
}

export function overlayGeometry(pitch) {
  const { length: L, width: W, overlays: o = {} } = pitch;
  const lines = [];
  const bands = [];
  const labels = [];
  if (o.thirds) { lines.push({ x1: L / 3, y1: 0, x2: L / 3, y2: W }, { x1: (2 * L) / 3, y1: 0, x2: (2 * L) / 3, y2: W }); }
  if (o.zones) {
    const zones = 6;
    for (let i = 1; i < zones; i++) lines.push({ x1: (L * i) / zones, y1: 0, x2: (L * i) / zones, y2: W });
  }
  const lanes = laneEdges(pitch);
  if (o.channels) {
    for (const f of [1, 2, 3, 4]) lines.push({ x1: 0, y1: (W * f) / 5, x2: L, y2: (W * f) / 5 });
  }
  if (o.lanes) for (const y of lanes) lines.push({ x1: 0, y1: y, x2: L, y2: y });
  if (o.halfSpaces) {
    bands.push({ x: 0, y: lanes[0], w: L, h: lanes[1] - lanes[0] }, { x: 0, y: lanes[2], w: L, h: lanes[3] - lanes[2] });
  }
  if (o.grid) {
    for (let x = 10; x < L; x += 10) lines.push({ x1: x, y1: 0, x2: x, y2: W, fine: true });
    for (let y = 10; y < W; y += 10) lines.push({ x1: 0, y1: y, x2: L, y2: y, fine: true });
  }
  if (o.coords) {
    for (let x = 0; x <= L; x += 10) labels.push({ x, y: -1.1, text: `${x}` });
    for (let y = 10; y <= W; y += 10) labels.push({ x: -1.6, y, text: `${y}` });
  }
  return { lines, bands, labels };
}

/** The smallest sensible frame around some points, for a blank canvas. */
export function frameAround(points, pad = 7, minSize = 24) {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(minSize, maxX - minX + pad * 2);
  const h = Math.max(minSize * 0.7, maxY - minY + pad * 2);
  return { x: +((minX + maxX) / 2 - w / 2).toFixed(2), y: +((minY + maxY) / 2 - h / 2).toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2) };
}

export function clampToPitch(pitch, x, y, margin = 6) {
  return {
    x: clamp(x, -margin, pitch.length + margin),
    y: clamp(y, -margin, pitch.width + margin),
  };
}

/** The point at the centre of the goal a team attacks. */
export function goalCenter(pitch, side = 'right') {
  return { x: side === 'right' ? pitch.length : 0, y: pitch.width / 2 };
}
