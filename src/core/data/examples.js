import { play } from './builder.js';

/** Every example is a real editable document, built on demand. */
export const EXAMPLES = [
  {
    id: 'build-up-433',
    build: () => play({
      title: '4-3-3 build-up', category: 'Build-up', example: 'build-up-433', tags: ['goal kick', 'split centre-backs'],
      description: 'The centre-backs split, the holding midfielder drops to show, and the ball works out to the right against a high 4-4-2.',
    })
      .shape('home', '4-3-3')
      .shape('away', '4-4-2', { adv: 14 })
      .owner('h:GK')
      .run('h:LCB', [11, 20], { at: 0.2, dur: 1 })
      .run('h:RCB', [11, 48], { at: 0.2, dur: 1 })
      .run('h:LB', [31, 6], { at: 0.5, dur: 1.5 })
      .run('h:RB', [31, 62], { at: 0.5, dur: 1.5 })
      .run('h:CDM', [20, 33], { at: 0.6, dur: 1.1 })
      .at(1.3).pass('h:GK', 'h:LCB')
      .press('a:RS', [17, 22], { at: 1.7, dur: 1.2, bend: -3 })
      .pass('h:LCB', 'h:CDM')
      .run('h:RCM', [32, 46], { at: 2.8, dur: 1 })
      .pass('h:CDM', 'h:RCM')
      .run('h:RW', [47, 62], { at: 3.8, dur: 1 })
      .pass('h:RCM', 'h:RB')
      .pass('h:RB', 'h:RW')
      .done(),
  },
  {
    id: 'third-man',
    build: () => play({
      title: 'Third-man combination', category: 'Attacking', example: 'third-man', tags: ['combination', 'final third'],
      description: 'The striker comes short and sets the ball back. The next pass finds a runner who was never marked by the first defender.',
    })
      .shape('home', '4-3-3', { adv: 26 })
      .shape('away', '4-4-2', { adv: 2, squeeze: 0.8 })
      .owner('h:RCM')
      .run('h:ST', [66, 33], { at: 0.1, dur: 1, comment: 'Checks short to pull a centre-back out' })
      .at(0.9).pass('h:RCM', 'h:ST')
      .pass('h:ST', 'h:CDM', { comment: 'Sets it first time' })
      .run('h:LCM', [86, 26], { at: 1.5, dur: 1.9, bend: 3, comment: 'Third man goes beyond' })
      .through('h:CDM', 'h:LCM', { comment: 'Plays the runner in' })
      .shot('h:LCM', { offset: 2 })
      .done(),
  },
  {
    id: 'winger-overlap',
    build: () => play({
      title: 'Winger overlap', category: 'Attacking', example: 'winger-overlap', tags: ['wide', 'cross'],
      description: 'The winger holds the ball and draws the full-back. The full-back goes around the outside, gets to the byline and crosses for the striker.',
    })
      .shape('home', '4-3-3', { adv: 30 })
      .shape('away', '4-4-2', { adv: 4, squeeze: 0.8 })
      .place('h:RW', 78, 55)
      .place('h:RB', 60, 60)
      .place('a:LB', 88, 53)
      .owner('h:RW')
      .overlap('h:RB', [93, 63], { at: 0.2, dur: 2.5, bend: 3 })
      .dribble('h:RW', [81, 51], { at: 0.3, dur: 1.2, comment: 'Carries inside to fix the full-back' })
      .run('h:ST', [97, 36], { at: 1.6, dur: 2.3, bend: -2 })
      .at(1.7).through('h:RW', 'h:RB')
      .cross('h:RB', 'h:ST', { at: 3 })
      .shot('h:ST', { offset: -1.5, touch: 0 })
      .done(),
  },
  {
    id: 'high-press',
    build: () => play({
      title: 'High press', category: 'Pressing', example: 'high-press', tags: ['trigger', 'regain'],
      description: 'The first pass to the full-back is the trigger. Curved runs cut off the way back and the midfield steps up to win the next ball.',
    })
      .shape('away', '4-3-3')
      .shape('home', '4-4-2', { adv: 28, squeeze: 0.9 })
      .owner('a:RCB')
      .at(0.5).pass('a:RCB', 'a:RB', { comment: 'The pass that triggers the press' })
      .press('h:LS', [86, 33], { at: 0.7, dur: 1.2, bend: 2 })
      .press('h:LM', [85, 13], { at: 0.6, dur: 1.2, bend: -3 })
      .press('h:LB', [72, 9], { at: 0.9, dur: 1.2 })
      .press('h:LCM', [72, 22], { at: 1, dur: 1 })
      .press('h:RCM', [73, 35], { at: 1.1, dur: 1 })
      .at(2).pass('a:RB', 'a:RCM', { dur: 0.9 })
      .intercept('h:LCM', { at: 2.45, dur: 0.25 })
      .run('h:RS', [92, 30], { at: 2.6, dur: 1.2, bend: 2 })
      .at(3).through('h:LCM', 'h:RS')
      .shot('h:RS', { offset: 2 })
      .done(),
  },
  {
    id: 'counterattack',
    build: () => play({
      title: 'Counterattack', category: 'Transition', example: 'counterattack', tags: ['transition', 'switch'],
      description: 'A mid-block wins the ball and looks forward straight away. A long diagonal finds the far winger, who carries and squares it for the late runner.',
    })
      .shape('home', '4-4-2', { adv: 6, squeeze: 0.9 })
      .shape('away', '4-3-3', { adv: 22, squeeze: 0.95 })
      .place('a:LCM', 44, 44)
      .place('a:ST', 38, 36)
      .owner('a:LCM')
      .at(0.4).pass('a:LCM', 'a:ST', { dur: 0.9 })
      .intercept('h:RCM', { at: 0.75, dur: 0.25 })
      .run('h:LM', [78, 10], { at: 1.1, dur: 2.6, bend: -3 })
      .run('h:LS', [88, 30], { at: 1.2, dur: 3.2, bend: 3 })
      .run('h:RS', [92, 40], { at: 1.3, dur: 3.8, bend: 2 })
      .at(1.3).switchPlay('h:RCM', 'h:LM', { dur: 2.4 })
      .dribble('h:LM', [90, 17], { dur: 1.6 })
      .cross('h:LM', 'h:RS', { loft: 2 })
      .shot('h:RS', { offset: -2 })
      .done(),
  },
  {
    id: 'corner-routine',
    build: () => play({
      title: 'Corner kick routine', category: 'Corners', kind: 'setpiece', example: 'corner-routine', view: 'attacking-third', tags: ['near-post flick', 'in-swinger'],
      description: 'Runners start in a stack, split on the signal, and the near-post flick lands on the back-post runner.',
    })
      .squad('home', [['CK', 104.4, 0.8, 8], ['ST', 89, 28.5, 9], ['CB', 88.5, 39.5, 4], ['LCB', 85, 34, 5], ['RW', 91, 33.5, 7], ['LW', 84, 22, 11], ['CDM', 76, 34, 6], ['RB', 66, 46, 2], ['LB', 70, 20, 3], ['CAM', 94, 6, 10]])
      .squad('away', [['GK', 103, 34, 1], ['A', 99.5, 28.5, 2], ['B', 99.5, 33.5, 5], ['C', 99.5, 38.5, 4], ['D', 96, 26, 6], ['E', 96, 32, 8], ['F', 96, 38, 3], ['G', 98, 22, 7], ['H', 90, 24, 11], ['I', 80, 30, 10], ['J', 72, 44, 9]])
      .deadBall(104.4, 0.8)
      .run('h:ST', [100, 28], { at: 0.7, dur: 1.2, bend: -1.5, comment: 'Near-post attacker' })
      .run('h:CB', [100.5, 41], { at: 0.6, dur: 1.5, bend: 2, comment: 'Back-post attacker' })
      .run('h:LCB', [94, 33], { at: 0.8, dur: 1.1, comment: 'Penalty-spot runner' })
      .run('h:RW', [97, 24], { at: 0.8, dur: 1, comment: 'Screens the zonal defender' })
      .run('h:CDM', [84, 36], { at: 0.9, dur: 1 })
      .at(1).delivery('h:CK', 'h:ST', { dur: 0.95, c: [100, 8] })
      .pass('h:ST', 'h:CB', { dur: 0.35, touch: 0.05, comment: 'Near-post flick' })
      .shot('h:CB', { offset: -2 })
      .done(),
  },
  {
    id: 'rondo',
    build: () => play({
      title: 'Rondo passing drill', category: 'Drills', kind: 'drill', example: 'rondo', tags: ['rondo', 'possession', '5v2'], view: 'blank', theme: 'technical',
      description: 'Five keep the ball from two inside a 12 metre square. Lose it and you swap with the defender.',
      drill: {
        objective: 'Keep possession under pressure: body shape, angles and quick decisions.',
        players: '7 (5 on the outside, 2 inside)', durationMin: 12, equipment: '4 cones, 1 ball, bibs',
        fieldSize: '12 by 12 m',
        instructions: 'Outside players stay on the lines. Defenders swap in when they win the ball or force it out of the square. Limit touches to two.',
        coachingPoints: 'Open the body before the ball arrives.\nOffer two passing options at all times.\nThe first defender closes; the second cuts the lane behind.',
        progressions: 'One touch only.\nA split pass between defenders counts as a point.',
        variations: 'Play 4v2 in a smaller square.\nPlay 6v3 with a neutral in the middle.',
      },
    })
      .cones([[46.5, 28], [58.5, 28], [46.5, 40], [58.5, 40]])
      .squad('home', [['A', 52.5, 27.5, 1], ['B', 59, 32, 2], ['C', 59, 38, 3], ['D', 50, 40.5, 4], ['E', 46, 34, 5]])
      .squad('away', [['X', 51, 34, 6], ['Y', 55, 35, 7]])
      .owner('h:E')
      .press('a:X', [48.5, 33.5], { at: 0.2, dur: 0.8 })
      .at(0.5).pass('h:E', 'h:A', { dur: 0.6 })
      .press('a:X', [50.5, 30], { at: 1.15, dur: 0.6 })
      .press('a:Y', [55, 31], { at: 1.1, dur: 0.6 })
      .pass('h:A', 'h:C', { dur: 0.6, comment: 'Split pass between the two defenders' })
      .press('a:Y', [56.5, 36], { at: 2.1, dur: 0.6 })
      .press('a:X', [53, 35], { at: 2.1, dur: 0.7 })
      .pass('h:C', 'h:B', { dur: 0.45 })
      .pass('h:B', 'h:D', { dur: 0.7 })
      .press('a:X', [51, 38], { at: 3.6, dur: 0.5 })
      .pass('h:D', 'h:E', { dur: 0.55 })
      .done(),
  },
];

const cache = new Map();

export function buildExample(id) {
  const entry = EXAMPLES.find((e) => e.id === id);
  if (!entry) return null;
  return entry.build();
}

/** Built once per session for thumbnails. Opening one always builds a fresh copy. */
export function exampleDocs() {
  return EXAMPLES.map((e) => {
    if (!cache.has(e.id)) cache.set(e.id, e.build());
    return cache.get(e.id);
  });
}
