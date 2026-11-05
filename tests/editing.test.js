import { beforeEach, describe, expect, it } from 'vitest';
import { addAnnotation, addEvent, addObject, addPlayer, alignEvents, createDocument, deleteAnnotations, deleteObjects, duplicateAnnotations, duplicateEvents, duplicateObjects, expandGroups, groupEvents, reassignTeam, reorderObject, shiftEvents, translateAnnotation, ungroupEvents, updateObject } from '../src/core/document.js';
import { compile, eventEndPoint, positionAt } from '../src/core/animation/timeline.js';
import { annotationEnds } from '../src/board/layers.jsx';
import { createStarterDocument, useEditor } from '../src/state/editorStore.js';
import { transport } from '../src/state/transport.js';
import { flightDuration, receiverAt, resolveBallStart, resolveMotionStart } from '../src/board/interaction.js';
import { addDefensiveWall } from '../src/state/actions.js';

describe('player operations', () => {
  it('adds players with the next free number for their team', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home' });
    const b = addPlayer(doc, { team: 'home' });
    const c = addPlayer(doc, { team: 'away' });
    expect([doc.objects[a].number, doc.objects[b].number, doc.objects[c].number]).toEqual([1, 2, 1]);
    expect(doc.objectOrder).toEqual([a, b, c]);
  });

  it('moves, renames and locks through updates', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 1, y: 2 });
    updateObject(doc, a, { x: 5, name: 'Reyes', locked: true });
    expect(doc.objects[a]).toMatchObject({ x: 5, y: 2, name: 'Reyes', locked: true });
  });

  it('duplicates with a new id, an offset and a free number', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 10, y: 10, name: 'A' });
    const [b] = duplicateObjects(doc, [a]);
    expect(b).not.toBe(a);
    expect(doc.objects[b]).toMatchObject({ x: 13, y: 13, name: 'A', number: 2 });
  });

  it('deleting a player removes their events and every reference to them', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home' });
    const b = addPlayer(doc, { team: 'home' });
    doc.ball.owner = a;
    const ann = addAnnotation(doc, { kind: 'arrow', p0: { x: 0, y: 0 }, p3: { x: 5, y: 5 }, startAttach: a, endAttach: b });
    addEvent(doc, { type: 'run', actor: a, t: 0, duration: 1, to: { x: 1, y: 1 } });
    const pass = addEvent(doc, { type: 'pass', actor: b, t: 0, duration: 1, receiver: a, to: { x: 3, y: 3 } });
    deleteObjects(doc, [a]);
    expect(doc.objects[a]).toBeUndefined();
    expect(doc.objectOrder).toEqual([b]);
    expect(Object.keys(doc.events)).toEqual([pass]);
    expect(doc.events[pass].receiver).toBe(null);
    expect(doc.annotations[ann].startAttach).toBe(null);
    expect(doc.annotations[ann].endAttach).toBe(b);
    expect(doc.ball.owner).toBe(null);
  });

  it('reassigns teams, clearing custom colour and resolving number clashes', () => {
    const doc = createDocument();
    addPlayer(doc, { team: 'away', number: 7 });
    const a = addPlayer(doc, { team: 'home', number: 7, color: '#123456' });
    reassignTeam(doc, a, 'away');
    expect(doc.objects[a].team).toBe('away');
    expect(doc.objects[a].color).toBe(null);
    expect(doc.objects[a].number).not.toBe(7);
  });

  it('changes layering', () => {
    const doc = createDocument();
    const ids = [addObject(doc, { type: 'cone' }), addObject(doc, { type: 'cone' }), addObject(doc, { type: 'cone' })];
    reorderObject(doc, ids[0], 'front');
    expect(doc.objectOrder).toEqual([ids[1], ids[2], ids[0]]);
    reorderObject(doc, ids[0], 'back');
    expect(doc.objectOrder).toEqual(ids);
  });
});

