import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { addPlayer, createDocument } from '../src/core/document.js';
import { CORE_FORMATION_IDS, FORMATIONS, formationsForPlayers, getFormation } from '../src/core/formations/catalog.js';
import { addSubstitute, animateToFormation, applyFormation, captureFormation, slotToWorld, teamPlayers, validateFormation, worldToSlot } from '../src/core/formations/engine.js';
import { compile, positionAt } from '../src/core/animation/timeline.js';
import { createPitch } from '../src/core/pitch/geometry.js';

const withFormation = (id, team = 'home', doc = createDocument()) => {
  applyFormation(doc, team, getFormation(id));
  return doc;
};

describe('formation catalog', () => {
  it('includes all twelve requested formations', () => {
    expect(CORE_FORMATION_IDS).toEqual(['4-3-3', '4-2-3-1', '4-4-2', '4-1-4-1', '4-3-2-1', '4-3-1-2', '3-5-2', '3-4-3', '3-4-2-1', '5-3-2', '5-4-1', '4-2-2-2']);
  });

  it.each(CORE_FORMATION_IDS)('%s has eleven players, one goalkeeper, and adds up', (id) => {
    const f = getFormation(id);
    expect(f.slots).toHaveLength(11);
    expect(f.slots.filter((s) => s.role === 'GK')).toHaveLength(1);
    const parts = id.split('-').map(Number);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10);
    for (const s of f.slots) {
      expect(s.w).toBeGreaterThanOrEqual(0);
      expect(s.w).toBeLessThanOrEqual(1);
      expect(s.d).toBeGreaterThan(0);
    }
    const roles = f.slots.map((s) => s.role);
    expect(new Set(roles).size).toBe(11);
  });

  it('keeps the goalkeeper deepest in every formation', () => {
    for (const f of FORMATIONS) {
      const gk = f.slots.find((s) => s.role === 'GK');
      for (const s of f.slots) if (s !== gk) expect(s.d).toBeGreaterThan(gk.d);
    }
  });

  it('has small-sided formations with the right player counts', () => {
    expect(formationsForPlayers(9).length).toBeGreaterThan(0);
    for (const n of [9, 7, 5]) for (const f of formationsForPlayers(n)) expect(f.slots).toHaveLength(n);
  });
});

