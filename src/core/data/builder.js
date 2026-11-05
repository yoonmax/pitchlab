import { addEvent, addObject, addPlayer, createDocument, createDrillMeta } from '../document.js';
import { compile, footPosition, positionAt } from '../animation/timeline.js';
import { getFormation } from '../formations/catalog.js';
import { applyFormation } from '../formations/engine.js';
import { frameAround, goalCenter } from '../pitch/geometry.js';
import { EVENT_TYPES, defaultDuration } from '../tactics/events.js';

/**
 * Authoring helper for the bundled plays, drills and lessons. It writes ordinary
 * documents through the same model the editor uses, so every example can be
 * opened, played and edited like work a coach made themselves.
 *
 * Players are referred to as "h:ST" or "a:LCB": team, then role.
 */
export class PlayBuilder {
  constructor({ title, category = 'Attacking', description = '', tags = [], kind = 'play', preset = '11v11', view = 'full', theme, drill = null, notes = '', example = null }) {
    this.doc = createDocument({ preset, fields: { title, category, description, tags, kind, notes } });
    this.doc.pitch.view = view;
    if (theme) this.doc.pitch.theme = theme;
    if (drill) this.doc.drill = createDrillMeta(drill);
    if (example) this.doc.example = example;
    this.cursor = 0;
  }

  /** Lay out a team. adv moves outfield players up the pitch; squeeze tightens depth. */
  shape(team, formationId, { adv = 0, squeeze = 1, width = 1 } = {}) {
    this.shaped = true;
    applyFormation(this.doc, team, getFormation(formationId));
    const dir = this.doc.teams[team].attack === 'right' ? 1 : -1;
    const W = this.doc.pitch.width;
    for (const o of Object.values(this.doc.objects)) {
      if (o.type !== 'player' || o.team !== team || o.gk) continue;
      const base = dir > 0 ? o.x : this.doc.pitch.length - o.x;
      const moved = base * squeeze + adv;
      o.x = dir > 0 ? moved : this.doc.pitch.length - moved;
      o.y = W / 2 + (o.y - W / 2) * width;
    }
    return this;
  }

  /** Add named players directly: [role, x, y, number?]. */
  squad(team, rows) {
    for (const [role, x, y, number] of rows) {
      addPlayer(this.doc, { team, position: role, gk: role === 'GK', x, y, ...(number != null ? { number } : {}) });
    }
    return this;
  }

  obj(type, x, y, fields = {}) {
    addObject(this.doc, { type, x, y, ...fields });
    return this;
  }

  cones(points, fields = {}) {
    for (const [x, y] of points) this.obj('cone', x, y, fields);
    return this;
  }

  id(ref) {
    const [team, role] = ref.split(':');
    const teamName = team === 'h' ? 'home' : team === 'a' ? 'away' : 'neutral';
    const found = Object.values(this.doc.objects).find((o) => o.team === teamName && o.position === role);
    if (!found) throw new Error(`No player ${ref} in "${this.doc.title}"`);
    return found.id;
  }

  place(ref, x, y) {
    const o = this.doc.objects[this.id(ref)];
    o.x = x;
    o.y = y;
    return this;
  }

  owner(ref) {
    this.doc.ball.owner = this.id(ref);
    return this;
  }

  deadBall(x, y) {
    Object.assign(this.doc.ball, { x, y, owner: null, dead: true });
    return this;
  }

  compiled() {
    return compile({ ...this.doc, events: { ...this.doc.events } });
  }

  pos(ref, t) {
    return positionAt(this.compiled(), this.id(ref), t);
  }

  move(type, ref, to, { at = this.cursor, dur, bend = 0, speed, ease, comment } = {}) {
    const start = this.pos(ref, at);
    const target = { x: to[0], y: to[1] };
    const dist = Math.hypot(target.x - start.x, target.y - start.y);
    const duration = dur ?? (speed ? Math.max(0.3, dist / speed) : defaultDuration(type, dist));
    const fields = { type, actor: this.id(ref), t: at, duration: +duration.toFixed(2), to: target, comment: comment ?? '' };
    if (ease) fields.ease = ease;
    if (bend) {
      const nx = -(target.y - start.y) / (dist || 1);
      const ny = (target.x - start.x) / (dist || 1);
      fields.c1 = { x: start.x + (target.x - start.x) / 3 + nx * bend, y: start.y + (target.y - start.y) / 3 + ny * bend };
      fields.c2 = { x: start.x + ((target.x - start.x) * 2) / 3 + nx * bend, y: start.y + ((target.y - start.y) * 2) / 3 + ny * bend };
    }
    addEvent(this.doc, fields);
    return this;
  }

