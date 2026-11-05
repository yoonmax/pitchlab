/** Cubic Bézier helpers. A path is { p0, c1, c2, p3 }; null controls mean a straight line. */

export function resolveControls(p0, c1, c2, p3) {
  return {
    c1: c1 ?? { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 },
    c2: c2 ?? { x: p0.x + ((p3.x - p0.x) * 2) / 3, y: p0.y + ((p3.y - p0.y) * 2) / 3 },
  };
}

export function cubicAt(p0, c1, c2, p3, u) {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y };
}

export function cubicTangent(p0, c1, c2, p3, u) {
  const v = 1 - u;
  const a = 3 * v * v;
  const b = 6 * v * u;
  const c = 3 * u * u;
  return {
    x: a * (c1.x - p0.x) + b * (c2.x - c1.x) + c * (p3.x - c2.x),
    y: a * (c1.y - p0.y) + b * (c2.y - c1.y) + c * (p3.y - c2.y),
  };
}

const LUT_STEPS = 40;

/** Arc-length table, so a player moves at even speed however the handles are placed. */
export function buildArcTable(p0, c1, c2, p3) {
  const ds = new Float64Array(LUT_STEPS + 1);
  let prev = p0;
  let len = 0;
  for (let i = 1; i <= LUT_STEPS; i++) {
    const q = cubicAt(p0, c1, c2, p3, i / LUT_STEPS);
    len += Math.hypot(q.x - prev.x, q.y - prev.y);
    ds[i] = len;
    prev = q;
  }
  return { ds, len };
}

/** Curve parameter at a fraction (0 to 1) of the total arc length. */
export function uAtFraction(table, f) {
  const { ds, len } = table;
  if (len === 0) return f;
  const target = f * len;
  let lo = 0;
  let hi = LUT_STEPS;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ds[mid] < target) lo = mid;
    else hi = mid;
  }
  const span = ds[hi] - ds[lo];
  const local = span > 0 ? (target - ds[lo]) / span : 0;
  return (lo + local) / LUT_STEPS;
}

export function cubicLength(p0, c1, c2, p3) {
  const { c1: a, c2: b } = resolveControls(p0, c1, c2, p3);
  return buildArcTable(p0, a, b, p3).len;
}

const n = (v) => +v.toFixed(2);

export function cubicPathD(p0, c1, c2, p3) {
  if (!c1 && !c2) return `M${n(p0.x)} ${n(p0.y)}L${n(p3.x)} ${n(p3.y)}`;
  const r = resolveControls(p0, c1, c2, p3);
  return `M${n(p0.x)} ${n(p0.y)}C${n(r.c1.x)} ${n(r.c1.y)} ${n(r.c2.x)} ${n(r.c2.y)} ${n(p3.x)} ${n(p3.y)}`;
}

function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  if (l === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / l;
}

/** Ramer-Douglas-Peucker: removes hand tremor while keeping the drawn shape. */
export function simplify(points, tolerance = 0.25) {
  if (points.length < 3) return points.slice();
  let best = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > best) { best = d; index = i; }
  }
  if (best <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

/** Smooth SVG path through points (Catmull-Rom converted to cubic Béziers). */
export function smoothPathD(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${n(points[0].x)} ${n(points[0].y)}`;
  if (points.length === 2) return `M${n(points[0].x)} ${n(points[0].y)}L${n(points[1].x)} ${n(points[1].y)}`;
  let d = `M${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  return d;
}

/**
 * Least-squares fit of one cubic to a drawn stroke, with the end points fixed.
 * Returns null controls when the stroke is close to straight, so a straight
 * drag gives a straight run.
 */
export function fitCubic(points, straightTolerance = 0.9) {
  const p0 = points[0];
  const p3 = points[points.length - 1];
  if (points.length < 4) return { c1: null, c2: null };
  let maxDev = 0;
  for (const p of points) maxDev = Math.max(maxDev, perpendicularDistance(p, p0, p3));
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  if (maxDev < straightTolerance || maxDev < chord * 0.04) return { c1: null, c2: null };

  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const total = lengths[lengths.length - 1] || 1;
  let a11 = 0, a12 = 0, a22 = 0, bx1 = 0, bx2 = 0, by1 = 0, by2 = 0;
  for (let i = 0; i < points.length; i++) {
    const u = lengths[i] / total;
    const v = 1 - u;
    const b0 = v * v * v;
    const b1 = 3 * v * v * u;
    const b2 = 3 * v * u * u;
    const b3 = u * u * u;
    a11 += b1 * b1;
    a12 += b1 * b2;
    a22 += b2 * b2;
    const rx = points[i].x - b0 * p0.x - b3 * p3.x;
    const ry = points[i].y - b0 * p0.y - b3 * p3.y;
    bx1 += b1 * rx; bx2 += b2 * rx;
    by1 += b1 * ry; by2 += b2 * ry;
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-9) return { c1: null, c2: null };
  return {
    c1: { x: (a22 * bx1 - a12 * bx2) / det, y: (a22 * by1 - a12 * by2) / det },
    c2: { x: (a11 * bx2 - a12 * bx1) / det, y: (a11 * by2 - a12 * by1) / det },
  };
}

export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}
