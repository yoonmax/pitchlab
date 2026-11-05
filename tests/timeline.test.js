import { describe, expect, it, vi } from 'vitest';
import { produce } from 'immer';
import { addEvent, addPlayer, createDocument, deleteObjects, placeObjectAt, setKeyframe, shiftEvents } from '../src/core/document.js';
import { ballAt, compile, ownerAt, positionAt, sample } from '../src/core/animation/timeline.js';
import { PlaybackController } from '../src/core/animation/playback.js';
import { buildArcTable, cubicAt, fitCubic, resolveControls, simplify, uAtFraction } from '../src/core/animation/bezier.js';
import { ease } from '../src/core/animation/easing.js';
import { summarize } from '../src/core/tactics/summary.js';

function scene() {
  const doc = createDocument();
  const a = addPlayer(doc, { team: 'home', number: 6, x: 30, y: 30 });
  const b = addPlayer(doc, { team: 'home', number: 7, x: 50, y: 30 });
  const c = addPlayer(doc, { team: 'away', number: 4, x: 40, y: 45 });
  doc.ball.owner = a;
  return { doc, a, b, c };
}

describe('Bézier paths', () => {
  it('moves at even speed along a curved path', () => {
    const p0 = { x: 0, y: 0 };
    const p3 = { x: 20, y: 0 };
    const { c1, c2 } = resolveControls(p0, { x: 0, y: 20 }, { x: 20, y: 20 }, p3);
    const table = buildArcTable(p0, c1, c2, p3);
    let prev = p0;
    const steps = [];
    for (let i = 1; i <= 10; i++) {
      const q = cubicAt(p0, c1, c2, p3, uAtFraction(table, i / 10));
      steps.push(Math.hypot(q.x - prev.x, q.y - prev.y));
      prev = q;
    }
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.1);
  });

  it('turns a straight stroke into a straight line', () => {
    const pts = Array.from({ length: 12 }, (_, i) => ({ x: i, y: i * 0.5 + (i % 2) * 0.05 }));
    expect(fitCubic(pts)).toEqual({ c1: null, c2: null });
  });

  it('fits a curved stroke closely with one cubic', () => {
    const pts = Array.from({ length: 30 }, (_, i) => { const a = (Math.PI * i) / 29; return { x: 10 - 10 * Math.cos(a), y: 10 * Math.sin(a) }; });
    const { c1, c2 } = fitCubic(pts);
    expect(c1).not.toBeNull();
    const mid = cubicAt(pts[0], c1, c2, pts[29], 0.5);
    expect(mid.x).toBeCloseTo(10, 0);
    expect(mid.y).toBeGreaterThan(8.5);
  });

  it('simplifies a noisy stroke but keeps its corners', () => {
    const pts = [{ x: 0, y: 0 }, { x: 5, y: 0.05 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 10, y: 10 }];
    expect(simplify(pts, 0.2)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });
});

