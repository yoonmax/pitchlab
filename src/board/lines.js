import { cubicAt, cubicTangent, resolveControls } from '../core/animation/bezier.js';

/**
 * Line styling shared by event paths and annotations. All sizes are metres, so
 * diagrams keep their proportions at any zoom and at any export size.
 */
export const LINE_STYLES = {
  pass: { dash: null, width: 0.26, head: 'solid', ball: true },
  shot: { dash: null, width: 0.42, head: 'solid', ball: true },
  run: { dash: '1.1 0.7', width: 0.24, head: 'solid' },
  dribble: { wavy: true, width: 0.24, head: 'solid' },
  press: { dash: null, width: 0.3, head: 'double' },
  defend: { dash: '0.3 0.55', width: 0.26, head: 'bar', round: true },
  key: { dash: '0.2 0.5', width: 0.14, head: 'none', round: true },
  arrow: { dash: null, width: 0.24, head: 'solid' },
};

const f = (v) => +v.toFixed(2);

/** A wavy line following a cubic, which reads as a dribble. */
export function wavyPath(p0, c1, c2, p3, k = 1) {
  const r = resolveControls(p0, c1, c2, p3);
  const approx = Math.hypot(p3.x - p0.x, p3.y - p0.y) + 1;
  const steps = Math.max(12, Math.floor(approx * 3));
  const waves = Math.max(2, Math.round(approx / (2.4 * k)));
  let d = `M${f(p0.x)} ${f(p0.y)}`;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const q = cubicAt(p0, r.c1, r.c2, p3, u);
    const t = cubicTangent(p0, r.c1, r.c2, p3, u);
    const l = Math.hypot(t.x, t.y) || 1;
    const envelope = Math.min(1, Math.min(u, 1 - u) * 8);
    const off = Math.sin(u * waves * Math.PI * 2) * 0.42 * k * envelope;
    d += `L${f(q.x + (-t.y / l) * off)} ${f(q.y + (t.x / l) * off)}`;
  }
  return d;
}

/** Scale a dash pattern with the line. */
export function scaleDash(dash, k) {
  return dash ? dash.split(' ').map((v) => +(Number(v) * k).toFixed(3)).join(' ') : undefined;
}

/**
 * How much to thin tactical lines. They are drawn in metres, which is right at
 * normal zoom, but they would turn heavy when zoomed in or on a tight drill frame.
 */
export function lineScaleForZoom(zoom) {
  return Math.round(Math.min(1, Math.max(0.3, 8.5 / zoom)) * 50) / 50;
}

/** Where a line ends and the direction it arrives from. */
export function endDirection(p0, c1, c2, p3) {
  const from = c2 ?? c1 ?? p0;
  const dx = p3.x - from.x;
  const dy = p3.y - from.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

export function startDirection(p0, c1, c2, p3) {
  const to = c1 ?? c2 ?? p3;
  const dx = to.x - p0.x;
  const dy = to.y - p0.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/** Arrowhead as a filled path. `kind` is solid, double, bar or none. */
export function headPath(tip, dir, kind, scale = 1) {
  const len = 1.25 * scale;
  const half = 0.62 * scale;
  const px = -dir.y;
  const py = dir.x;
  const tri = (b) => {
    const bx = b.x - dir.x * len;
    const by = b.y - dir.y * len;
    return `M${f(b.x)} ${f(b.y)}L${f(bx + px * half)} ${f(by + py * half)}L${f(bx - px * half)} ${f(by - py * half)}z`;
  };
  if (kind === 'solid') return tri(tip);
  if (kind === 'double') return tri(tip) + tri({ x: tip.x - dir.x * len * 0.85, y: tip.y - dir.y * len * 0.85 });
  if (kind === 'bar') {
    const w = 0.9 * scale;
    const t = 0.16 * scale;
    return `M${f(tip.x + px * w)} ${f(tip.y + py * w)}L${f(tip.x - px * w)} ${f(tip.y - py * w)}L${f(tip.x - px * w - dir.x * t)} ${f(tip.y - py * w - dir.y * t)}L${f(tip.x + px * w - dir.x * t)} ${f(tip.y + py * w - dir.y * t)}z`;
  }
  return '';
}

/** Pull the end of a line back so the arrowhead does not sit underneath a player. */
export function insetEnd(p0, c1, c2, p3, inset) {
  if (inset <= 0) return p3;
  const dir = endDirection(p0, c1, c2, p3);
  const span = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const amount = Math.min(inset, span * 0.4);
  return { x: p3.x - dir.x * amount, y: p3.y - dir.y * amount };
}