describe('drawing', () => {
  it('creates, moves and duplicates a path', () => {
    const doc = createDocument();
    const id = addAnnotation(doc, { kind: 'arrow', p0: { x: 1, y: 1 }, p3: { x: 9, y: 1 }, c1: { x: 3, y: 5 }, c2: { x: 6, y: 5 } });
    translateAnnotation(doc.annotations[id], 2, 3);
    expect(doc.annotations[id]).toMatchObject({ p0: { x: 3, y: 4 }, p3: { x: 11, y: 4 }, c1: { x: 5, y: 8 }, c2: { x: 8, y: 8 } });
    const [copy] = duplicateAnnotations(doc, [id]);
    expect(doc.annotations[copy].p0).toEqual({ x: 6, y: 7 });
    expect(doc.annotations[id].p0).toEqual({ x: 3, y: 4 });
    deleteAnnotations(doc, [id]);
    expect(doc.annotationOrder).toEqual([copy]);
  });

  it('translates freehand points and boxes', () => {
    const pen = { kind: 'pen', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    translateAnnotation(pen, 1, 1);
    expect(pen.points[1]).toEqual({ x: 2, y: 2 });
    const box = { kind: 'rect', x: 1, y: 1, w: 2, h: 2 };
    translateAnnotation(box, 1, 0);
    expect(box.x).toBe(2);
  });

  it('keeps a line attached to a player as that player moves on the timeline', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 10, y: 10 });
    addEvent(doc, { type: 'run', actor: a, t: 0, duration: 2, to: { x: 30, y: 10 }, ease: 'linear' });
    const line = { kind: 'arrow', p0: { x: 10, y: 10 }, p3: { x: 50, y: 50 }, startAttach: a, endAttach: null };
    const c = compile(doc);
    expect(annotationEnds(line, c, 0).p0).toEqual({ x: 10, y: 10 });
    expect(annotationEnds(line, c, 1).p0.x).toBeCloseTo(20);
    expect(annotationEnds(line, c, 1).p3).toEqual({ x: 50, y: 50 });
  });
});

describe('timeline editing', () => {
  const setup = () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 10, y: 10 });
    const e1 = addEvent(doc, { type: 'run', actor: a, t: 1, duration: 1, to: { x: 20, y: 10 } });
    const e2 = addEvent(doc, { type: 'run', actor: a, t: 3, duration: 2, to: { x: 30, y: 10 } });
    return { doc, a, e1, e2 };
  };

  it('shifts in time but never before zero', () => {
    const { doc, e1 } = setup();
    shiftEvents(doc, [e1], -5);
    expect(doc.events[e1].t).toBe(0);
  });

  it('groups move together, and ungroup separates them', () => {
    const { doc, e1, e2 } = setup();
    groupEvents(doc, [e1, e2]);
    expect(expandGroups(doc, [e1]).sort()).toEqual([e1, e2].sort());
    shiftEvents(doc, [e1], 1);
    expect([doc.events[e1].t, doc.events[e2].t]).toEqual([2, 4]);
    ungroupEvents(doc, [e1]);
    expect(expandGroups(doc, [e1])).toEqual([e1]);
  });

  it('aligns starts and ends', () => {
    const { doc, e1, e2 } = setup();
    alignEvents(doc, [e1, e2], 'start');
    expect(doc.events[e2].t).toBe(1);
    doc.events[e2].t = 3;
    alignEvents(doc, [e1, e2], 'end');
    expect(doc.events[e1].t + doc.events[e1].duration).toBe(5);
  });

  it('duplicates events with an offset', () => {
    const { doc, e1 } = setup();
    const [c] = duplicateEvents(doc, [e1], 0.5);
    expect(doc.events[c]).toMatchObject({ t: 1.5, duration: 1 });
    expect(doc.events[c].to).not.toBe(doc.events[e1].to);
  });

  it('queues a new movement after the same player’s current one', () => {
    const { doc, a } = setup();
    expect(resolveMotionStart(doc, a, 1.5)).toBe(2);
    expect(resolveMotionStart(doc, a, 2.5)).toBe(2.5);
    expect(resolveMotionStart(doc, a, 4)).toBe(5);
  });
});