describe('keyframe interpolation', () => {
  it('interpolates between keyframes and starts from the previous arrival', () => {
    const { doc, a } = scene();
    setKeyframe(doc, a, 2, 40, 30, { ease: 'linear' });
    setKeyframe(doc, a, 4, 40, 50, { ease: 'linear' });
    const c = compile(doc);
    expect(positionAt(c, a, 0)).toEqual({ x: 30, y: 30 });
    expect(positionAt(c, a, 1).x).toBeCloseTo(35);
    expect(positionAt(c, a, 2)).toEqual({ x: 40, y: 30 });
    expect(positionAt(c, a, 3).y).toBeCloseTo(40);
    expect(positionAt(c, a, 9)).toEqual({ x: 40, y: 50 });
  });

  it('applies each interpolation type', () => {
    expect(ease('linear', 0.25)).toBeCloseTo(0.25);
    expect(ease('accel', 0.5)).toBeLessThan(0.5);
    expect(ease('decel', 0.5)).toBeGreaterThan(0.5);
    expect(ease('hold', 0.99)).toBe(0);
    expect(ease('hold', 1)).toBe(1);
    expect(ease('smooth', 0)).toBe(0);
    expect(ease('smooth', 1)).toBe(1);
  });

  it('updates an existing keyframe rather than stacking a second at the same time', () => {
    const { doc, a } = scene();
    setKeyframe(doc, a, 2, 40, 30);
    setKeyframe(doc, a, 2.005, 44, 31);
    expect(Object.values(doc.events)).toHaveLength(1);
    expect(Object.values(doc.events)[0].to).toEqual({ x: 44, y: 31 });
  });

  it('holds a player still until a movement starts', () => {
    const { doc, a } = scene();
    addEvent(doc, { type: 'run', actor: a, t: 3, duration: 2, to: { x: 40, y: 30 }, ease: 'linear' });
    const c = compile(doc);
    expect(positionAt(c, a, 2.9)).toEqual({ x: 30, y: 30 });
    expect(positionAt(c, a, 4).x).toBeCloseTo(35);
  });

  it('chains movements so a player never teleports', () => {
    const { doc, a } = scene();
    addEvent(doc, { type: 'run', actor: a, t: 0, duration: 1, to: { x: 40, y: 30 } });
    addEvent(doc, { type: 'run', actor: a, t: 2, duration: 1, to: { x: 40, y: 50 } });
    const c = compile(doc);
    let prev = positionAt(c, a, 0);
    for (let t = 0.01; t < 3; t += 0.01) {
      const p = positionAt(c, a, t);
      expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(0.6);
      prev = p;
    }
  });

  it('warns about overlapping moves but still plays them', () => {
    const { doc, a } = scene();
    addEvent(doc, { type: 'run', actor: a, t: 0, duration: 2, to: { x: 40, y: 30 } });
    addEvent(doc, { type: 'run', actor: a, t: 1, duration: 2, to: { x: 40, y: 50 } });
    const c = compile(doc);
    expect(c.issues.some((i) => i.level === 'warn')).toBe(true);
    expect(positionAt(c, a, 3)).toEqual({ x: 40, y: 50 });
  });

  it('dragging at the start moves the base position; later it records a keyframe', () => {
    const { doc, a } = scene();
    placeObjectAt(doc, compile(doc), a, 0, 31, 32);
    expect(doc.objects[a]).toMatchObject({ x: 31, y: 32 });
    placeObjectAt(doc, compile(doc), a, 3, 41, 42);
    expect(doc.objects[a]).toMatchObject({ x: 31, y: 32 });
    expect(Object.values(doc.events)[0]).toMatchObject({ type: 'key', t: 3, to: { x: 41, y: 42 } });
  });
});

