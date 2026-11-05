import { describe, expect, it } from 'vitest';
import { PITCH_PRESETS, createPitch, laneEdges, overlayGeometry, penaltyArcAngle, pitchPrimitives, primitivesToPath, resizePitch, viewBounds } from '../src/core/pitch/geometry.js';
import { camerasClose, cameraMatrix, dampCamera, fitCamera, panBy, screenToWorld, worldToScreen, zoomAt } from '../src/core/pitch/coordinates.js';

const byId = (prims, id) => prims.find((p) => p.id === id);

describe('pitch proportions', () => {
  const pitch = createPitch('11v11');
  const prims = pitchPrimitives(pitch);

  it('uses the Law 1 dimensions for 11v11', () => {
    expect(pitch.length).toBe(105);
    expect(pitch.width).toBe(68);
    expect(byId(prims, 'penalty-area-left')).toMatchObject({ x: 0, w: 16.5, h: 40.32 });
    expect(byId(prims, 'goal-area-left')).toMatchObject({ x: 0, w: 5.5, h: 18.32 });
    expect(byId(prims, 'center-circle').r).toBe(9.15);
    expect(byId(prims, 'penalty-mark-left').cx).toBe(11);
    expect(byId(prims, 'penalty-mark-right').cx).toBe(94);
  });

  it('centres boxes and goals on the width of the pitch', () => {
    for (const id of ['penalty-area-left', 'goal-area-right', 'goal-left', 'goal-right']) {
      const r = byId(prims, id);
      expect(r.y + r.h / 2).toBeCloseTo(34);
    }
    expect(byId(prims, 'goal-left').h).toBeCloseTo(7.32);
  });

  it('places the right penalty area flush with the far goal line', () => {
    const r = byId(prims, 'penalty-area-right');
    expect(r.x + r.w).toBeCloseTo(105);
  });

  it('ends each penalty arc exactly on the edge of the penalty area', () => {
    const left = byId(prims, 'penalty-arc-left');
    expect(left.x1).toBeCloseTo(16.5);
    expect(left.x2).toBeCloseTo(16.5);
    expect(Math.hypot(left.x1 - 11, left.y1 - 34)).toBeCloseTo(9.15);
    const right = byId(prims, 'penalty-arc-right');
    expect(right.x1).toBeCloseTo(88.5);
    expect(penaltyArcAngle(pitch)).toBeCloseTo(Math.acos(5.5 / 9.15));
  });

  it('produces a path with no invalid numbers', () => {
    expect(primitivesToPath(prims)).not.toMatch(/NaN|undefined/);
  });

  it('does not scale adult markings onto small-sided pitches', () => {
    for (const key of ['9v9', '7v7', '5v5']) {
      const p = createPitch(key);
      const k = p.length / 105;
      expect(p.centerRadius).not.toBeCloseTo(9.15 * k, 3);
      expect(PITCH_PRESETS[key].source).toMatch(/FA Handbook/);
    }
    expect(createPitch('7v7').goalWidth).toBeCloseTo(3.66);
    expect(createPitch('9v9').goalWidth).toBeCloseTo(4.88);
  });

  it('keeps markings inside custom dimensions', () => {
    const small = resizePitch(pitch, 40, 25);
    expect(small.penaltyWidth).toBeLessThanOrEqual(23);
    expect(small.penaltyDepth).toBeLessThan(20);
    expect(small.centerRadius).toBeLessThan(12.5);
    expect(small.preset).toBe('custom');
    expect(resizePitch(pitch, -5, 1000).length).toBe(15);
  });

  it('frames the requested part of the pitch for each view', () => {
    const half = viewBounds({ ...pitch, view: 'half' });
    expect(half.x).toBeLessThan(52.5);
    expect(half.x + half.w).toBeGreaterThan(105);
    const att = viewBounds({ ...pitch, view: 'attacking-third' });
    expect(att.x).toBeGreaterThan(60);
    const def = viewBounds({ ...pitch, view: 'defensive-third' });
    expect(def.x + def.w).toBeLessThan(45);
  });

  it('derives the five lanes from the penalty and goal areas', () => {
    expect(laneEdges(pitch)).toEqual([34 - 20.16, 34 - 9.16, 34 + 9.16, 34 + 20.16].map((v) => expect.closeTo(v)));
    const geo = overlayGeometry({ ...pitch, overlays: { lanes: true, thirds: true } });
    expect(geo.lines.length).toBe(6);
  });
});

