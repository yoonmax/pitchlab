/**
 * Slots are { role, d, w }. d is depth: 0 is the team's own goal line and 1 the
 * halfway line. Values above 1 are in the opposition half. w is width: 0 is the
 * left touchline as the team faces the opposition goal, 1 the right.
 */
const s = (role, d, w) => ({ role, d, w });
const GK = s('GK', 0.07, 0.5);
const back4 = (d = 0.36) => [s('LB', d + 0.04, 0.12), s('LCB', d, 0.37), s('RCB', d, 0.63), s('RB', d + 0.04, 0.88)];
const back3 = (d = 0.36) => [s('LCB', d, 0.24), s('CB', d - 0.02, 0.5), s('RCB', d, 0.76)];
const back5 = (d = 0.34) => [s('LWB', d + 0.08, 0.08), s('LCB', d, 0.3), s('CB', d - 0.02, 0.5), s('RCB', d, 0.7), s('RWB', d + 0.08, 0.92)];

export const FORMATIONS = [
  { id: '4-3-3', name: '4-3-3', players: 11, slots: [GK, ...back4(), s('CDM', 0.56, 0.5), s('LCM', 0.7, 0.3), s('RCM', 0.7, 0.7), s('LW', 0.92, 0.14), s('ST', 0.98, 0.5), s('RW', 0.92, 0.86)] },
  { id: '4-2-3-1', name: '4-2-3-1', players: 11, slots: [GK, ...back4(), s('LDM', 0.58, 0.37), s('RDM', 0.58, 0.63), s('LAM', 0.8, 0.15), s('CAM', 0.8, 0.5), s('RAM', 0.8, 0.85), s('ST', 0.98, 0.5)] },
  { id: '4-4-2', name: '4-4-2', players: 11, slots: [GK, ...back4(), s('LM', 0.66, 0.12), s('LCM', 0.62, 0.38), s('RCM', 0.62, 0.62), s('RM', 0.66, 0.88), s('LS', 0.94, 0.38), s('RS', 0.94, 0.62)] },
  { id: '4-1-4-1', name: '4-1-4-1', players: 11, slots: [GK, ...back4(), s('CDM', 0.54, 0.5), s('LM', 0.74, 0.12), s('LCM', 0.72, 0.36), s('RCM', 0.72, 0.64), s('RM', 0.74, 0.88), s('ST', 0.98, 0.5)] },
  { id: '4-3-2-1', name: '4-3-2-1', players: 11, slots: [GK, ...back4(), s('LCM', 0.6, 0.24), s('CM', 0.58, 0.5), s('RCM', 0.6, 0.76), s('LF', 0.82, 0.36), s('RF', 0.82, 0.64), s('ST', 0.98, 0.5)] },
  { id: '4-3-1-2', name: '4-3-1-2', players: 11, slots: [GK, ...back4(), s('LCM', 0.6, 0.26), s('CDM', 0.56, 0.5), s('RCM', 0.6, 0.74), s('CAM', 0.78, 0.5), s('LS', 0.96, 0.38), s('RS', 0.96, 0.62)] },
  { id: '3-5-2', name: '3-5-2', players: 11, slots: [GK, ...back3(), s('LWB', 0.62, 0.08), s('LCM', 0.64, 0.33), s('CDM', 0.56, 0.5), s('RCM', 0.64, 0.67), s('RWB', 0.62, 0.92), s('LS', 0.94, 0.38), s('RS', 0.94, 0.62)] },
  { id: '3-4-3', name: '3-4-3', players: 11, slots: [GK, ...back3(), s('LWB', 0.62, 0.1), s('LCM', 0.6, 0.38), s('RCM', 0.6, 0.62), s('RWB', 0.62, 0.9), s('LW', 0.92, 0.18), s('ST', 0.98, 0.5), s('RW', 0.92, 0.82)] },
  { id: '3-4-2-1', name: '3-4-2-1', players: 11, slots: [GK, ...back3(), s('LWB', 0.62, 0.1), s('LCM', 0.58, 0.38), s('RCM', 0.58, 0.62), s('RWB', 0.62, 0.9), s('LAM', 0.82, 0.34), s('RAM', 0.82, 0.66), s('ST', 0.98, 0.5)] },
  { id: '5-3-2', name: '5-3-2', players: 11, slots: [GK, ...back5(), s('LCM', 0.62, 0.28), s('CM', 0.6, 0.5), s('RCM', 0.62, 0.72), s('LS', 0.92, 0.38), s('RS', 0.92, 0.62)] },
  { id: '5-4-1', name: '5-4-1', players: 11, slots: [GK, ...back5(), s('LM', 0.66, 0.12), s('LCM', 0.62, 0.38), s('RCM', 0.62, 0.62), s('RM', 0.66, 0.88), s('ST', 0.96, 0.5)] },
  { id: '4-2-2-2', name: '4-2-2-2', players: 11, slots: [GK, ...back4(), s('LDM', 0.58, 0.37), s('RDM', 0.58, 0.63), s('LAM', 0.8, 0.22), s('RAM', 0.8, 0.78), s('LS', 0.97, 0.38), s('RS', 0.97, 0.62)] },
  // Phase shapes: where a side stands with and without the ball, not a team sheet.
  { id: '3-2-5', name: '3-2-5 attack', players: 11, shape: true, slots: [GK, s('LCB', 0.5, 0.24), s('CB', 0.46, 0.5), s('RCB', 0.5, 0.76), s('LDM', 0.8, 0.38), s('RDM', 0.8, 0.62), s('LW', 1.24, 0.08), s('LAM', 1.28, 0.3), s('ST', 1.36, 0.5), s('RAM', 1.28, 0.7), s('RW', 1.24, 0.92)] },
  { id: '2-3-5', name: '2-3-5 attack', players: 11, shape: true, slots: [GK, s('LCB', 0.56, 0.36), s('RCB', 0.56, 0.64), s('LB', 0.86, 0.22), s('CDM', 0.8, 0.5), s('RB', 0.86, 0.78), s('LW', 1.24, 0.08), s('LAM', 1.28, 0.3), s('ST', 1.36, 0.5), s('RAM', 1.28, 0.7), s('RW', 1.24, 0.92)] },
  { id: '4-4-2-block', name: '4-4-2 mid-block', players: 11, shape: true, slots: [GK, ...back4(0.5), s('LM', 0.8, 0.14), s('LCM', 0.76, 0.38), s('RCM', 0.76, 0.62), s('RM', 0.8, 0.86), s('LS', 1.02, 0.4), s('RS', 1.02, 0.6)] },
  { id: '5-4-1-low', name: '5-4-1 low block', players: 11, shape: true, slots: [GK, ...back5(0.26), s('LM', 0.48, 0.14), s('LCM', 0.44, 0.38), s('RCM', 0.44, 0.62), s('RM', 0.48, 0.86), s('ST', 0.8, 0.5)] },
  // Small-sided.
  { id: '3-2-3', name: '3-2-3', players: 9, slots: [GK, s('LCB', 0.34, 0.22), s('CB', 0.32, 0.5), s('RCB', 0.34, 0.78), s('LCM', 0.62, 0.36), s('RCM', 0.62, 0.64), s('LW', 0.92, 0.16), s('ST', 0.98, 0.5), s('RW', 0.92, 0.84)] },
  { id: '3-3-2', name: '3-3-2', players: 9, slots: [GK, s('LCB', 0.34, 0.22), s('CB', 0.32, 0.5), s('RCB', 0.34, 0.78), s('LM', 0.64, 0.16), s('CM', 0.6, 0.5), s('RM', 0.64, 0.84), s('LS', 0.94, 0.36), s('RS', 0.94, 0.64)] },
  { id: '2-3-1', name: '2-3-1', players: 7, slots: [GK, s('LCB', 0.34, 0.3), s('RCB', 0.34, 0.7), s('LM', 0.62, 0.16), s('CM', 0.58, 0.5), s('RM', 0.62, 0.84), s('ST', 0.94, 0.5)] },
  { id: '3-2-1', name: '3-2-1', players: 7, slots: [GK, s('LCB', 0.36, 0.2), s('CB', 0.32, 0.5), s('RCB', 0.36, 0.8), s('LCM', 0.64, 0.34), s('RCM', 0.64, 0.66), s('ST', 0.94, 0.5)] },
  { id: '2-1-1', name: '2-1-1', players: 5, slots: [GK, s('LCB', 0.36, 0.28), s('RCB', 0.36, 0.72), s('CM', 0.62, 0.5), s('ST', 0.92, 0.5)] },
  { id: '1-2-1', name: '1-2-1', players: 5, slots: [GK, s('CB', 0.34, 0.5), s('LM', 0.6, 0.2), s('RM', 0.6, 0.8), s('ST', 0.92, 0.5)] },
];