describe('deterministic playback', () => {
  const build = () => {
    const { doc, a, b, c } = scene();
    addEvent(doc, { type: 'run', actor: b, t: 0, duration: 2, to: { x: 65, y: 20 }, c1: { x: 55, y: 10 }, c2: { x: 60, y: 10 } });
    addEvent(doc, { type: 'pass', actor: a, t: 1, duration: 1, receiver: b, to: null });
    addEvent(doc, { type: 'press', actor: c, t: 0.5, duration: 2, to: { x: 55, y: 25 } });
    return doc;
  };

  it('scrubbing gives the same pose as playing through', () => {
    const doc = build();
    const c = compile(doc);
    const pc = new PlaybackController({ raf: () => 0, caf: () => {}, now: () => 0 });
    pc.setDuration(c.duration);
    for (let i = 0; i < 60; i++) pc.advance(1 / 60);
    expect(pc.t).toBeCloseTo(1);
    const a = sample(c, pc.t);
    const b = sample(compile(doc), 1);
    for (const id of Object.keys(a.objects)) {
      expect(a.objects[id].x).toBeCloseTo(b.objects[id].x, 9);
      expect(a.objects[id].y).toBeCloseTo(b.objects[id].y, 9);
    }
    expect(a.ball.x).toBeCloseTo(b.ball.x, 9);
  });

  it('gives the same pose whatever order times are sampled in', () => {
    const c = compile(build());
    const first = JSON.stringify(sample(c, 1.5));
    sample(c, 0.1); sample(c, 2.9); sample(c, 0);
    expect(JSON.stringify(sample(c, 1.5))).toBe(first);
  });

  it('reaches the same state at every playback speed', () => {
    const c = compile(build());
    const target = 1.6;
    const poses = [0.25, 0.5, 1, 1.5, 2, 4].map((speed) => {
      const pc = new PlaybackController({ raf: () => 0, caf: () => {}, now: () => 0 });
      pc.setDuration(c.duration);
      pc.setSpeed(speed);
      const dt = 1 / 240;
      const steps = Math.round(target / speed / dt);
      for (let i = 0; i < steps; i++) pc.advance(dt);
      return { t: pc.t, ball: ballAt(c, pc.t) };
    });
    for (const p of poses) expect(p.t).toBeCloseTo(target, 2);
    const exact = ballAt(c, target);
    for (const p of [0, 1, 2, 3, 4, 5]) {
      const direct = ballAt(c, poses[p].t);
      expect(direct).toEqual(poses[p].ball);
      expect(Math.hypot(direct.x - exact.x, direct.y - exact.y)).toBeLessThan(0.2);
    }
  });

  it('pauses, resumes, and does not lurch after a stall', () => {
    let now = 0;
    const cbs = [];
    const pc = new PlaybackController({ raf: (fn) => { cbs.push(fn); return cbs.length; }, caf: () => {}, now: () => now });
    pc.setDuration(10);
    pc.play();
    now += 500;
    cbs.pop()();
    expect(pc.t).toBeCloseTo(0.1);
    pc.pause();
    const held = pc.t;
    now += 5000;
    expect(pc.t).toBe(held);
    pc.play();
    now += 16;
    cbs.pop()();
    expect(pc.t).toBeCloseTo(held + 0.016);
  });

  it('loops by wrapping and stops at the end otherwise', () => {
    const pc = new PlaybackController({ raf: () => 1, caf: () => {}, now: () => 0 });
    pc.setDuration(2);
    pc.t = 1.9;
    pc.setLoop(true);
    pc.advance(0.3);
    expect(pc.t).toBeCloseTo(0.2);
    pc.setLoop(false);
    pc.playing = true;
    pc.t = 1.9;
    pc.advance(0.3);
    expect(pc.t).toBe(2);
    expect(pc.playing).toBe(false);
  });

  it('notifies subscribers when seeking and clamps to the duration', () => {
    const pc = new PlaybackController({ raf: () => 1, caf: () => {}, now: () => 0 });
    pc.setDuration(5);
    const fn = vi.fn();
    pc.onFrame(fn);
    pc.seek(99);
    expect(fn).toHaveBeenCalledWith(5);
    pc.seek(-3);
    expect(pc.t).toBe(0);
  });

  it('replays correctly after an edit', () => {
    const doc = build();
    const before = compile(doc);
    const runId = Object.values(doc.events).find((e) => e.type === 'run').id;
    const next = produce(doc, (d) => { d.events[runId].to = { x: 70, y: 40 }; });
    const after = compile(next);
    expect(after).not.toBe(before);
    const b = Object.values(next.objects).find((o) => o.number === 7).id;
    expect(positionAt(after, b, 5)).toEqual({ x: 70, y: 40 });
    expect(positionAt(before, b, 5)).toEqual({ x: 65, y: 20 });
  });
});

