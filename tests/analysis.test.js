import { describe, expect, it } from 'vitest';
import { addEvent, addPlayer, createDocument } from '../src/core/document.js';
import { ballHeatmap, convexHull, distanceBetween, distanceToSegment, heatmapFromData, heatmapFromTimeline, lineGroups, meanNearestDistance, offsideAnalysis, passesFromTimeline, passingLanes, passingNetwork, passingNetworkFromData, polygonArea, teamShape, zoneControl } from '../src/core/tactics/analysis.js';
import { importMatchData, parseCSV, SAMPLE_MATCH_CSV } from '../src/core/storage/matchData.js';

describe('geometry', () => {
  it('finds a convex hull and leaves out interior points', () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }, { x: 5, y: 0 }]);
    expect(hull).toHaveLength(4);
    expect(polygonArea(hull)).toBe(100);
  });

  it('handles few points', () => {
    expect(convexHull([{ x: 1, y: 1 }])).toHaveLength(1);
    expect(polygonArea([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBe(0);
  });

  it('measures distance to a segment, clamped to its ends', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 2, y: 2 }, a, a)).toBeCloseTo(Math.SQRT2 * 2);
  });

  it('groups players into lines at the biggest gaps', () => {
    const lines = lineGroups([{ x: 10, y: 0 }, { x: 11, y: 5 }, { x: 30, y: 0 }, { x: 31, y: 5 }, { x: 50, y: 0 }]);
    expect(lines.map((l) => l.count)).toEqual([2, 2, 1]);
    expect(lines[0].x).toBeCloseTo(10.5);
  });

  it('averages nearest-neighbour distances', () => {
    expect(meanNearestDistance([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
  });
});

function scene() {
  const doc = createDocument();
  const gk = addPlayer(doc, { team: 'home', number: 1, gk: true, x: 2, y: 34 });
  const a = addPlayer(doc, { team: 'home', number: 6, x: 30, y: 20 });
  const b = addPlayer(doc, { team: 'home', number: 7, x: 40, y: 50 });
  const c = addPlayer(doc, { team: 'home', number: 9, x: 60, y: 30 });
  const d1 = addPlayer(doc, { team: 'away', number: 4, x: 70, y: 30 });
  const d2 = addPlayer(doc, { team: 'away', number: 5, x: 50, y: 40 });
  const g2 = addPlayer(doc, { team: 'away', number: 1, gk: true, x: 103, y: 34 });
  return { doc, gk, a, b, c, d1, d2, g2 };
}

describe('team shape', () => {
  it('measures outfield width, depth and centre, leaving out the goalkeeper', () => {
    const { doc } = scene();
    const s = teamShape(doc, 'home', 0);
    expect(s.count).toBe(3);
    expect(s.width).toBe(30);
    expect(s.depth).toBe(30);
    expect(s.centroid.x).toBeCloseTo(130 / 3);
    expect(s.area).toBeCloseTo(polygonArea(s.hull));
  });

  it('follows the timeline', () => {
    const { doc, a } = scene();
    addEvent(doc, { type: 'run', actor: a, t: 0, duration: 1, to: { x: 30, y: 0 } });
    expect(teamShape(doc, 'home', 0).width).toBe(30);
    expect(teamShape(doc, 'home', 2).width).toBe(50);
    expect(distanceBetween(doc, a, a, 0)).toBe(0);
  });

  it('returns nothing for an empty team', () => {
    expect(teamShape(createDocument(), 'home', 0)).toBe(null);
  });
});

describe('passing network', () => {
  it('counts only completed passes, with direction', () => {
    const { doc, a, b, c, d1 } = scene();
    doc.ball.owner = a;
    addEvent(doc, { type: 'pass', actor: a, t: 0, duration: 1, receiver: b, to: null });
    addEvent(doc, { type: 'pass', actor: b, t: 2, duration: 1, receiver: a, to: null });
    addEvent(doc, { type: 'pass', actor: a, t: 4, duration: 1, receiver: b, to: null });
    addEvent(doc, { type: 'pass', actor: b, t: 6, duration: 1, receiver: c, to: null });
    addEvent(doc, { type: 'pass', actor: c, t: 7.5, duration: 2, receiver: a, to: null });
    addEvent(doc, { type: 'interception', actor: d1, t: 8.5, duration: 0.2 });
    addEvent(doc, { type: 'pass', actor: a, t: 12, duration: 1, receiver: b, to: null });
    const net = passingNetwork(doc, 'home');
    const edge = (f, t) => net.edges.find((e) => e.from === f && e.to === t)?.count ?? 0;
    expect(edge(a, b)).toBe(2);
    expect(edge(b, a)).toBe(1);
    expect(edge(b, c)).toBe(1);
    expect(edge(c, a)).toBe(0);
    expect(net.total).toBe(4);
    expect(net.nodes[a].sent).toBe(2);
    expect(net.nodes[b].received).toBe(2);
  });

  it('respects the time range', () => {
    const { doc, a, b } = scene();
    doc.ball.owner = a;
    addEvent(doc, { type: 'pass', actor: a, t: 0, duration: 1, receiver: b, to: null });
    addEvent(doc, { type: 'pass', actor: b, t: 5, duration: 1, receiver: a, to: null });
    expect(passesFromTimeline(doc, 0, 2)).toHaveLength(1);
    expect(passingNetwork(doc, 'home', 3, 10).total).toBe(1);
  });

  it('is empty with no passes, rather than inventing any', () => {
    const { doc } = scene();
    expect(passingNetwork(doc, 'home').edges).toEqual([]);
  });
});

describe('heatmaps and zones', () => {
  it('is hottest where a player actually stood', () => {
    const { doc, a } = scene();
    const grid = heatmapFromTimeline(doc, [a], 0, 0);
    let bestI = 0;
    grid.values.forEach((v, i) => { if (v > grid.values[bestI]) bestI = i; });
    const x = (bestI % grid.nx + 0.5) * grid.cell;
    const y = (Math.floor(bestI / grid.nx) + 0.5) * grid.cell;
    expect(Math.hypot(x - 30, y - 20)).toBeLessThan(grid.cell * 1.5);
  });

  it('has no heat with no data', () => {
    expect(heatmapFromData(createDocument().pitch, []).max).toBe(0);
    expect(heatmapFromTimeline(createDocument(), []).max).toBe(0);
  });

  it('tracks the ball', () => {
    const { doc, a, b } = scene();
    doc.ball.owner = a;
    addEvent(doc, { type: 'pass', actor: a, t: 0, duration: 1, receiver: b, to: null });
    expect(ballHeatmap(doc).max).toBeGreaterThan(0);
  });

  it('gives space to the nearest player, with shares that add up', () => {
    const doc = createDocument();
    addPlayer(doc, { team: 'home', x: 20, y: 34 });
    addPlayer(doc, { team: 'away', x: 85, y: 34 });
    const z = zoneControl(doc, 0);
    expect(z.homeShare + z.awayShare).toBeCloseTo(1, 1);
    expect(z.homeShare).toBeCloseTo(0.5, 1);
    expect(z.cells[Math.floor(z.ny / 2) * z.nx]).toBe(1);
  });
});

describe('passing lanes', () => {
  it('closes a lane when an opponent stands in it', () => {
    const doc = createDocument();
    const a = addPlayer(doc, { team: 'home', x: 10, y: 10 });
    const open = addPlayer(doc, { team: 'home', x: 10, y: 40 });
    const blocked = addPlayer(doc, { team: 'home', x: 40, y: 10 });
    const def = addPlayer(doc, { team: 'away', x: 25, y: 10.5 });
    doc.ball.owner = a;
    const lanes = passingLanes(doc, 0);
    expect(lanes.lanes.find((l) => l.to === open).open).toBe(true);
    const b = lanes.lanes.find((l) => l.to === blocked);
    expect(b.open).toBe(false);
    expect(b.blockedBy).toEqual([def]);
  });

  it('returns nothing when no one has the ball', () => {
    const { doc } = scene();
    expect(passingLanes(doc, 0)).toBe(null);
  });
});

describe('offside position', () => {
  function offsideScene({ attacker, ball = 40 }) {
    const doc = createDocument();
    addPlayer(doc, { team: 'home', number: 9, x: attacker, y: 34 });
    addPlayer(doc, { team: 'away', number: 1, gk: true, x: 104, y: 34 });
    addPlayer(doc, { team: 'away', number: 4, x: 80, y: 30 });
    addPlayer(doc, { team: 'away', number: 5, x: 70, y: 40 });
    doc.ball = { x: ball, y: 34, owner: null, dead: false };
    return doc;
  }

  it('flags an attacker beyond the second-last opponent and the ball', () => {
    const r = offsideAnalysis(offsideScene({ attacker: 85 }), 'home', 0);
    expect(r.flagged.map((p) => p.number)).toEqual([9]);
    expect(r.lineX).toBe(80);
    expect(r.limitedBy).toBe('second-last');
  });

  it('treats level with the second-last opponent as onside', () => {
    expect(offsideAnalysis(offsideScene({ attacker: 80 }), 'home', 0).flagged).toEqual([]);
  });

  it('is onside behind the ball', () => {
    const r = offsideAnalysis(offsideScene({ attacker: 90, ball: 95 }), 'home', 0);
    expect(r.flagged).toEqual([]);
    expect(r.limitedBy).toBe('ball');
    expect(r.lineX).toBe(95);
  });

  it('is onside in the attacker’s own half', () => {
    const doc = offsideScene({ attacker: 45, ball: 10 });
    Object.values(doc.objects).filter((o) => o.team === 'away').forEach((o) => { o.x = 20; });
    const r = offsideAnalysis(doc, 'home', 0);
    expect(r.flagged).toEqual([]);
    expect(r.lineX).toBe(52.5);
    expect(r.limitedBy).toBe('halfway');
  });

  it('works for a team attacking left', () => {
    const doc = createDocument();
    addPlayer(doc, { team: 'away', number: 9, x: 20, y: 34 });
    addPlayer(doc, { team: 'home', number: 1, gk: true, x: 2, y: 34 });
    addPlayer(doc, { team: 'home', number: 4, x: 30, y: 30 });
    doc.ball = { x: 60, y: 34, owner: null, dead: false };
    const r = offsideAnalysis(doc, 'away', 0);
    expect(r.attack).toBe('left');
    expect(r.lineX).toBe(30);
    expect(r.flagged.map((p) => p.number)).toEqual([9]);
  });

  it('says when there are too few opponents', () => {
    const doc = createDocument();
    addPlayer(doc, { team: 'home', x: 90, y: 34 });
    expect(offsideAnalysis(doc, 'home', 0).enoughDefenders).toBe(false);
  });
});

describe('match data import', () => {
  const pitch = createDocument().pitch;

  it('parses quotes, commas and blank lines', () => {
    expect(parseCSV('a,b\n"x, y",2\n\n"he said ""hi""",3\r\n')).toEqual([{ a: 'x, y', b: '2' }, { a: 'he said "hi"', b: '3' }]);
  });

  it('imports the synthetic sample and builds a network from its rows only', () => {
    const res = importMatchData(SAMPLE_MATCH_CSV, 'csv', pitch, 'sample');
    expect(res.ok).toBe(true);
    expect(res.dataset.teams).toEqual(['Blue', 'Red']);
    const net = passingNetworkFromData(res.dataset, 'Blue');
    expect(net.total).toBe(18);
    expect(net.edges.reduce((s, e) => s + e.count, 0)).toBe(18);
  });

  it('normalises coordinates from other ranges', () => {
    const r = importMatchData('team,player,type,x,y\nA,1,pass,60,40\nA,2,pass,120,80\n', 'csv', pitch);
    expect(r.dataset.scale).toBe('120 by 80 units');
    expect(r.dataset.events[0].x).toBeCloseTo(52.5);
    expect(r.dataset.events[0].y).toBeCloseTo(34);
  });

  it('accepts JSON with an events array', () => {
    const r = importMatchData(JSON.stringify({ events: [{ team: 'A', player: 1, type: 'Pass', x: 0.5, y: 0.5 }] }), 'json', pitch);
    expect(r.ok).toBe(true);
    expect(r.dataset.events[0]).toMatchObject({ type: 'pass', x: 52.5, y: 34 });
  });

  it('reports missing fields and bad files instead of guessing', () => {
    const r = importMatchData('team,player,type,x,y\nA,1,pass,10,10\n,2,pass,10,10\nA,3,,10,10\nA,4,pass,,10\n', 'csv', pitch);
    expect(r.dataset.events).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/Skipped 3 of 4/);
    expect(importMatchData('{bad', 'json', pitch).ok).toBe(false);
    expect(importMatchData('{"a":1}', 'json', pitch).ok).toBe(false);
    expect(importMatchData('', 'csv', pitch).ok).toBe(false);
    expect(importMatchData('team,x\n,\n', 'csv', pitch).ok).toBe(false);
  });
});