describe('tool logic', () => {
  it('hands the ball to the first passer on a board with no ball events', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 10, y: 10 });
    expect(resolveBallStart(doc, compile(doc), a, 0)).toEqual({ t: 0, giveBall: true });
  });

  it('starts a ball action when the player actually receives the ball', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 10, y: 10 });
    const b = addPlayer(doc, { team: 'home', x: 30, y: 10 });
    doc.ball.owner = a;
    addEvent(doc, { type: 'pass', actor: a, t: 0, duration: 1.5, receiver: b, to: null });
    const res = resolveBallStart(doc, compile(doc), b, 0);
    expect(res.t).toBeCloseTo(1.65);
    expect(res.giveBall).toBe(false);
  });

  it('refuses a ball action from someone who never gets the ball', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 10, y: 10 });
    const b = addPlayer(doc, { team: 'home', x: 30, y: 10 });
    const c = addPlayer(doc, { team: 'away', x: 60, y: 10 });
    doc.ball.owner = a;
    addEvent(doc, { type: 'pass', actor: a, t: 0, duration: 1, receiver: b, to: null });
    expect(resolveBallStart(doc, compile(doc), c, 0)).toBe(null);
  });

  it('finds a receiver on a player or along their run, with the arrival time', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 10, y: 10 });
    const b = addPlayer(doc, { team: 'home', x: 30, y: 10 });
    const still = addPlayer(doc, { team: 'home', x: 10, y: 50 });
    addEvent(doc, { type: 'run', actor: b, t: 0, duration: 2, to: { x: 50, y: 10 }, ease: 'linear' });
    const c = compile(doc);
    const onRun = receiverAt(doc, c, 'pass', { x: 10, y: 10 }, { x: 40, y: 10 }, 0, a);
    expect(onRun.id).toBe(b);
    expect(onRun.arriveAt).toBeCloseTo(1, 0);
    const standing = receiverAt(doc, c, 'pass', { x: 10, y: 10 }, { x: 10.5, y: 50 }, 0, a);
    expect(standing).toMatchObject({ id: still, arriveAt: null });
    expect(receiverAt(doc, c, 'pass', { x: 10, y: 10 }, { x: 90, y: 60 }, 0, a)).toBe(null);
  });

  it('matches flight time to the runner, within believable ball speeds', () => {
    expect(flightDuration('pass', 30, 0, null)).toBe(2);
    expect(flightDuration('pass', 30, 0, 2.5)).toBe(2.5);
    expect(flightDuration('pass', 30, 0, 0.5)).toBeCloseTo(1.25);
    expect(flightDuration('pass', 6, 0, 5)).toBe(1);
  });

  it('a pass into a run ends at the runner’s feet', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 10, y: 10 });
    const b = addPlayer(doc, { team: 'home', x: 30, y: 10 });
    doc.ball.owner = a;
    addEvent(doc, { type: 'run', actor: b, t: 0, duration: 2, to: { x: 50, y: 10 } });
    const pass = addEvent(doc, { type: 'pass', actor: a, t: 0, duration: 2, receiver: b, to: null });
    const c = compile(doc);
    const end = eventEndPoint(c, doc.events[pass]);
    expect(Math.hypot(end.x - 50, end.y - 10)).toBeLessThan(2);
    expect(positionAt(c, b, 2)).toEqual({ x: 50, y: 10 });
  });
});