describe('camera transforms', () => {
  const vw = 1000;
  const vh = 700;
  const cams = [0, 90, 180, 270].map((rot) => ({ cx: 40, cy: 20, zoom: 8, rot }));

  it('round-trips world and screen coordinates at every rotation', () => {
    for (const cam of cams) {
      for (const [x, y] of [[0, 0], [105, 68], [52.5, 34], [-3, 80]]) {
        const s = worldToScreen(cam, vw, vh, x, y);
        const w = screenToWorld(cam, vw, vh, s.x, s.y);
        expect(w.x).toBeCloseTo(x, 6);
        expect(w.y).toBeCloseTo(y, 6);
      }
    }
  });

  it('puts the camera centre at the middle of the viewport', () => {
    for (const cam of cams) {
      const s = worldToScreen(cam, vw, vh, cam.cx, cam.cy);
      expect(s.x).toBeCloseTo(500);
      expect(s.y).toBeCloseTo(350);
    }
  });

  it('agrees with the SVG matrix', () => {
    const [a, b, c, d, e, f] = cameraMatrix(cams[1], vw, vh);
    const s = worldToScreen(cams[1], vw, vh, 10, 20);
    expect(a * 10 + c * 20 + e).toBeCloseTo(s.x);
    expect(b * 10 + d * 20 + f).toBeCloseTo(s.y);
  });

  it('keeps the world point under the cursor fixed when zooming', () => {
    for (const cam of cams) {
      const before = screenToWorld(cam, vw, vh, 123, 456);
      const zoomed = zoomAt(cam, vw, vh, 123, 456, 1.7, 1, 100);
      const after = screenToWorld(zoomed, vw, vh, 123, 456);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y).toBeCloseTo(before.y, 6);
      expect(zoomed.zoom).toBeCloseTo(13.6);
    }
  });

  it('clamps zoom to the allowed range', () => {
    expect(zoomAt(cams[0], vw, vh, 0, 0, 1000, 1, 30).zoom).toBe(30);
    expect(zoomAt(cams[0], vw, vh, 0, 0, 0.0001, 2, 30).zoom).toBe(2);
  });

  it('pans a world point by exactly the screen delta at every rotation', () => {
    for (const cam of cams) {
      const a = worldToScreen(cam, vw, vh, 10, 10);
      const b = worldToScreen(panBy(cam, 37, -19), vw, vh, 10, 10);
      expect(b.x - a.x).toBeCloseTo(37);
      expect(b.y - a.y).toBeCloseTo(-19);
    }
  });

  it('fits a pitch inside the viewport, swapping axes when vertical', () => {
    const bounds = { x: -5, y: -3, w: 115, h: 74 };
    const h = fitCamera(bounds, vw, vh, 0);
    expect(h.zoom * 115).toBeLessThanOrEqual(vw);
    const v = fitCamera(bounds, 400, 800, 90);
    expect(v.zoom * 115).toBeLessThanOrEqual(800);
    expect(v.zoom * 74).toBeLessThanOrEqual(400);
  });

  it('damps towards a target independently of frame rate', () => {
    const start = { cx: 0, cy: 0, zoom: 5, rot: 0 };
    const target = { cx: 10, cy: 10, zoom: 10, rot: 90 };
    let fast = start;
    for (let i = 0; i < 12; i++) fast = dampCamera(fast, target, 1 / 120);
    const slow = dampCamera(dampCamera(start, target, 0.05), target, 0.05);
    expect(fast.cx).toBeCloseTo(slow.cx, 6);
    expect(fast.zoom).toBeCloseTo(slow.zoom, 6);
    let settled = start;
    for (let i = 0; i < 300; i++) settled = dampCamera(settled, target, 1 / 60);
    expect(camerasClose(settled, target)).toBe(true);
  });
});