describe('formation engine', () => {
  it('creates a full team with unique numbers', () => {
    const doc = withFormation('4-3-3');
    const players = teamPlayers(doc, 'home');
    expect(players).toHaveLength(11);
    expect(new Set(players.map((p) => p.number)).size).toBe(11);
    expect(players.filter((p) => p.gk)).toHaveLength(1);
  });

  it('places initial positions from the slots, mirrored for the other team', () => {
    const doc = createDocument();
    expect(slotToWorld(doc.pitch, 'right', { d: 0.5, w: 0.25 })).toEqual({ x: 26.25, y: 17 });
    expect(slotToWorld(doc.pitch, 'left', { d: 0.5, w: 0.25 })).toEqual({ x: 78.75, y: 51 });
    expect(worldToSlot(doc.pitch, 'left', 78.75, 51)).toEqual({ d: 0.5, w: 0.25 });
  });

  it('changes formation without adding or losing anyone', () => {
    const doc = withFormation('4-3-3');
    const before = teamPlayers(doc, 'home').map((p) => p.id).sort();
    applyFormation(doc, 'home', getFormation('3-5-2'));
    const players = teamPlayers(doc, 'home');
    expect(players.map((p) => p.id).sort()).toEqual(before);
    expect(players.map((p) => p.position).sort()).toEqual(getFormation('3-5-2').slots.map((s) => s.role).sort());
  });

  it('works on an immer draft, as the store uses it', () => {
    const doc = withFormation('4-3-3');
    const next = produce(doc, (d) => { applyFormation(d, 'home', getFormation('4-4-2')); });
    expect(teamPlayers(next, 'home')).toHaveLength(11);
    expect(next.teams.home.formation).toBe('4-4-2');
  });

  it('keeps names, numbers and the goalkeeper when switching', () => {
    const doc = withFormation('4-3-3');
    const st = teamPlayers(doc, 'home').find((p) => p.position === 'ST');
    st.name = 'Okafor';
    const gk = teamPlayers(doc, 'home').find((p) => p.gk);
    applyFormation(doc, 'home', getFormation('4-2-3-1'));
    expect(doc.objects[st.id]).toMatchObject({ name: 'Okafor', position: 'ST' });
    expect(doc.objects[gk.id].position).toBe('GK');
    expect(doc.objects[gk.id].number).toBe(gk.number);
  });

  it('moves players as little as it can', () => {
    const doc = withFormation('4-4-2');
    const lb = teamPlayers(doc, 'home').find((p) => p.position === 'LB');
    const y = lb.y;
    applyFormation(doc, 'home', getFormation('4-3-3'));
    expect(doc.objects[lb.id].y).toBeCloseTo(y, 1);
  });

  it('benches extra players and creates missing ones', () => {
    const doc = withFormation('4-3-3');
    applyFormation(doc, 'home', getFormation('2-3-1'));
    expect(teamPlayers(doc, 'home')).toHaveLength(7);
    expect(Object.values(doc.objects).filter((o) => o.team === 'home' && o.sub)).toHaveLength(4);
    const doc2 = createDocument();
    addPlayer(doc2, { team: 'home', x: 10, y: 10 });
    applyFormation(doc2, 'home', getFormation('4-3-3'));
    expect(teamPlayers(doc2, 'home')).toHaveLength(11);
  });

  it('fits the selected pitch', () => {
    const doc = createDocument({ preset: '7v7' });
    applyFormation(doc, 'home', getFormation('2-3-1'));
    for (const p of teamPlayers(doc, 'home')) {
      expect(p.x).toBeLessThanOrEqual(createPitch('7v7').length);
      expect(p.y).toBeLessThanOrEqual(37);
    }
  });

  it('applies to each team independently', () => {
    const doc = withFormation('4-3-3');
    applyFormation(doc, 'away', getFormation('5-4-1'));
    const homeBefore = teamPlayers(doc, 'home').map((p) => [p.id, p.x, p.y]);
    applyFormation(doc, 'away', getFormation('3-4-3'));
    expect(teamPlayers(doc, 'home').map((p) => [p.id, p.x, p.y])).toEqual(homeBefore);
    expect(doc.teams.away.formation).toBe('3-4-3');
  });

  it('adds substitutes off the pitch', () => {
    const doc = withFormation('4-3-3');
    const id = addSubstitute(doc, 'home');
    expect(doc.objects[id].sub).toBe(true);
    expect(doc.objects[id].y).toBeGreaterThan(doc.pitch.width);
    expect(teamPlayers(doc, 'home')).toHaveLength(11);
  });

  it('writes a shape change as timed movements', () => {
    const doc = withFormation('4-3-3');
    const compiled = compile(doc);
    const next = produce(doc, (d) => { animateToFormation(d, compiled, 'home', getFormation('3-2-5'), 2, 1.5, positionAt); });
    const evs = Object.values(next.events);
    expect(evs).toHaveLength(11);
    expect(new Set(evs.map((e) => e.group)).size).toBe(1);
    const c = compile(next);
    const ids = teamPlayers(next, 'home').map((p) => p.id);
    for (const id of ids) expect(positionAt(c, id, 2)).toEqual({ x: next.objects[id].x, y: next.objects[id].y });
    const target = getFormation('3-2-5').slots.map((s) => slotToWorld(next.pitch, 'right', s));
    for (const id of ids) {
      const end = positionAt(c, id, 5);
      expect(target.some((w) => Math.hypot(w.x - end.x, w.y - end.y) < 0.01)).toBe(true);
    }
  });
});

describe('custom formations', () => {
  it('captures current positions and round-trips them', () => {
    const doc = withFormation('4-3-3');
    const p = teamPlayers(doc, 'home')[3];
    p.x = 40;
    p.y = 20;
    const f = captureFormation(doc, 'home', 'Ours');
    expect(f.slots).toHaveLength(11);
    expect(f.name).toBe('Ours');
    const fresh = createDocument();
    applyFormation(fresh, 'home', f);
    expect(teamPlayers(fresh, 'home').some((q) => Math.abs(q.x - 40) < 0.1 && Math.abs(q.y - 20) < 0.1)).toBe(true);
  });

  it('validates imported formations', () => {
    expect(validateFormation(null).ok).toBe(false);
    expect(validateFormation({ name: '', slots: [] }).ok).toBe(false);
    expect(validateFormation({ name: 'x', slots: [{ role: 'CB', d: 'nope', w: 1 }] }).ok).toBe(false);
    expect(validateFormation({ name: 'x', slots: Array(40).fill({ d: 1, w: 1 }) }).ok).toBe(false);
    const ok = validateFormation({ name: ' Mine ', slots: [{ role: 'GK', d: 0.1, w: 0.5 }] });
    expect(ok.ok).toBe(true);
    expect(ok.formation.name).toBe('Mine');
  });
});
