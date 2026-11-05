import { play } from './builder.js';

const technical = { view: 'blank', theme: 'technical', kind: 'drill', category: 'Drills' };

export const DRILL_CATALOG = [
  {
    id: 'rondo-5v2', type: 'Rondos', label: 'Rondo 5v2', build: null, example: 'rondo',
  },
  {
    id: 'y-pattern', type: 'Passing drills', label: 'Y passing pattern',
    build: () => play({
      ...technical, title: 'Y passing pattern', tags: ['passing', 'unopposed'],
      description: 'A rehearsed pattern: into the post, set back, then a through ball around the far pole.',
      drill: { objective: 'Weight and timing of pass, and receiving on the back foot.', players: '6 to 10', durationMin: 12, equipment: '4 poles, balls', fieldSize: '30 by 20 m', instructions: 'Each player follows their pass to the next station. Switch to the other side after five minutes.', coachingPoints: 'Check away before you show for the ball.\nPass to the foot further from the pole.\nCall for the through ball early.', progressions: 'Two touches, then one.\nAdd a finish on a small goal.', variations: 'Mirror the pattern on the left.\nThe set becomes a one-two.' },
    })
      .obj('pole', 45, 34).obj('pole', 60, 24).obj('pole', 60, 44).obj('pole', 36, 34)
      .squad('home', [['A', 30, 34, 1], ['B', 48, 34, 2], ['C', 40, 29, 3], ['D', 62, 21, 4]])
      .owner('h:A')
      .run('h:B', [47, 37], { at: 0.1, dur: 0.5 })
      .run('h:B', [44, 33], { at: 0.7, dur: 0.5 })
      .at(0.7).pass('h:A', 'h:B')
      .run('h:C', [40, 34], { at: 1.3, dur: 0.6 })
      .pass('h:B', 'h:C', { dur: 0.5 })
      .run('h:D', [66, 19], { at: 2.3, dur: 1 })
      .through('h:C', 'h:D', { at: 2.5 }).done(),
  },
  {
    id: 'possession-4v4-3', type: 'Possession games', label: '4v4 plus 3 possession',
    build: () => play({
      ...technical, title: '4v4 plus 3 possession', tags: ['possession', 'overload'],
      description: 'Neutrals always play with the team in possession, which makes 7v4 and rewards quick switches when the ball turns over.',
      drill: { objective: 'Keep the ball with the overload, and react quickly when it turns over.', players: '11', durationMin: 18, equipment: '4 cones, bibs in 3 colours, balls', fieldSize: '25 by 30 m', instructions: 'Six passes in a row earns a point. Neutrals play two-touch and cannot score points on their own.', coachingPoints: 'Make the pitch big with the ball, and small without it.\nFind the neutral between the lines.', progressions: 'A point requires a pass through the middle neutral.', variations: 'Add end players on the short sides.' },
    })
      .cones([[38, 19], [68, 19], [38, 49], [68, 49]])
      .squad('home', [['A', 44, 24, 1], ['B', 60, 24, 2], ['C', 62, 44, 3], ['D', 46, 42, 4]])
      .squad('away', [['W', 50, 28, 5], ['X', 58, 30, 6], ['Y', 56, 38, 7], ['Z', 48, 36, 8]])
      .squad('neutral', [['N1', 53, 34, 'N'], ['N2', 37.5, 34, 'N'], ['N3', 68.5, 34, 'N']])
      .owner('h:A')
      .press('a:W', [47, 26], { at: 0.3, dur: 0.8 })
      .at(0.5).pass('h:A', 'n:N2', { dur: 0.8 })
      .pass('n:N2', 'h:D', { dur: 0.7 })
      .press('a:Z', [47, 39], { at: 2, dur: 0.6 })
      .pass('h:D', 'n:N1', { dur: 0.6 })
      .pass('n:N1', 'h:B', { dur: 0.8 })
      .pass('h:B', 'n:N3', { dur: 0.8 }).done(),
  },
  {
    id: 'finishing-layoff', type: 'Finishing exercises', label: 'Lay-off and finish',
    build: () => play({
      title: 'Lay-off and finish', kind: 'drill', category: 'Drills', view: 'attacking-third', tags: ['finishing'],
      description: 'Feed the mannequin-side striker, take the lay-off in stride and shoot from the edge of the box.',
      drill: { objective: 'Finish first time from a lay-off, with the body over the ball.', players: '6 to 12 and a goalkeeper', durationMin: 15, equipment: 'Full goal, 2 mannequins, balls', fieldSize: 'Half pitch', instructions: 'Feeder plays into the striker, who sets for the shooter arriving from deep. Rotate feeder to striker to shooter.', coachingPoints: 'Time the arrival; do not stand and wait.\nStrike low and across the keeper.', progressions: 'Add a defender on the striker’s back.\nThe shooter has two touches.', variations: 'Feed from the wing with a cut-back.' },
    })
      .obj('mannequin', 89, 30).obj('mannequin', 89, 38)
      .squad('home', [['F', 70, 44, 8], ['S', 87, 34, 9], ['A', 72, 28, 10]])
      .squad('away', [['GK', 103.5, 34, 1]])
      .owner('h:F')
      .run('h:A', [84, 33], { at: 0.4, dur: 1.9, bend: 2 })
      .at(0.5).pass('h:F', 'h:S')
      .pass('h:S', 'h:A', { dur: 0.4, touch: 0.05 })
      .shot('h:A', { offset: -2 }).done(),
  },
  {
    id: 'press-1v1-2v2', type: 'Pressing exercises', label: 'Pressing pairs',
    build: () => play({
      ...technical, title: 'Pressing pairs', tags: ['pressing'],
      description: 'Pairs press on a trigger: one closes the ball, the other cuts the pass back to a target.',
      drill: { objective: 'Press together: close down, curve the run and cover the next pass.', players: '8 to 12', durationMin: 15, equipment: '6 cones, 2 small goals', fieldSize: '20 by 25 m', instructions: 'Server plays to the attackers. Defenders score by winning it and finishing on a small goal.', coachingPoints: 'Curve your run to close the passing option.\nSecond presser reads the first.\nSlow down in the last two metres.', progressions: 'Add a third attacker.', variations: 'Attackers must play forward in four seconds.' },
    })
      .cones([[40, 22], [65, 22], [40, 46], [65, 46]])
      .obj('smallgoal', 64.5, 34, { rotation: 0 })
      .obj('smallgoal', 40.5, 34, { rotation: 180 })
      .squad('home', [['A', 44, 30, 7], ['B', 46, 40, 9]])
      .squad('away', [['X', 58, 28, 4], ['Y', 58, 40, 5]])
      .squad('neutral', [['S', 38, 34, 'S']])
      .owner('n:S')
      .at(0.3).pass('n:S', 'h:A', { dur: 0.6 })
      .press('a:X', [48, 29], { at: 0.5, dur: 1, bend: 2 })
      .press('a:Y', [50, 37], { at: 0.6, dur: 1, bend: -1 })
      .at(1.5).pass('h:A', 'h:B', { dur: 0.7 })
      .intercept('a:Y', { at: 1.85, dur: 0.2 })
      .shot('a:Y', { at: 2.3, target: [40.5, 34], dur: 0.7 }).done(),
  },
  {
    id: 'transition-3v2', type: 'Transition drills', label: '3v2 and back',
    build: () => play({
      title: '3v2 and back', kind: 'drill', category: 'Drills', view: 'half', tags: ['transition'],
      description: 'Three attack two. When the attack ends, the defenders break the other way against the recovering attackers.',
      drill: { objective: 'Attack quickly with an overload, then recover when the ball changes hands.', players: '10 to 15 and 2 goalkeepers', durationMin: 18, equipment: '2 full goals, cones, balls', fieldSize: '40 by 44 m', instructions: 'Three attackers go at two defenders. A shot or turnover starts a 2v1 counter the other way.', coachingPoints: 'Fix the defender before you release the pass.\nGet wide; give the carrier a choice.\nAfter a shot, the nearest attacker recovers at once.', progressions: 'Add a recovering defender after 5 seconds.', variations: 'Start from a pass by the goalkeeper.' },
    })
      .squad('home', [['A', 62, 34, 10], ['B', 62, 16, 7], ['C', 62, 52, 11]])
      .squad('away', [['GK', 103, 34, 1], ['X', 80, 28, 4], ['Y', 80, 40, 5]])
      .owner('h:A')
      .dribble('h:A', [76, 34], { at: 0.2, dur: 1.8 })
      .run('h:B', [86, 16], { at: 0.2, dur: 2.5 })
      .run('h:C', [88, 48], { at: 0.2, dur: 3, bend: 2 })
      .defend('a:X', [84, 30], { at: 0.6, dur: 1.4 })
      .defend('a:Y', [84, 38], { at: 0.6, dur: 1.4 })
      .at(2.1).through('h:A', 'h:C')
      .shot('h:C', { offset: -2 }).done(),
  },
  {
    id: 'ssg-5v5', type: 'Small-sided games', label: '5v5 to small goals',
    build: () => play({
      ...technical, preset: '5v5', view: 'full', title: '5v5 to small goals', tags: ['small-sided'], theme: 'forest',
      description: 'A short game with two small goals at each end, which rewards switching the point of attack.',
      drill: { objective: 'Attack and defend in a real game with quick switches of play.', players: '10', durationMin: 20, equipment: '4 small goals, cones, bibs', fieldSize: '37 by 27 m', instructions: 'Play 4 minute games. Goals from a switch count double.', coachingPoints: 'Draw defenders to one side, then switch.\nStay compact when you lose the ball.', progressions: 'Allow scoring only after a third-man pass.', variations: 'Add goalkeepers on one full goal at each end.' },
    })
      .obj('smallgoal', 36.5, 7, { rotation: 0 }).obj('smallgoal', 36.5, 20, { rotation: 0 })
      .obj('smallgoal', 0.5, 7, { rotation: 180 }).obj('smallgoal', 0.5, 20, { rotation: 180 })
      .squad('home', [['A', 8, 13, 1], ['B', 13, 6, 2], ['C', 13, 21, 3], ['D', 20, 8, 4], ['E', 21, 19, 5]])
      .squad('away', [['V', 29, 13, 1], ['W', 25, 6, 2], ['X', 25, 21, 3], ['Y', 19, 13, 4], ['Z', 31, 5, 5]])
      .owner('h:B')
      .press('a:W', [17, 6.5], { at: 0.2, dur: 0.8 })
      .at(0.4).pass('h:B', 'h:A', { dur: 0.5 })
      .pass('h:A', 'h:C', { dur: 0.7 })
      .run('h:E', [28, 20], { at: 1.5, dur: 1.2 })
      .through('h:C', 'h:E', { dur: 1 })
      .shot('h:E', { target: [36.5, 20], dur: 0.4 }).done(),
  },
  {
    id: 'movement-pattern', type: 'Movement patterns', label: 'Up, back, through',
    build: () => play({
      ...technical, title: 'Up, back, through', tags: ['pattern', 'combination'],
      description: 'Rehearses a common attacking combination with no opposition, so timing and spacing can be coached.',
      drill: { objective: 'Timing of the third-man run.', players: '6 to 12', durationMin: 10, equipment: '3 poles, balls', fieldSize: '40 by 20 m', instructions: 'Rotate one station forward after each repetition.', coachingPoints: 'The third man leaves as the set is played.\nPass in front of the runner.', progressions: 'One-touch set.', variations: 'Finish on goal.' },
    })
      .obj('pole', 56, 34).obj('pole', 44, 30).obj('pole', 66, 28)
      .squad('home', [['A', 34, 34, 6], ['B', 58, 34, 9], ['C', 42, 26, 8]])
      .owner('h:A')
      .at(0.4).pass('h:A', 'h:B')
      .run('h:C', [70, 25], { at: 1, dur: 2.4 })
      .pass('h:B', 'h:A', { dur: 0.9 })
      .through('h:A', 'h:C', { dur: 1.6 }).done(),
  },
  {
    id: 'warmup-gates', type: 'Warmups', label: 'Passing through gates',
    build: () => play({
      ...technical, title: 'Passing through gates', tags: ['warm-up'],
      description: 'Pairs pass through as many small gates as they can in a minute, keeping the ball moving and their heads up.',
      drill: { objective: 'Warm up body and first touch, and scan for the next gate.', players: 'Any even number', durationMin: 8, equipment: '12 cones, 1 ball per pair', fieldSize: '25 by 25 m', instructions: 'Each pass must go through a gate. No gate twice in a row.', coachingPoints: 'Scan before the ball arrives.\nKeep on your toes between passes.', progressions: 'Weak foot only.', variations: 'Dribble through, then pass to your partner.' },
    })
      .cones([[42, 24], [42, 27], [55, 22], [58, 22], [64, 34], [64, 37], [48, 42], [51, 42], [40, 36], [40, 39]])
      .squad('home', [['A', 46, 30, 1], ['B', 38, 26, 2]])
      .owner('h:A')
      .at(0.3).pass('h:A', 'h:B', { dur: 0.6 })
      .run('h:A', [52, 19], { at: 0.6, dur: 1.2 })
      .run('h:B', [41, 32], { at: 1, dur: 0.8 })
      .pass('h:B', 'h:A', { at: 1.2, dur: 0.9 }).done(),
  },
  {
    id: 'technical-slalom', type: 'Technical circuits', label: 'Slalom and finish',
    build: () => play({
      title: 'Slalom and finish', kind: 'drill', category: 'Drills', view: 'attacking-third', tags: ['dribbling', 'circuit'],
      description: 'Dribble through the poles, then finish past the goalkeeper.',
      drill: { objective: 'Close control at speed and a finish in stride.', players: '6 to 12 and a goalkeeper', durationMin: 10, equipment: '5 poles, balls, full goal', fieldSize: '35 by 20 m', instructions: 'Both feet through the poles, then shoot before the edge of the six-yard box.', coachingPoints: 'Small touches through the poles.\nA bigger touch out, then head up to pick a corner.', progressions: 'Race a partner on a mirrored course.', variations: 'Finish with the weaker foot.' },
    })
      .obj('pole', 74, 34).obj('pole', 78, 31).obj('pole', 82, 35).obj('pole', 86, 32)
      .squad('home', [['A', 70, 33, 7]])
      .squad('away', [['GK', 103.5, 34, 1]])
      .owner('h:A')
      .dribble('h:A', [89, 34], { at: 0.3, dur: 2.6, bend: 3 })
      .shot('h:A', { offset: 2 }).done(),
  },
];
