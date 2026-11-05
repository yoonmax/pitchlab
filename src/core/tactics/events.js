/**
 * Tactical events are the single source of truth for what happens in a play.
 * Motion events move their actor. Ball events move the ball. A dribble does both.
 * A keyframe is a motion event whose start is implied by the previous arrival.
 */

export const EVENT_TYPES = {
  // Player movement.
  run: { label: 'Run', group: 'motion', speed: 7.5, line: 'run', verb: 'begins a run' },
  overlap: { label: 'Overlap', group: 'motion', speed: 8, line: 'run', verb: 'begins an overlapping run' },
  underlap: { label: 'Underlap', group: 'motion', speed: 7.5, line: 'run', verb: 'begins an underlapping run' },
  press: { label: 'Press', group: 'motion', speed: 6.5, line: 'press', verb: 'presses' },
  defend: { label: 'Defensive movement', group: 'motion', speed: 5.5, line: 'defend', verb: 'recovers into position' },
  dribble: { label: 'Dribble', group: 'motion', speed: 6, line: 'dribble', needsBall: true, verb: 'dribbles' },
  tackle: { label: 'Tackle', group: 'motion', speed: 5, line: 'press', possession: true, verb: 'tackles' },
  key: { label: 'Keyframe', group: 'motion', speed: 6, line: 'key', verb: 'moves' },
  // Ball movement.
  pass: { label: 'Pass', group: 'ball', speed: 15, loft: 0, line: 'pass', verb: 'passes' },
  through: { label: 'Through ball', group: 'ball', speed: 15, loft: 0, line: 'pass', verb: 'plays a through ball' },
  cross: { label: 'Cross', group: 'ball', speed: 21, loft: 4.5, line: 'pass', verb: 'delivers a cross' },
  switch: { label: 'Switch of play', group: 'ball', speed: 22, loft: 7, line: 'pass', verb: 'switches play' },
  shot: { label: 'Shot', group: 'ball', speed: 28, loft: 0.8, line: 'shot', dead: true, verb: 'shoots' },
  clearance: { label: 'Clearance', group: 'ball', speed: 24, loft: 11, line: 'pass', verb: 'clears the ball' },
  setpiece: { label: 'Set-piece delivery', group: 'ball', speed: 20, loft: 5, line: 'pass', verb: 'delivers the set piece' },
  interception: { label: 'Interception', group: 'possession', speed: 15, line: 'none', verb: 'intercepts' },
};

export const MOTION_TYPES = Object.keys(EVENT_TYPES).filter((k) => EVENT_TYPES[k].group === 'motion');
export const BALL_TYPES = Object.keys(EVENT_TYPES).filter((k) => EVENT_TYPES[k].group === 'ball');

export const isMotion = (type) => EVENT_TYPES[type]?.group === 'motion';
export const isBallFlight = (type) => EVENT_TYPES[type]?.group === 'ball';

export const SPEED_PROFILES = [
  { id: 'walk', label: 'Walk', speed: 2 },
  { id: 'jog', label: 'Jog', speed: 4 },
  { id: 'run', label: 'Run', speed: 6.5 },
  { id: 'sprint', label: 'Sprint', speed: 8.5 },
];

export function defaultDuration(type, distance) {
  const meta = EVENT_TYPES[type] ?? EVENT_TYPES.run;
  const min = meta.group === 'ball' ? 0.3 : 0.5;
  return Math.max(min, +(distance / meta.speed).toFixed(2));
}

/** Readable name for an object in summaries and timeline labels. */
export function objectLabel(obj) {
  if (!obj) return 'Unknown';
  if (obj.type === 'player') {
    if (obj.number !== '' && obj.number != null) return `#${obj.number}`;
    return obj.name || obj.position || 'Player';
  }
  return obj.name || obj.type;
}

export function formatClock(t) {
  const s = Math.max(0, Math.floor(t + 1e-6));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatTime(t) {
  const clamped = Math.max(0, t);
  const m = Math.floor(clamped / 60);
  const s = clamped - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}
