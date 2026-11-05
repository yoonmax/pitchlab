import { uid } from '../ids.js';
import { addEvent, addPlayer, nextNumber } from '../document.js';
import { ROLE_NUMBERS } from './catalog.js';

/** Slot to world position. Depth is measured from the goal the team defends. */
export function slotToWorld(pitch, attack, slot) {
  const half = pitch.length / 2;
  const x = slot.d * half;
  const y = slot.w * pitch.width;
  return attack === 'right' ? { x, y } : { x: pitch.length - x, y: pitch.width - y };
}

export function worldToSlot(pitch, attack, x, y) {
  const half = pitch.length / 2;
  const wx = attack === 'right' ? x : pitch.length - x;
  const wy = attack === 'right' ? y : pitch.width - y;
  return { d: +(wx / half).toFixed(3), w: +(wy / pitch.width).toFixed(3) };
}

export const teamPlayers = (doc, team) => Object.values(doc.objects)
  .filter((o) => o.type === 'player' && o.team === team && !o.sub);

/**
 * Assign existing players to slots, keeping identities where possible: the
 * goalkeeper stays in goal, players keep a matching role, and the rest take the
 * nearest open slot so a change of shape moves people as little as it can.
 */
export function assignSlots(players, slotPositions) {
  const open = slotPositions.map((slot, index) => ({ ...slot, index }));
  const result = new Map();
  const take = (player, slot) => { result.set(player.id, slot); open.splice(open.indexOf(slot), 1); };
  const remaining = [...players];

  const keeper = remaining.find((p) => p.gk) ?? null;
  const gkSlot = open.find((s) => s.role === 'GK');
  if (keeper && gkSlot) { take(keeper, gkSlot); remaining.splice(remaining.indexOf(keeper), 1); }

  for (const p of [...remaining]) {
    const same = open.find((s) => s.role === p.position);
    if (same) { take(p, same); remaining.splice(remaining.indexOf(p), 1); }
  }

  const pairs = [];
  for (const p of remaining) for (const s of open) pairs.push({ p, s, cost: (p.x - s.x) ** 2 + (p.y - s.y) ** 2 });
  pairs.sort((a, b) => a.cost - b.cost);
  const used = new Set();
  for (const { p, s } of pairs) {
    if (used.has(p.id) || !open.includes(s)) continue;
    used.add(p.id);
    take(p, s);
  }
  return result;
}

/**
 * Lay a team out in a formation. Extra players go to the bench; missing players
 * are created. Returns the previous positions so the board can animate from them.
 */
export function applyFormation(doc, team, formation) {
  const attack = doc.teams[team].attack;
  const positions = formation.slots.map((slot, index) => ({ ...slot, index, ...slotToWorld(doc.pitch, attack, slot) }));
  const players = teamPlayers(doc, team);
  const assigned = assignSlots(players, positions);
  const previous = {};
  for (const p of players) {
    previous[p.id] = { x: p.x, y: p.y };
    const slot = assigned.get(p.id);
    if (slot) {
      p.x = slot.x;
      p.y = slot.y;
      p.position = slot.role;
      p.gk = slot.role === 'GK';
    } else {
      p.sub = true;
      benchPlayer(doc, p);
    }
  }
  const used = new Set([...assigned.values()].map((s) => s.index));
  for (const slot of positions) {
    if (used.has(slot.index)) continue;
    const taken = new Set(Object.values(doc.objects).filter((o) => o.type === 'player' && o.team === team).map((o) => Number(o.number)));
    const wanted = ROLE_NUMBERS[slot.role];
    const number = wanted && !taken.has(wanted) ? wanted : nextNumber(doc, team);
    addPlayer(doc, { team, number, position: slot.role, gk: slot.role === 'GK', x: slot.x, y: slot.y });
  }
  doc.teams[team].formation = formation.id;
  return previous;
}

function benchPlayer(doc, p) {
  const subs = Object.values(doc.objects).filter((o) => o.type === 'player' && o.team === p.team && o.sub && o.id !== p.id);
  const side = p.team === 'home' ? 0.08 : 0.58;
  p.x = doc.pitch.length * side + subs.length * 3.4;
  p.y = doc.pitch.width + 4;
}

export function addSubstitute(doc, team) {
  const id = addPlayer(doc, { team, sub: true, position: 'SUB' });
  benchPlayer(doc, doc.objects[id]);
  return id;
}

/**
 * Write a shape change into the timeline: each player gets a keyframe at time
 * `t`, and a hold keyframe where the move begins, so the change lasts `duration`.
 */
export function animateToFormation(doc, compiled, team, formation, t, duration, positionAt) {
  const attack = doc.teams[team].attack;
  const positions = formation.slots.map((slot) => ({ ...slot, ...slotToWorld(doc.pitch, attack, slot) }));
  const players = teamPlayers(doc, team).map((p) => ({ ...p, ...positionAt(compiled, p.id, t) }));
  const assigned = assignSlots(players, positions);
  const group = uid('g');
  for (const p of players) {
    const slot = assigned.get(p.id);
    if (!slot) continue;
    addEvent(doc, { type: 'run', actor: p.id, t, duration, to: { x: slot.x, y: slot.y }, ease: 'smooth', group, shape: true });
  }
  return group;
}

/** A formation made from where players stand right now. */
export function captureFormation(doc, team, name, positions) {
  const attack = doc.teams[team].attack;
  const slots = teamPlayers(doc, team).map((p) => {
    const at = positions?.[p.id] ?? p;
    return { role: p.position || (p.gk ? 'GK' : 'CM'), ...worldToSlot(doc.pitch, attack, at.x, at.y) };
  });
  return { id: uid('f'), name, players: slots.length, custom: true, slots, createdAt: Date.now() };
}

export function validateFormation(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['The file does not contain a formation.'] };
  if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push('The formation needs a name.');
  if (!Array.isArray(raw.slots) || raw.slots.length === 0 || raw.slots.length > 30) errors.push('The formation needs between 1 and 30 positions.');
  const slots = (Array.isArray(raw.slots) ? raw.slots : []).map((s) => ({
    role: String(s?.role ?? 'CM').slice(0, 6),
    d: Number(s?.d),
    w: Number(s?.w),
  }));
  if (slots.some((s) => !Number.isFinite(s.d) || !Number.isFinite(s.w))) errors.push('Every position needs numeric d and w values.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, formation: { id: uid('f'), name: raw.name.trim().slice(0, 60), players: slots.length, custom: true, slots } };
}
