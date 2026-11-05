/**
 * Camera maths. A camera is { cx, cy, zoom, rot }: the world point at the centre
 * of the viewport, pixels per metre, and rotation in degrees. Every pointer
 * conversion goes through these functions, so zoom, pan and rotation cannot
 * disagree with what is drawn.
 */

export const MIN_ZOOM_FACTOR = 0.6;
export const MAX_ZOOM_FACTOR = 12;

export function cameraMatrix(cam, vw, vh) {
  const r = (cam.rot * Math.PI) / 180;
  const c = Math.cos(r) * cam.zoom;
  const s = Math.sin(r) * cam.zoom;
  const e = vw / 2 - (c * cam.cx - s * cam.cy);
  const f = vh / 2 - (s * cam.cx + c * cam.cy);
  return [c, s, -s, c, e, f];
}

export function worldToScreen(cam, vw, vh, x, y) {
  const [a, b, c, d, e, f] = cameraMatrix(cam, vw, vh);
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

export function screenToWorld(cam, vw, vh, sx, sy) {
  const [a, b, c, d, e, f] = cameraMatrix(cam, vw, vh);
  const det = a * d - b * c;
  const dx = sx - e;
  const dy = sy - f;
  return { x: (d * dx - c * dy) / det, y: (a * dy - b * dx) / det };
}

/** Camera that shows `bounds` in a viewport at rotation `rot`, with some padding. */
export function fitCamera(bounds, vw, vh, rot = 0, pad = 16) {
  const quarter = Math.abs(((rot % 180) + 180) % 180) === 90;
  const bw = quarter ? bounds.h : bounds.w;
  const bh = quarter ? bounds.w : bounds.h;
  const zoom = Math.max(0.5, Math.min((vw - pad * 2) / bw, (vh - pad * 2) / bh));
  return { cx: bounds.x + bounds.w / 2, cy: bounds.y + bounds.h / 2, zoom, rot };
}

/** Zoom so the world point under (sx, sy) stays under it. */
export function zoomAt(cam, vw, vh, sx, sy, factor, minZoom, maxZoom) {
  const zoom = Math.min(maxZoom, Math.max(minZoom, cam.zoom * factor));
  const before = screenToWorld(cam, vw, vh, sx, sy);
  const next = { ...cam, zoom };
  const after = screenToWorld(next, vw, vh, sx, sy);
  return { ...next, cx: cam.cx + before.x - after.x, cy: cam.cy + before.y - after.y };
}

/** Pan by a screen-space delta. */
export function panBy(cam, dx, dy) {
  const r = (cam.rot * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { ...cam, cx: cam.cx - (c * dx + s * dy) / cam.zoom, cy: cam.cy - (-s * dx + c * dy) / cam.zoom };
}

/** Frame-rate independent approach of one camera towards another. */
export function dampCamera(cam, target, dt, rate = 14) {
  const k = 1 - Math.exp(-rate * dt);
  return {
    cx: cam.cx + (target.cx - cam.cx) * k,
    cy: cam.cy + (target.cy - cam.cy) * k,
    zoom: cam.zoom * Math.exp(Math.log(target.zoom / cam.zoom) * k),
    rot: cam.rot + (target.rot - cam.rot) * k,
  };
}

export function camerasClose(a, b) {
  return (
    Math.abs(a.cx - b.cx) < 0.005 && Math.abs(a.cy - b.cy) < 0.005 &&
    Math.abs(a.zoom / b.zoom - 1) < 0.001 && Math.abs(a.rot - b.rot) < 0.05
  );
}
