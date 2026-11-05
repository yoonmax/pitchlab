import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/core/data/examples.js';
import { SET_PIECES } from '../src/core/data/setpieces.js';
import { DRILL_CATALOG } from '../src/core/data/drills.js';
import { LESSONS } from '../src/core/data/learn.js';
import { compile, sample } from '../src/core/animation/timeline.js';
import { summarize } from '../src/core/tactics/summary.js';
import { validateDocument } from '../src/core/storage/validate.js';

const content = [
  ...EXAMPLES.map((e) => ['example', e.id, e.build]),
  ...SET_PIECES.map((e) => ['set piece', e.id, e.build]),
  ...DRILL_CATALOG.filter((d) => d.build).map((e) => ['drill', e.id, e.build]),
  ...LESSONS.map((e) => ['lesson', e.id, e.build]),
];

describe.each(content)('%s %s', (_kind, _id, build) => {
  const doc = build();
  const c = compile(doc);

  it('builds a play with a real timeline and no impossible events', () => {
    expect(c.duration).toBeGreaterThan(0.5);
    expect(c.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('stays within sensible bounds and never produces invalid numbers', () => {
    for (let t = 0; t <= c.duration; t += 0.1) {
      const s = sample(c, t);
      expect(Number.isFinite(s.ball.x) && Number.isFinite(s.ball.y)).toBe(true);
      for (const p of Object.values(s.objects)) {
        expect(p.x).toBeGreaterThan(-15);
        expect(p.x).toBeLessThan(doc.pitch.length + 15);
        expect(p.y).toBeGreaterThan(-15);
        expect(p.y).toBeLessThan(doc.pitch.width + 15);
      }
    }
  });

  it('survives validation with nothing lost', () => {
    const res = validateDocument(JSON.parse(JSON.stringify(doc)));
    expect(res.ok).toBe(true);
    expect(Object.keys(res.doc.events)).toHaveLength(Object.keys(doc.events).length);
    expect(Object.keys(res.doc.objects)).toHaveLength(Object.keys(doc.objects).length);
  });

  it('has a readable summary', () => {
    expect(summarize(doc).length).toBeGreaterThan(0);
  });
});

describe('content coverage', () => {
  it('ships the seven requested examples', () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual(['build-up-433', 'third-man', 'winger-overlap', 'high-press', 'counterattack', 'corner-routine', 'rondo']);
  });
  it('covers every drill type', () => {
    expect(new Set(DRILL_CATALOG.map((d) => d.type)).size).toBe(10);
  });
  it('explains every topic with points', () => {
    expect(LESSONS).toHaveLength(15);
    for (const l of LESSONS) { expect(l.points.length).toBeGreaterThanOrEqual(3); expect(l.explain.length).toBeGreaterThan(60); }
  });
});