describe('editor store', () => {
  beforeEach(() => { useEditor.getState().loadDoc(createStarterDocument()); });
  const s = () => useEditor.getState();

  it('undoes and redoes commits', () => {
    const before = s().doc;
    s().commit((d) => { d.title = 'One'; });
    s().commit((d) => { d.title = 'Two'; });
    s().undo();
    expect(s().doc.title).toBe('One');
    s().undo();
    expect(s().doc).toBe(before);
    s().redo();
    s().redo();
    expect(s().doc.title).toBe('Two');
  });

  it('accepts edits that happen to return a value', () => {
    const id = s().doc.objectOrder[0];
    s().commit((d) => { d.objects[id].x = 1; return 'ignored'; });
    expect(s().doc.objects[id].x).toBe(1);
    s().beginGesture();
    s().updateGesture((d) => { d.objects[id].x = 2; return 7; });
    s().endGesture();
    expect(s().doc.objects[id].x).toBe(2);
  });

  it('a new edit clears redo, and no-ops add no history', () => {
    s().commit((d) => { d.title = 'One'; });
    s().undo();
    s().commit((d) => { d.title = 'Two'; });
    expect(s().future).toHaveLength(0);
    const len = s().past.length;
    s().commit(() => {});
    expect(s().past).toHaveLength(len);
  });

  it('a drag is one undo step, recomputed from its base so nothing accumulates', () => {
    const id = s().doc.objectOrder[0];
    const x = s().doc.objects[id].x;
    const history = s().past.length;
    s().beginGesture();
    for (let i = 1; i <= 20; i++) s().updateGesture((d) => { d.objects[id].x = x + i; });
    s().endGesture();
    expect(s().doc.objects[id].x).toBe(x + 20);
    expect(s().past.length).toBe(history + 1);
    s().undo();
    expect(s().doc.objects[id].x).toBe(x);
  });

  it('cancelling a drag restores the document with no history', () => {
    const before = s().doc;
    const id = before.objectOrder[0];
    s().beginGesture();
    s().updateGesture((d) => { d.objects[id].x = 999; });
    s().cancelGesture();
    expect(s().doc).toBe(before);
    expect(s().past).toHaveLength(0);
  });

  it('removes deleted items from the selection on undo and redo', () => {
    let id;
    s().commit((d) => { id = addPlayer(d, { team: 'home', x: 1, y: 1 }); });
    s().select({ objects: [id] });
    s().undo();
    expect(s().selection.objects).toEqual([]);
  });

  it('does not delete locked objects', () => {
    const id = s().doc.objectOrder[0];
    s().commit((d) => { d.objects[id].locked = true; });
    s().select({ objects: [id] });
    s().deleteSelection();
    expect(s().doc.objects[id]).toBeDefined();
  });

  it('copies and pastes objects', () => {
    const id = s().doc.objectOrder[0];
    const count = s().doc.objectOrder.length;
    s().select({ objects: [id] });
    expect(s().copySelection()).toBe(true);
    s().paste();
    expect(s().doc.objectOrder.length).toBe(count + 1);
    expect(s().selection.objects[0]).not.toBe(id);
  });

  it('blocks every edit when read-only', () => {
    const doc = s().doc;
    s().loadDoc(doc, { readOnly: true });
    s().commit((d) => { d.title = 'Nope'; });
    expect(s().doc.title).toBe(doc.title);
  });

  it('keeps the playback duration in step with the document', () => {
    const id = s().doc.objectOrder[0];
    expect(transport.duration).toBe(0);
    s().commit((d) => { addEvent(d, { type: 'run', actor: id, t: 0, duration: 3, to: { x: 5, y: 5 } }); });
    expect(transport.duration).toBeGreaterThan(3);
    s().undo();
    expect(transport.duration).toBe(0);
  });

  it('adds a wall 9.15 m from the ball', () => {
    s().commit((d) => { d.ball = { x: 80, y: 20, owner: null, dead: true }; });
    addDefensiveWall(4);
    const ids = s().selection.objects;
    expect(ids).toHaveLength(4);
    const ps = ids.map((i) => s().doc.objects[i]);
    const cx = ps.reduce((a, p) => a + p.x, 0) / 4;
    const cy = ps.reduce((a, p) => a + p.y, 0) / 4;
    expect(Math.hypot(cx - 80, cy - 20)).toBeCloseTo(9.15, 1);
  });
});
