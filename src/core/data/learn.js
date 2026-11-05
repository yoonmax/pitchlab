import { play } from './builder.js';

const lesson = (id, title, category, explain, points, build) => ({ id, title, category, explain, points, build });
const base = (title, category, description) => ({ title, category, description, tags: ['lesson'] });

/**
 * Lessons explain ideas used widely in coaching. Each animated example is one way
 * to show the idea, not a claim about the best way to play.
 */
export const LESSONS = [
  lesson('positional-play', 'Positional play', 'Attacking',
    'Players take up spaces that give the ball carrier options at different heights and widths, so the ball can move faster than defenders can shift.',
    ['Occupy each lane, and avoid standing in the same vertical line as the next player.', 'Move the ball to attract pressure, then play to whoever it left free.', 'Rotate positions, but keep the structure occupied.'],
    () => play(base('Positional play', 'Attacking', 'The team spreads across lanes and moves the ball to the free player.'))
      .shape('home', '4-3-3', { adv: 22 }).shape('away', '4-4-2', { adv: 6, squeeze: 0.85 })
      .owner('h:LCB')
      .at(0.3).pass('h:LCB', 'h:CDM')
      .run('h:RCM', [66, 44], { at: 0.8, dur: 1 })
      .pass('h:CDM', 'h:RCM')
      .run('h:RW', [78, 62], { at: 1.8, dur: 1 })
      .pass('h:RCM', 'h:RW').done()),
  lesson('overloads', 'Overloads', 'Attacking',
    'An overload puts more attackers than defenders in one zone. The extra player either receives free or forces another defender across, leaving space elsewhere.',
    ['Move quickly: an overload lasts until the defence shifts.', 'Fix the nearest defender before you release the pass.', 'Know where the switch will go when the defence slides over.'],
    () => play(base('Overloads', 'Attacking', 'Three attackers against two on one side.'))
      .shape('home', '4-3-3', { adv: 28 }).shape('away', '4-4-2', { adv: 4, squeeze: 0.8 })
      .place('h:LB', 62, 8).place('h:LCM', 68, 22).place('h:LW', 78, 10).place('a:RB', 84, 14).place('a:RM', 72, 12)
      .owner('h:LCM')
      .dribble('h:LCM', [73, 19], { at: 0.3, dur: 1 })
      .run('h:LB', [84, 4], { at: 0.3, dur: 2, bend: -1 })
      .defend('a:RM', [76, 16], { at: 0.5, dur: 0.8 })
      .pass('h:LCM', 'h:LW', { at: 1.4, dur: 0.5 })
      .pass('h:LW', 'h:LB').done()),
  lesson('third-man', 'Third-man runs', 'Attacking',
    'The player who will receive the final pass runs while two team-mates combine. Defenders watching the ball struggle to track a run they are not connected to.',
    ['The runner leaves as the first pass is played.', 'The set pass needs to be easy to play forward first time.', 'Pass ahead of the runner, into their stride.'],
    () => play(base('Third-man runs', 'Attacking', 'A plays to B, B sets to C, C finds A running.'))
      .shape('home', '4-3-3', { adv: 24 }).shape('away', '4-4-2', { adv: 2, squeeze: 0.8 })
      .owner('h:RCM')
      .at(0.3).pass('h:RCM', 'h:ST')
      .run('h:RCM', [82, 40], { at: 0.9, dur: 2, bend: -2 })
      .pass('h:ST', 'h:CDM')
      .through('h:CDM', 'h:RCM').done()),
  lesson('overlap', 'Overlapping runs', 'Attacking',
    'A team-mate runs around the outside of the ball carrier. The defender must choose between the carrier and the runner, which gives the carrier time.',
    ['Run with the timing to arrive past the ball, not level with it.', 'The carrier fixes the defender first, by driving at them or slowing them.', 'A cross or a cut inside are both on, so read the defender.'],
    () => play(base('Overlapping runs', 'Attacking', 'The full-back goes around the outside of the winger.'))
      .shape('home', '4-3-3', { adv: 30 }).shape('away', '4-4-2', { adv: 4, squeeze: 0.8 })
      .place('h:RW', 76, 56).place('h:RB', 60, 60).place('a:LB', 86, 54)
      .owner('h:RW')
      .overlap('h:RB', [90, 63], { at: 0.2, dur: 2.3, bend: 3 })
      .at(1.6).through('h:RW', 'h:RB').done()),
  lesson('underlap', 'Underlapping runs', 'Attacking',
    'The runner goes inside the ball carrier, between full-back and centre-back. It attacks the channel, not the touchline, and lands closer to goal.',
    ['Aim at the gap between the full-back and centre-back.', 'The carrier holds width to keep the gap open.', 'Arrive in the box ready to cut back or finish.'],
    () => play(base('Underlapping runs', 'Attacking', 'The midfielder runs inside the winger.'))
      .shape('home', '4-3-3', { adv: 30 }).shape('away', '4-4-2', { adv: 4, squeeze: 0.8 })
      .place('h:RW', 76, 60).place('h:RCM', 68, 46).place('a:LB', 86, 58)
      .owner('h:RW')
      .underlap('h:RCM', [92, 50], { at: 0.2, dur: 2.5, bend: -2 })
      .at(1.5).through('h:RW', 'h:RCM').done()),
  lesson('counterpress', 'Counterpressing', 'Pressing',
    'Pressing immediately after losing the ball. The players nearby are already close to it, and the opponent has only just won it and may not be set.',
    ['The nearest player goes straight away; others close passing lanes.', 'Commit for a few seconds, then drop if it fails.', 'Rest defenders behind the ball guard the counter while the team attacks.'],
    () => play(base('Counterpressing', 'Pressing', 'The ball is lost, and three players close it down straight away.'))
      .shape('home', '4-3-3', { adv: 30 }).shape('away', '4-4-2', { adv: 4, squeeze: 0.8 })
      .place('a:LCM', 74, 40)
      .owner('a:LCM')
      .press('h:RCM', [76, 42], { at: 0.2, dur: 0.8 })
      .press('h:RW', [80, 44], { at: 0.2, dur: 0.9, bend: 2 })
      .press('h:ST', [78, 36], { at: 0.3, dur: 0.9, bend: -2 })
      .tackle('h:RCM', [75, 41], { at: 1.1, dur: 0.5 }).done()),
  lesson('high-press', 'High pressing', 'Pressing',
    'Defending far up the pitch to force mistakes near the opposition goal. It relies on the back line stepping up, because the distance between units must stay short.',
    ['Agree a trigger, such as a pass to a full-back or a poor touch.', 'Curve runs to cut off the pass back.', 'The back line steps up so there is no space between the lines.'],
    () => play(base('High pressing', 'Pressing', 'The pass to the full-back triggers the press.'))
      .shape('away', '4-3-3').shape('home', '4-4-2', { adv: 28, squeeze: 0.9 })
      .owner('a:RCB')
      .at(0.4).pass('a:RCB', 'a:RB')
      .press('h:LM', [85, 13], { at: 0.5, dur: 1.2, bend: -3 })
      .press('h:LS', [86, 32], { at: 0.6, dur: 1.2, bend: 2 })
      .press('h:LB', [72, 9], { at: 0.9, dur: 1.2 }).done()),
  lesson('mid-block', 'Mid-block defending', 'Defensive',
    'The team defends around the middle third. It gives the opponent the deep ball, protects central space and aims to win the ball when a pass comes through or to the side.',
    ['Keep the team short: about 30 m from front to back is a common aim.', 'Block central passes first, so the opponent goes around.', 'Slide across as a unit when the ball goes wide.'],
    () => play(base('Mid-block defending', 'Defensive', 'A compact 4-4-2 slides as the ball goes wide.'))
      .shape('away', '4-3-3', { adv: 16 }).shape('home', '4-4-2', { adv: 18, squeeze: 0.75 })
      .owner('a:LCB')
      .at(0.4).pass('a:LCB', 'a:LB')
      .defend('h:RM', [56, 56], { at: 0.6, dur: 1 }).defend('h:RCM', [50, 46], { at: 0.6, dur: 1 })
      .defend('h:LCM', [50, 33], { at: 0.6, dur: 1 }).defend('h:LM', [55, 21], { at: 0.6, dur: 1 }).done()),
  lesson('low-block', 'Low-block defending', 'Defensive',
    'The team drops deep near its own box and protects the space behind. It accepts having less of the ball, in return for very little space to play into.',
    ['Two tight lines, with narrow gaps between the players.', 'Stay patient; step out only to a clear trigger.', 'Plan how to get out: have a target for the first ball forward.'],
    () => play(base('Low-block defending', 'Defensive', 'A 5-4-1 protects its box as the ball moves around it.'))
      .shape('away', '4-3-3', { adv: 34 }).shape('home', '5-4-1', { adv: -2, squeeze: 0.7 })
      .owner('a:CDM')
      .at(0.4).pass('a:CDM', 'a:RCM')
      .defend('h:LM', [25, 54], { at: 0.6, dur: 1 }).defend('h:LCM', [23, 42], { at: 0.6, dur: 1 }).done()),
  lesson('build-up', 'Build-up structures', 'Build-up',
    'How a team arranges itself to move the ball out from the back. Common aims are one more player than the first line of pressure and a clear way past it.',
    ['Count the press: aim for one extra player at the back.', 'A midfielder dropping can turn two centre-backs into a back three.', 'Use the goalkeeper as an extra passer when the press comes.'],
    () => play(base('Build-up structures', 'Build-up', 'A midfielder drops between the centre-backs to make a back three.'))
      .shape('home', '4-3-3').shape('away', '4-4-2', { adv: 16 })
      .owner('h:GK')
      .run('h:CDM', [15, 33], { at: 0.2, dur: 1.2 })
      .run('h:LCB', [13, 15], { at: 0.3, dur: 1.1 }).run('h:RCB', [13, 52], { at: 0.3, dur: 1.1 })
      .run('h:LB', [34, 8], { at: 0.5, dur: 1.5 }).run('h:RB', [34, 60], { at: 0.5, dur: 1.5 })
      .at(1.4).pass('h:GK', 'h:CDM')
      .pass('h:CDM', 'h:RCB').pass('h:RCB', 'h:RB').done()),
  lesson('def-transition', 'Defensive transitions', 'Transition',
    'What happens in the seconds after losing the ball. The team decides at once whether to press or to drop, and those decisions need to be shared.',
    ['Decide together: press the ball or drop behind it.', 'Delay the carrier so team-mates have time to recover.', 'Sprint back on a line towards your own goal, not the ball.'],
    () => play(base('Defensive transitions', 'Transition', 'The ball is lost and the team runs back behind it.'))
      .shape('home', '4-3-3', { adv: 22 }).shape('away', '4-4-2', { adv: 4, squeeze: 0.8 })
      .place('a:LCM', 62, 40)
      .owner('a:LCM')
      .dribble('a:LCM', [48, 40], { at: 0.2, dur: 2 })
      .defend('h:CDM', [38, 38], { at: 0.2, dur: 1.4 })
      .defend('h:RCM', [40, 48], { at: 0.3, dur: 1.9, bend: 2 })
      .defend('h:LCM', [42, 28], { at: 0.3, dur: 1.9, bend: -2 })
      .defend('h:LCB', [30, 28], { at: 0.2, dur: 1.2 }).defend('h:RCB', [30, 42], { at: 0.2, dur: 1.2 }).done()),
  lesson('att-transition', 'Attacking transitions', 'Transition',
    'The seconds after winning the ball, when the opponent is out of shape. A first pass forward can catch them before they recover.',
    ['Look forward first; if that is covered, keep it and reset.', 'Forwards run away from the ball to stretch the recovering defence.', 'Carry when there is space, and pass when a defender commits.'],
    () => play(base('Attacking transitions', 'Transition', 'A won ball goes forward with the first pass.'))
      .shape('home', '4-4-2', { adv: 6, squeeze: 0.9 }).shape('away', '4-3-3', { adv: 22, squeeze: 0.95 })
      .place('a:LCM', 44, 42)
      .owner('a:LCM')
      .tackle('h:RCM', [43, 42], { at: 0.3, dur: 0.6 })
      .run('h:RS', [74, 30], { at: 0.9, dur: 2.2, bend: 2 })
      .at(1.1).through('h:RCM', 'h:RS').done()),
  lesson('half-space', 'Half-space occupation', 'Attacking',
    'The half-spaces are the vertical channels between the centre and the wings. A player here can see both the goal and the wide player, and is awkward for defenders to pick up.',
    ['Receive half-turned so you can see goal and wing.', 'Stand between lines, in the gap between full-back and centre-back.', 'A pass from the half-space can go inside, around or behind.'],
    () => { const b = play(base('Half-space occupation', 'Attacking', 'A midfielder receives in the right half-space.'))
      .shape('home', '4-3-3', { adv: 24 }).shape('away', '4-4-2', { adv: 4, squeeze: 0.8 })
      .owner('h:CDM');
      b.doc.pitch.overlays.halfSpaces = true;
      return b.run('h:RCM', [72, 46], { at: 0.2, dur: 1.2, bend: 2 })
        .at(0.7).pass('h:CDM', 'h:RCM')
        .run('h:RW', [92, 60], { at: 1.8, dur: 1.2 })
        .through('h:RCM', 'h:RW').done(); }),
  lesson('triangles', 'Creating passing triangles', 'Build-up',
    'Three players at different angles give the ball carrier two passes and leave no one in a straight line with a defender between them.',
    ['Move as soon as you pass, so the triangle reforms.', 'Avoid flat lines: stay at different heights.', 'The third player gives the wall pass a way out.'],
    () => play(base('Creating passing triangles', 'Build-up', 'Three players keep two options open as the ball moves.'))
      .shape('home', '4-3-3', { adv: 14 }).shape('away', '4-4-2', { adv: 10, squeeze: 0.85 })
      .owner('h:LB')
      .at(0.3).pass('h:LB', 'h:LCM')
      .run('h:LB', [47, 8], { at: 0.9, dur: 1.4 })
      .run('h:LW', [66, 16], { at: 0.9, dur: 1.3 })
      .pass('h:LCM', 'h:LW')
      .pass('h:LW', 'h:LB').done()),
  lesson('switching', 'Switching play', 'Attacking',
    'Moving the ball quickly from one side of the pitch to the other. The defence has shifted towards the ball, so the far side often has more space.',
    ['Draw the defence over first with short passes.', 'Switch in one or two passes, not five.', 'The far winger stays wide and arrives as the ball does.'],
    () => play(base('Switching play', 'Attacking', 'A long diagonal to the far winger.'))
      .shape('home', '4-3-3', { adv: 24 }).shape('away', '4-4-2', { adv: 4, squeeze: 0.8, width: 0.8 })
      .place('h:RW', 80, 60)
      .owner('h:LCM')
      .run('h:RW', [86, 62], { at: 0.5, dur: 1.5 })
      .at(0.4).switchPlay('h:LCM', 'h:RW', { dur: 2 }).done()),
];

export function getLesson(id) {
  return LESSONS.find((l) => l.id === id) ?? null;
}
