import { play } from './builder.js';

const attackingBox = [
  ['ST', 90, 30, 9], ['CB', 87, 34, 4], ['LCB', 90, 38, 5], ['RW', 86, 27, 7], ['LW', 82, 42, 11],
  ['CDM', 76, 34, 6], ['RB', 66, 46, 2], ['LB', 68, 20, 3], ['CAM', 80, 22, 10],
];
const defendingBox = [
  ['GK', 103, 34, 1], ['A', 99.5, 29, 2], ['B', 99.5, 34, 5], ['C', 99.5, 39, 4], ['D', 96, 27, 6],
  ['E', 96, 33, 8], ['F', 96, 39, 3], ['G', 92, 30, 7], ['H', 92, 38, 11], ['I', 80, 34, 10], ['J', 72, 42, 9],
];

export const SET_PIECES = [
  {
    id: 'corner-near', group: 'Corners', label: 'Corner: near-post flick',
    build: () => play({ title: 'Corner: near-post flick', category: 'Corners', kind: 'setpiece', view: 'attacking-third', description: 'An in-swinger from the left, flicked on at the near post for the back-post runner.' })
      .squad('home', [['CK', 104.4, 0.8, 8], ...attackingBox]).squad('away', defendingBox)
      .deadBall(104.4, 0.8)
      .run('h:ST', [100, 27], { at: 0.6, dur: 1.2, bend: -1.5 })
      .run('h:CB', [100, 41], { at: 0.5, dur: 1.5, bend: 2 })
      .run('h:RW', [97, 24], { at: 0.7, dur: 1 })
      .at(1).delivery('h:CK', 'h:ST', { dur: 0.95, c: [99, 8] })
      .pass('h:ST', 'h:CB', { dur: 0.35, touch: 0.05 })
      .shot('h:CB', { offset: -2 }).done(),
  },
  {
    id: 'corner-short', group: 'Corners', label: 'Corner: short routine',
    build: () => play({ title: 'Corner: short routine', category: 'Corners', kind: 'setpiece', view: 'attacking-third', description: 'A short corner changes the angle, then a cross comes in from the edge of the box.' })
      .squad('home', [['CK', 104.4, 0.8, 8], ['SH', 96, 6, 10], ...attackingBox.slice(0, 8)]).squad('away', defendingBox)
      .deadBall(104.4, 0.8)
      .at(0.6).delivery('h:CK', 'h:SH', { dur: 0.6, loft: 0 })
      .run('h:CK', [101, 9], { at: 1.3, dur: 1 })
      .pass('h:SH', 'h:CK', { dur: 0.5, at: 1.8 })
      .run('h:ST', [98, 31], { at: 1.9, dur: 1.2 })
      .run('h:CB', [96, 38], { at: 2, dur: 1.2 })
      .cross('h:CK', 'h:ST', { at: 2.75 })
      .shot('h:ST', { offset: 1 }).done(),
  },
  {
    id: 'corner-defend', group: 'Defensive set pieces', label: 'Defending a corner: zonal',
    build: () => play({ title: 'Defending a corner: zonal', category: 'Corners', kind: 'setpiece', view: 'attacking-third', description: 'A zonal front line attacks the ball, with markers on the two main threats and a clearance to the near side.' })
      .squad('away', [['CK', 104.4, 67.2, 8], ['ST', 92, 34, 9], ['CB', 91, 38, 4], ['LCB', 93, 30, 5], ['LW', 88, 44, 11], ['RW', 96, 44, 7]])
      .squad('home', [['GK', 103, 34, 1], ['Z1', 100, 40, 2], ['Z2', 100, 34, 5], ['Z3', 100, 28, 4], ['Z4', 96, 42, 6], ['Z5', 96, 34, 8], ['M1', 93, 35, 3], ['M2', 92, 41, 11], ['PL', 101, 46, 7], ['CT', 78, 48, 9]])
      .deadBall(104.4, 67.2)
      .run('a:ST', [98, 40], { at: 0.6, dur: 1.2 })
      .defend('h:M1', [97, 39], { at: 0.7, dur: 1.1 })
      .at(1).delivery('a:CK', [99, 41], { dur: 1.1 })
      .defend('h:Z1', [99, 41], { at: 1.1, dur: 0.9 })
      .at(2.2).clearance('h:Z1', 'h:CT', { dur: 1.3 }).done(),
  },
  {
    id: 'freekick-direct', group: 'Free kicks', label: 'Direct free kick: wall and shot',
    build: () => play({ title: 'Direct free kick', category: 'Free kicks', kind: 'setpiece', view: 'attacking-third', description: 'Four in the wall, 9.15 m from the ball, and a runner over the ball as a feint before the strike.' })
      .squad('home', [['FK', 80, 28, 10], ['DM', 79, 25, 8], ['ST', 92, 37, 9], ['RW', 90, 42, 7], ['CB', 86, 46, 4]])
      .squad('away', [['GK', 102.5, 35, 1], ['W1', 88.5, 30.5, 6], ['W2', 88.6, 31.3, 4], ['W3', 88.7, 32.1, 5], ['W4', 88.8, 32.9, 8], ['A', 95, 42, 2], ['B', 94, 46, 3]])
      .deadBall(81, 29)
      .run('h:DM', [83, 31], { at: 0.4, dur: 0.7, comment: 'Runs over the ball as a feint' })
      .run('h:ST', [97, 37], { at: 1.1, dur: 0.9, comment: 'Follows in for a rebound' })
      .at(1.2).ball('shot', 'h:FK', [105, 31], { dur: 0.95, loft: 2.8, c: [92, 26] }).done(),
  },
  {
    id: 'freekick-indirect', group: 'Free kicks', label: 'Indirect free kick: lay-off',
    build: () => play({ title: 'Indirect free kick: lay-off', category: 'Free kicks', kind: 'setpiece', view: 'attacking-third', description: 'A short lay-off to the side of the wall opens the shooting lane.' })
      .squad('home', [['FK', 90, 40, 10], ['LO', 88, 34, 8], ['ST', 95, 30, 9], ['CB', 94, 45, 4]])
      .squad('away', [['GK', 103, 34, 1], ['W1', 98.2, 37.5, 6], ['W2', 98.3, 38.4, 4], ['W3', 98.4, 39.3, 5], ['A', 98, 29, 2], ['B', 96, 44, 3]])
      .deadBall(91, 40)
      .at(0.7).delivery('h:FK', 'h:LO', { dur: 0.5, loft: 0 })
      .press('a:W1', [93, 36], { at: 1.15, dur: 0.6 })
      .shot('h:LO', { offset: -1 }).done(),
  },
  {
    id: 'throw-attack', group: 'Throw-ins', label: 'Attacking throw-in',
    build: () => play({ title: 'Attacking throw-in', category: 'Throw-ins', kind: 'setpiece', view: 'attacking-third', description: 'A check-and-spin frees space down the line. The throw goes behind the defender for the runner.' })
      .squad('home', [['TH', 84, -0.6, 2], ['W', 89, 8, 7], ['CM', 81, 11, 8], ['ST', 95, 18, 9], ['AM', 86, 18, 10]])
      .squad('away', [['A', 91, 7, 3], ['B', 84, 13, 6], ['C', 97, 16, 5], ['D', 88, 20, 8], ['GK', 103, 34, 1]])
      .deadBall(84, 0)
      .run('h:W', [85, 6], { at: 0.2, dur: 0.6, comment: 'Checks towards the ball' })
      .run('h:W', [97, 3], { at: 0.9, dur: 1.4, bend: 2, comment: 'Spins in behind' })
      .at(1.1).delivery('h:TH', 'h:W', { dur: 1.2, loft: 2 })
      .cross('h:W', 'h:ST').shot('h:ST', { offset: 1 }).done(),
  },
  {
    id: 'throw-retain', group: 'Throw-ins', label: 'Throw-in: keep the ball',
    build: () => play({ title: 'Throw-in: keep the ball', category: 'Throw-ins', kind: 'setpiece', description: 'A short throw to feet with a return to the thrower, then out to the free centre-back.' })
      .squad('home', [['TH', 40, 68.6, 3], ['W', 43, 60, 11], ['CM', 37, 58, 8], ['CB', 24, 52, 5]])
      .squad('away', [['A', 45, 62, 2], ['B', 38, 61, 6], ['C', 46, 54, 8]])
      .deadBall(40, 68)
      .at(0.4).delivery('h:TH', 'h:W', { dur: 0.6, loft: 1 })
      .pass('h:W', 'h:CM', { dur: 0.6 })
      .pass('h:CM', 'h:CB', { dur: 0.9 }).done(),
  },
  {
    id: 'goal-kick', group: 'Restarts', label: 'Goal kick: play short',
    build: () => play({ title: 'Goal kick: play short', category: 'Build-up', kind: 'setpiece', view: 'defensive-third', description: 'Since the ball is in play as soon as it is kicked, a centre-back can receive inside the box and invite the press.' })
      .shape('home', '4-3-3', { squeeze: 0.8 })
      .place('h:LCB', 8, 22).place('h:RCB', 8, 46).place('h:CDM', 19, 34)
      .deadBall(5.5, 34)
      .place('h:GK', 4.5, 33.5)
      .at(0.6).delivery('h:GK', 'h:LCB', { dur: 0.8, loft: 0 })
      .run('h:CDM', [17, 28], { at: 1, dur: 0.9 })
      .pass('h:LCB', 'h:CDM', { dur: 0.7 })
      .pass('h:CDM', 'h:LB', { dur: 0.9 }).done(),
  },
  {
    id: 'kickoff', group: 'Restarts', label: 'Kick-off routine',
    build: () => play({ title: 'Kick-off routine', category: 'Attacking', kind: 'setpiece', description: 'Back to the midfielder, and a long diagonal for the winger running at the full-back.' })
      .shape('home', '4-3-3')
      .shape('away', '4-4-2')
      .place('h:ST', 52.5, 34)
      .deadBall(52.5, 34)
      .run('h:LW', [74, 7], { at: 0.5, dur: 2.8, bend: -2 })
      .at(0.4).delivery('h:ST', 'h:CDM', { dur: 1.1, loft: 0 })
      .switchPlay('h:CDM', 'h:LW', { dur: 2.1 }).done(),
  },
  {
    id: 'penalty', group: 'Restarts', label: 'Penalty kick',
    build: () => play({ title: 'Penalty kick', category: 'Attacking', kind: 'setpiece', view: 'attacking-third', description: 'Everyone else waits outside the penalty area and behind the mark until the ball is kicked, then follows in.' })
      .squad('home', [['PK', 91.5, 34, 9], ['RB', 87, 45, 7], ['LB', 87, 23, 11], ['M', 86.5, 38, 8]])
      .squad('away', [['GK', 105, 34, 1], ['A', 87, 42, 5], ['B', 87, 26, 4], ['C', 86.5, 32, 6]])
      .deadBall(94, 34)
      .run('h:RB', [97, 40], { at: 0.9, dur: 0.9 })
      .run('h:LB', [97, 27], { at: 0.9, dur: 0.9 })
      .at(0.9).ball('shot', 'h:PK', [105, 31], { dur: 0.42 }).done(),
  },
];

export function buildSetPiece(id) {
  return SET_PIECES.find((s) => s.id === id)?.build() ?? null;
}