describe('ball possession', () => {
  it('transfers from passer to receiver when the ball arrives', () => {
    const { doc, a, b } = scene();
    addEvent(doc, { type: 'pass', actor: a, t: 1, duration: 1, receiver: b, to: null });
    const c = compile(doc);
    expect(ownerAt(c, 0.5)).toBe(a);
    expect(ownerAt(c, 1.5)).toBe(null);
    expect(ballAt(c, 1.5).kind).toBe('flight');
    expect(ownerAt(c, 2.5)).toBe(b);
    expect(c.issues).toHaveLength(0);
  });

  it('aims a pass at where a moving receiver will be', () => {
    const { doc, a, b } = scene();
    addEvent(doc, { type: 'run', actor: b, t: 0, duration: 3, to: { x: 80, y: 30 }, ease: 'linear' });
    addEvent(doc, { type: 'pass', actor: a, t: 0, duration: 3, receiver: b, to: null });
    const c = compile(doc);
    const end = ballAt(c, 3);
    const rcv = positionAt(c, b, 3);
    expect(Math.hypot(end.x - rcv.x, end.y - rcv.y)).toBeLessThan(2);
  });

  it('stays continuous at each hand-over', () => {
    const { doc, a, b } = scene();
    addEvent(doc, { type: 'run', actor: a, t: 0, duration: 1, to: { x: 34, y: 30 } });
    addEvent(doc, { type: 'pass', actor: a, t: 1, duration: 1, receiver: b, to: null });
    const c = compile(doc);
    let prev = ballAt(c, 0);
    for (let t = 0.005; t < 3; t += 0.005) {
      const q = ballAt(c, t);
      expect(Math.hypot(q.x - prev.x, q.y - prev.y)).toBeLessThan(0.45);
      prev = q;
    }
  });

  it('rejects a pass from a player without the ball and leaves one owner', () => {
    const { doc, a, b, c } = scene();
    addEvent(doc, { type: 'pass', actor: c, t: 1, duration: 1, receiver: b, to: null });
    const comp = compile(doc);
    expect(comp.issues[0].level).toBe('error');
    expect(comp.invalid.size).toBe(1);
    for (const t of [0, 1, 1.5, 3]) expect(ownerAt(comp, t)).toBe(a);
  });

  it('rejects a second pass while the ball is still in flight', () => {
    const { doc, a, b } = scene();
    addEvent(doc, { type: 'pass', actor: a, t: 1, duration: 2, receiver: b, to: null });
    addEvent(doc, { type: 'pass', actor: a, t: 2, duration: 1, receiver: b, to: null });
    const c = compile(doc);
    expect(c.issues.filter((i) => i.level === 'error')).toHaveLength(1);
    expect(ownerAt(c, 3.5)).toBe(b);
  });

  it('keeps the ball with a dribbler', () => {
    const { doc, a } = scene();
    addEvent(doc, { type: 'dribble', actor: a, t: 0, duration: 4, to: { x: 50, y: 40 } });
    const c = compile(doc);
    for (let t = 0; t < 4; t += 0.1) {
      const q = ballAt(c, t);
      const p = positionAt(c, a, t);
      expect(q.owner).toBe(a);
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(2);
    }
  });

  it('flags a dribble by a player who does not have the ball', () => {
    const { doc, b } = scene();
    addEvent(doc, { type: 'dribble', actor: b, t: 0, duration: 1, to: { x: 60, y: 30 } });
    expect(compile(doc).invalid.size).toBe(1);
  });

  it('lets an interception cut a pass short and take possession', () => {
    const { doc, a, b, c } = scene();
    addEvent(doc, { type: 'pass', actor: a, t: 1, duration: 2, receiver: b, to: null });
    addEvent(doc, { type: 'interception', actor: c, t: 2, duration: 0.3 });
    const comp = compile(doc);
    expect(comp.issues).toHaveLength(0);
    expect(ownerAt(comp, 1.9)).toBe(null);
    expect(ownerAt(comp, 2.5)).toBe(c);
    expect(ownerAt(comp, 5)).toBe(c);
  });

  it('transfers possession on a tackle, only when someone has the ball', () => {
    const { doc, a, c } = scene();
    addEvent(doc, { type: 'tackle', actor: c, t: 1, duration: 1, to: { x: 31, y: 31 } });
    const comp = compile(doc);
    expect(ownerAt(comp, 1)).toBe(a);
    expect(ownerAt(comp, 3)).toBe(c);
  });

  it('leaves the ball free in space and collects it when someone is on it', () => {
    const { doc, a, b } = scene();
    addEvent(doc, { type: 'pass', actor: a, t: 0, duration: 1, to: { x: 40, y: 10 } });
    let c = compile(doc);
    expect(ballAt(c, 2)).toMatchObject({ kind: 'free', x: 40, y: 10 });
    addEvent(doc, { type: 'run', actor: b, t: 0, duration: 1, to: { x: 40.5, y: 10.5 } });
    c = compile({ ...doc });
    expect(ownerAt(c, 2)).toBe(b);
  });

  it('ends a shot in a dead-ball state and arcs lofted balls in height only', () => {
    const { doc, a } = scene();
    addEvent(doc, { type: 'shot', actor: a, t: 0, duration: 1, to: { x: 105, y: 34 }, loft: 2 });
    const c = compile(doc);
    expect(ballAt(c, 0.5).h).toBeCloseTo(2);
    expect(ballAt(c, 0).h).toBeCloseTo(0);
    expect(ballAt(c, 2)).toMatchObject({ kind: 'dead', h: 0, x: 105 });
  });

  it('requires the actor to be close to a dead ball to take the set piece', () => {
    const { doc, a } = scene();
    doc.ball = { x: 30.5, y: 30, owner: null, dead: true };
    addEvent(doc, { type: 'setpiece', actor: a, t: 0.5, duration: 1, to: { x: 60, y: 30 } });
    expect(compile(doc).issues).toHaveLength(0);
    doc.ball = { x: 90, y: 60, owner: null, dead: true };
    expect(compile({ ...doc }).invalid.size).toBe(1);
  });

  it('survives deleting a player involved in the play', () => {
    const { doc, a, b } = scene();
    addEvent(doc, { type: 'pass', actor: a, t: 1, duration: 1, receiver: b, to: { x: 50, y: 30 } });
    deleteObjects(doc, [b]);
    const c = compile({ ...doc });
    expect(c.issues).toHaveLength(0);
    expect(ballAt(c, 3).kind).toBe('free');
    deleteObjects(doc, [a]);
    expect(Object.keys(doc.events)).toHaveLength(0);
    expect(doc.ball.owner).toBe(null);
  });
});

describe('play summary', () => {
  it('describes the edited timeline in order, with the clock', () => {
    const { doc, a, b } = scene();
    const run = addEvent(doc, { type: 'overlap', actor: b, t: 2, duration: 1, to: { x: 60, y: 20 } });
    addEvent(doc, { type: 'pass', actor: a, t: 3, duration: 1, receiver: b, to: null });
    addEvent(doc, { type: 'cross', actor: b, t: 5, duration: 1, to: { x: 95, y: 34 } });
    expect(summarize(doc).map((l) => l.line)).toEqual([
      '00:00 — #6 receives possession',
      '00:02 — #7 begins an overlapping run',
      '00:03 — #6 passes to #7',
      '00:05 — #7 delivers a cross',
    ]);
    shiftEvents(doc, [run], 3);
    expect(summarize({ ...doc })[2].line).toBe('00:05 — #7 begins an overlapping run');
  });

  it('leaves out events that could not happen', () => {
    const { doc, b, c } = scene();
    addEvent(doc, { type: 'pass', actor: c, t: 1, duration: 1, receiver: b, to: null });
    expect(summarize(doc).map((l) => l.text)).toEqual(['#6 receives possession']);
  });
});
