let counter = 0;

/** Short stable id. Random part keeps ids unique across sessions and imported files. */
export function uid(prefix = 'x') {
  counter += 1;
  const rnd = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}
