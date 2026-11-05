import { SCHEMA_VERSION } from '../document.js';

/**
 * One step per schema version. Each takes the older shape and returns the next.
 * Steps must not lose information a user has entered.
 */
const STEPS = {
  // v1 kept the ball's holder in `possession` and had no team attack direction.
  1: (doc) => {
    const next = { ...doc, schema: 2 };
    next.ball = next.ball ?? { x: 52.5, y: 34, owner: doc.possession ?? null, dead: false };
    delete next.possession;
    next.teams = next.teams ?? {};
    next.teams.home = { attack: 'right', ...next.teams.home };
    next.teams.away = { attack: 'left', ...next.teams.away };
    return next;
  },
};

export function migrate(doc) {
  let current = doc;
  let version = Number(current.schema) || 1;
  if (version > SCHEMA_VERSION) {
    throw new Error(`This file was made with a newer version of pitchlab (schema ${version}).`);
  }
  while (version < SCHEMA_VERSION) {
    const step = STEPS[version];
    if (!step) throw new Error(`There is no upgrade path from schema ${version}.`);
    current = step(current);
    version = current.schema;
  }
  return current;
}