for (const f of FORMATIONS) {
  if (f.shape) continue;
  f.slots = f.slots.map((slot) => (slot.role === 'GK' ? slot : { ...slot, d: +(slot.d * 0.94).toFixed(3) }));
}

export const CORE_FORMATION_IDS = ['4-3-3', '4-2-3-1', '4-4-2', '4-1-4-1', '4-3-2-1', '4-3-1-2', '3-5-2', '3-4-3', '3-4-2-1', '5-3-2', '5-4-1', '4-2-2-2'];

export const ROLE_NUMBERS = {
  GK: 1, RB: 2, RWB: 2, LB: 3, LWB: 3, RCB: 4, CB: 4, LCB: 5, CDM: 6, RDM: 6, LDM: 8, RCM: 8, CM: 8, LCM: 10,
  RW: 7, RM: 7, RAM: 7, ST: 9, RS: 9, RF: 9, CAM: 10, LAM: 10, LF: 10, LS: 10, LW: 11, LM: 11,
};

export const ROLE_NAMES = ['GK', 'RB', 'LB', 'RWB', 'LWB', 'CB', 'RCB', 'LCB', 'CDM', 'RDM', 'LDM', 'CM', 'RCM', 'LCM', 'CAM', 'RAM', 'LAM', 'RM', 'LM', 'RW', 'LW', 'RF', 'LF', 'RS', 'LS', 'ST'];

export function getFormation(id, custom = []) {
  return FORMATIONS.find((f) => f.id === id) ?? custom.find((f) => f.id === id) ?? null;
}

export function formationsForPlayers(count) {
  return FORMATIONS.filter((f) => f.players === count && !f.shape);
}