  run(ref, to, o) { return this.move('run', ref, to, o); }
  overlap(ref, to, o) { return this.move('overlap', ref, to, o); }
  underlap(ref, to, o) { return this.move('underlap', ref, to, o); }
  press(ref, to, o) { return this.move('press', ref, to, o); }
  defend(ref, to, o) { return this.move('defend', ref, to, o); }

  dribble(ref, to, o = {}) {
    const at = o.at ?? this.cursor;
    this.move('dribble', ref, to, { ...o, at });
    const last = Object.values(this.doc.events).at(-1);
    this.cursor = at + last.duration + 0.05;
    return this;
  }

  /** Any ball event. `to` is a player reference or a point. The clock moves on when the ball lands. */
  ball(type, from, to, { at = this.cursor, dur, loft, c, touch = 0.25, comment } = {}) {
    const meta = EVENT_TYPES[type];
    const actor = this.id(from);
    const c0 = this.compiled();
    const start = footPosition(c0, actor, at);
    const isRef = typeof to === 'string';
    const receiver = isRef ? this.id(to) : null;
    let duration = dur;
    if (duration == null) {
      // The receiver may be moving, so estimate flight time against where they will be.
      let d = 0;
      let guess = 0.8;
      for (let i = 0; i < 3; i++) {
        const target = isRef ? positionAt(c0, receiver, at + guess) : { x: to[0], y: to[1] };
        d = Math.hypot(target.x - start.x, target.y - start.y);
        guess = defaultDuration(type, d);
      }
      duration = guess;
    }
    const fields = { type, actor, t: at, duration: +duration.toFixed(2), receiver, to: isRef ? null : { x: to[0], y: to[1] }, loft: loft ?? meta.loft ?? 0, comment: comment ?? '' };
    if (c) fields.c = { x: c[0], y: c[1] };
    addEvent(this.doc, fields);
    this.cursor = at + fields.duration + touch;
    return this;
  }

  pass(a, b, o) { return this.ball('pass', a, b, o); }
  through(a, b, o) { return this.ball('through', a, b, o); }
  cross(a, b, o) { return this.ball('cross', a, b, o); }
  switchPlay(a, b, o) { return this.ball('switch', a, b, o); }
  delivery(a, b, o) { return this.ball('setpiece', a, b, o); }
  clearance(a, b, o) { return this.ball('clearance', a, b, o); }

  shot(a, o = {}) {
    const side = this.doc.objects[this.id(a)].team === 'home' ? this.doc.teams.home.attack : this.doc.teams.away.attack;
    const g = goalCenter(this.doc.pitch, side);
    const target = o.target ?? [g.x, g.y + (o.offset ?? 2)];
    return this.ball('shot', a, target, o);
  }

  intercept(ref, { at = this.cursor, dur = 0.3 } = {}) {
    addEvent(this.doc, { type: 'interception', actor: this.id(ref), t: at, duration: dur });
    this.cursor = at + dur + 0.2;
    return this;
  }

  tackle(ref, to, { at = this.cursor, dur = 0.7 } = {}) {
    addEvent(this.doc, { type: 'tackle', actor: this.id(ref), t: at, duration: dur, to: { x: to[0], y: to[1] } });
    this.cursor = at + dur + 0.2;
    return this;
  }

  wait(seconds) { this.cursor += seconds; return this; }
  at(t) { this.cursor = t; return this; }

  /** Formation layouts can land opposing players on one spot. Ease them apart so numbers stay readable. */
  separate() {
    const players = Object.values(this.doc.objects).filter((o) => o.type === 'player');
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const a = players[i];
          const b = players[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d >= 3.4) continue;
          const push = (3.4 - d) / 2 + 0.05;
          const dy = a.y === b.y ? 1 : Math.sign(a.y - b.y);
          a.y += dy * push;
          b.y -= dy * push;
        }
      }
    }
  }

  done() {
    if (this.shaped) this.separate();
    if (this.doc.pitch.view === 'blank') {
      const c = this.compiled();
      const pts = [];
      for (const id of Object.keys(this.doc.objects)) {
        pts.push(positionAt(c, id, 0));
        for (const s of c.tracks[id].segs) pts.push(s.p3);
      }
      for (const s of c.ball) if (s.kind === 'flight') pts.push(s.to);
      this.doc.pitch.frame = frameAround(pts);
    }
    return this.doc;
  }
}

export const play = (opts) => new PlayBuilder(opts);
