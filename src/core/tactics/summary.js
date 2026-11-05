import { compile } from '../animation/timeline.js';
import { EVENT_TYPES, formatClock, objectLabel } from './events.js';

/** A readable account of the play, generated from the edited timeline itself. */
export function summarize(doc) {
  const compiled = compile(doc);
  const lines = [];
  const name = (id) => objectLabel(doc.objects[id]);
  const ownerAtStart = doc.ball?.owner && doc.objects[doc.ball.owner];
  if (ownerAtStart) lines.push({ t: 0, text: `${name(doc.ball.owner)} receives possession`, eventId: null });

  for (const ev of compiled.events) {
    const meta = EVENT_TYPES[ev.type];
    if (!meta || ev.type === 'key') continue;
    if (compiled.invalid.has(ev.id)) continue;
    if (ev.shape) continue;
    let text = `${name(ev.actor)} ${meta.verb}`;
    if (meta.group === 'ball' && ev.receiver && doc.objects[ev.receiver]) {
      text += ` to ${name(ev.receiver)}`;
    }
    if (ev.comment) text += `: ${ev.comment}`;
    lines.push({ t: ev.t, text, eventId: ev.id });
  }

  // A ball played into space can be collected without a named receiver.
  for (const seg of compiled.ball) {
    if (seg.kind === 'flight' && !seg.receiver && Number.isFinite(seg.t1)) {
      const after = compiled.ball.find((s) => s.t0 === seg.t1);
      if (after?.kind === 'held') lines.push({ t: seg.t1, text: `${name(after.owner)} collects the ball`, eventId: null });
    }
  }
  lines.sort((a, b) => a.t - b.t);
  return lines.map((l) => ({ ...l, clock: formatClock(l.t), line: `${formatClock(l.t)} — ${l.text}` }));
}
