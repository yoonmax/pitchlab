export const EASINGS = {
  linear: { label: 'Linear', fn: (u) => u },
  smooth: { label: 'Smooth', fn: (u) => u * u * (3 - 2 * u) },
  accel: { label: 'Accelerate', fn: (u) => u * u },
  decel: { label: 'Decelerate', fn: (u) => 1 - (1 - u) * (1 - u) },
  hold: { label: 'Hold, then jump', fn: (u) => (u < 1 ? 0 : 1) },
};

export function ease(name, u) {
  const e = EASINGS[name] ?? EASINGS.smooth;
  return e.fn(Math.min(1, Math.max(0, u)));
}
