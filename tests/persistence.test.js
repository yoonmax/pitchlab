import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { addAnnotation, addEvent, addPlayer, createDocument, duplicateDocument, SCHEMA_VERSION } from '../src/core/document.js';
import { resetDatabaseConnection, dbPut } from '../src/core/storage/db.js';
import { migrate } from '../src/core/storage/migrations.js';
import { deleteFormation, duplicateSavedDocument, getLastOpened, listDocuments, listFormations, listSessions, loadDocument, loadSetting, purgeDeleted, restoreDocument, saveDocument, saveFormation, saveSession, saveSetting, softDeleteDocument } from '../src/core/storage/repository.js';
import { decodeShare, encodeShare, buildShareLink, readShareFromLocation } from '../src/core/storage/share.js';
import { parseDocumentText, serializeDocument, validateDocument } from '../src/core/storage/validate.js';
import { compile, positionAt } from '../src/core/animation/timeline.js';
import { EXAMPLES } from '../src/core/data/examples.js';

function sample() {
  const doc = createDocument({ fields: { title: 'Saved play', tags: ['a'], category: 'Pressing' } });
  const a = addPlayer(doc, { team: 'home', x: 10, y: 20, name: 'Ana', number: 8 });
  const b = addPlayer(doc, { team: 'away', x: 30, y: 40 });
  doc.ball.owner = a;
  addEvent(doc, { type: 'pass', actor: a, t: 1, duration: 1, receiver: b, to: null, comment: 'Hello' });
  addEvent(doc, { type: 'run', actor: b, t: 0, duration: 2, to: { x: 40, y: 40 }, c1: { x: 32, y: 30 }, c2: { x: 38, y: 30 } });
  addAnnotation(doc, { kind: 'arrow', p0: { x: 1, y: 1 }, p3: { x: 9, y: 9 }, c1: null, c2: null, startAttach: a });
  addAnnotation(doc, { kind: 'text', x: 5, y: 5, text: 'Note', size: 3 });
  addAnnotation(doc, { kind: 'zone', points: [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 5 }], showFrom: 1, showUntil: 3 });
  return doc;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDatabaseConnection();
});

describe('repository', () => {
  it('saves and loads a document with nothing changed', async () => {
    const doc = sample();
    await saveDocument(doc);
    const loaded = await loadDocument(doc.id);
    expect(loaded.title).toBe('Saved play');
    expect(loaded.objects).toEqual(doc.objects);
    expect(loaded.events).toEqual(Object.fromEntries(Object.entries(doc.events).map(([k, e]) => [k, expect.objectContaining({ type: e.type, actor: e.actor, t: e.t, duration: e.duration, comment: e.comment })])));
    expect(loaded.annotationOrder).toEqual(doc.annotationOrder);
    expect(await getLastOpened()).toBe(doc.id);
    const a = compile(doc);
    const b = compile(loaded);
    for (const id of Object.keys(doc.objects)) expect(positionAt(b, id, 1.3)).toEqual(positionAt(a, id, 1.3));
  });

  it('overwrites on repeat saves, as autosave does', async () => {
    const doc = sample();
    await saveDocument(doc);
    await saveDocument({ ...doc, title: 'Second' });
    const all = await listDocuments();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Second');
  });

  it('lists newest first and duplicates under a new id', async () => {
    const a = sample();
    await saveDocument(a);
    await new Promise((r) => setTimeout(r, 5));
    const copy = await duplicateSavedDocument(a.id);
    const b = { ...sample(), title: 'Newest' };
    await new Promise((r) => setTimeout(r, 5));
    await saveDocument(b);
    const all = await listDocuments();
    expect(all).toHaveLength(3);
    expect(all[0].title).toBe('Newest');
    expect(copy.id).not.toBe(a.id);
    expect(copy.title).toBe('Saved play copy');
  });

  it('can undo a delete, and purges only after a week', async () => {
    const doc = sample();
    await saveDocument(doc);
    await softDeleteDocument(doc.id);
    expect(await listDocuments()).toHaveLength(0);
    expect(await listDocuments({ includeDeleted: true })).toHaveLength(1);
    await purgeDeleted(Date.now() + 3600 * 1000);
    expect(await listDocuments({ includeDeleted: true })).toHaveLength(1);
    await restoreDocument(doc.id);
    expect(await listDocuments()).toHaveLength(1);
    await softDeleteDocument(doc.id);
    await purgeDeleted(Date.now() + 8 * 24 * 3600 * 1000);
    expect(await loadDocument(doc.id)).toBe(null);
  });

  it('skips a damaged record without losing the others', async () => {
    const good = sample();
    await saveDocument(good);
    await dbPut('documents', { id: 'broken', nonsense: true });
    const list = await listDocuments();
    expect(list.map((d) => d.id)).toEqual([good.id]);
    expect(await loadDocument('broken')).toBe(null);
  });

  it('stores formations, sessions and settings', async () => {
    await saveFormation({ id: 'f1', name: 'Mine', slots: [] });
    expect(await listFormations()).toHaveLength(1);
    await deleteFormation('f1');
    expect(await listFormations()).toHaveLength(0);
    await saveSession({ id: 's1', title: 'Tuesday', drills: ['x'] });
    expect((await listSessions())[0].title).toBe('Tuesday');
    await saveSetting('snap', false);
    expect(await loadSetting('snap', true)).toBe(false);
    expect(await loadSetting('other', 'fallback')).toBe('fallback');
  });
});

describe('import and export', () => {
  it('round-trips through JSON', () => {
    const doc = sample();
    const res = parseDocumentText(serializeDocument(doc));
    expect(res.ok).toBe(true);
    expect(res.doc.objects).toEqual(doc.objects);
    expect(Object.keys(res.doc.events)).toEqual(Object.keys(doc.events));
    const zone = Object.values(res.doc.annotations).find((a) => a.kind === 'zone');
    expect(zone.showFrom).toBe(1);
    expect(zone.showUntil).toBe(3);
  });

  it.each([
    ['empty text', ''],
    ['not JSON', '{oops'],
    ['a number', '42'],
    ['null', 'null'],
    ['an array', '[]'],
    ['no objects', '{"title":"x"}'],
    ['the wrong format', '{"format":"pitchlab"}'],
  ])('rejects %s with a message', (_n, text) => {
    const res = parseDocumentText(text);
    expect(res.ok).toBe(false);
    expect(res.errors[0].length).toBeGreaterThan(5);
  });

  it('rejects a file from a newer schema', () => {
    const res = validateDocument({ ...sample(), schema: SCHEMA_VERSION + 5 });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/newer version/);
  });

  it('drops dangling references, unknown events and bad ids', () => {
    const raw = JSON.parse(JSON.stringify(sample()));
    const [first] = Object.keys(raw.events);
    raw.events.bad = { id: 'bad', type: 'teleport', actor: Object.keys(raw.objects)[0] };
    raw.events.gone = { id: 'gone', type: 'run', actor: 'nobody', t: 0, duration: 1, to: { x: 1, y: 1 } };
    raw.events.noto = { id: 'noto', type: 'run', actor: Object.keys(raw.objects)[0], t: 0, duration: 1 };
    raw.events[first].receiver = 'missing';
    raw.events[first].to = { x: 5, y: 5 };
    raw.ball.owner = 'missing';
    raw.objects['<script>'] = { type: 'player', x: 1, y: 1 };
    const res = validateDocument(raw);
    expect(res.ok).toBe(true);
    expect(res.doc.events.bad).toBeUndefined();
    expect(res.doc.events.gone).toBeUndefined();
    expect(res.doc.events.noto).toBeUndefined();
    expect(res.doc.events[first].receiver).toBe(null);
    expect(res.doc.ball.owner).toBe(null);
    expect(res.doc.objects['<script>']).toBeUndefined();
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(() => compile(res.doc)).not.toThrow();
  });

  it('clamps wild values and ignores fields it does not know', () => {
    const raw = JSON.parse(JSON.stringify(sample()));
    const id = Object.keys(raw.objects)[0];
    raw.objects[id].x = 1e12;
    raw.objects[id].y = 'NaN';
    raw.objects[id].color = 'url(javascript:alert(1))';
    raw.objects[id].onclick = 'alert(1)';
    raw.pitch.length = -5;
    raw.pitch.theme = 'nope';
    raw.teams.home.color = '</style><script>';
    raw.evil = 'x';
    const { doc } = validateDocument(raw);
    expect(doc.objects[id].x).toBe(1e4);
    expect(doc.objects[id].y).toBe(0);
    expect(doc.objects[id].color).toBe(null);
    expect(doc.objects[id].onclick).toBeUndefined();
    expect(doc.pitch.length).toBe(15);
    expect(doc.pitch.theme).toBe('forest');
    expect(doc.teams.home.color).toMatch(/^#/);
    expect(doc.evil).toBeUndefined();
  });

  it('enforces size limits', () => {
    const raw = createDocument();
    for (let i = 0; i < 301; i++) raw.objects[`p${i}`] = { type: 'cone', x: 0, y: 0 };
    expect(validateDocument(raw).ok).toBe(false);
    expect(parseDocumentText(`"${'x'.repeat(9 * 1024 * 1024)}"`).ok).toBe(false);
  });

  it('keeps ordering lists valid', () => {
    const raw = JSON.parse(JSON.stringify(sample()));
    raw.objectOrder = ['ghost', raw.objectOrder[1]];
    const { doc } = validateDocument(raw);
    expect(doc.objectOrder).toHaveLength(2);
    expect(doc.objectOrder).not.toContain('ghost');
  });
});

describe('migrations', () => {
  it('upgrades a version 1 file and keeps the ball holder', () => {
    const doc = sample();
    const owner = doc.ball.owner;
    const v1 = { ...JSON.parse(JSON.stringify(doc)), schema: 1, possession: owner };
    delete v1.ball;
    delete v1.teams;
    const res = validateDocument(v1);
    expect(res.ok).toBe(true);
    expect(res.doc.schema).toBe(SCHEMA_VERSION);
    expect(res.doc.ball.owner).toBe(owner);
    expect(res.doc.teams.home.attack).toBe('right');
  });

  it('leaves a current file alone and refuses an unknown one', () => {
    const doc = sample();
    expect(migrate(doc)).toBe(doc);
    expect(() => migrate({ schema: 99 })).toThrow();
  });
});

describe('share links', () => {
  it('round-trips a play through a compressed link', async () => {
    const doc = sample();
    const res = await decodeShare(await encodeShare(doc));
    expect(res.ok).toBe(true);
    expect(res.doc.title).toBe('Saved play');
    expect(res.doc.objects).toEqual(doc.objects);
  });

  it('keeps bundled examples short enough to share', async () => {
    for (const e of EXAMPLES) {
      const link = await buildShareLink(e.build(), 'https://example.test');
      expect(link.tooLong).toBe(false);
      expect(link.length).toBeLessThan(8000);
    }
  });

  it('marks long links rather than producing broken ones', async () => {
    const doc = createDocument();
    for (let i = 0; i < 280; i++) addPlayer(doc, { team: 'home', x: Math.random() * 100, y: Math.random() * 60, name: Math.random().toString(36), notes: Array.from({ length: 40 }, () => Math.random().toString(36).slice(2)).join('') });
    const link = await buildShareLink(doc, 'https://example.test');
    expect(link.risky).toBe(true);
    expect(link.tooLong).toBe(true);
  });

  it('reports damaged links', async () => {
    expect((await decodeShare('not-valid')).ok).toBe(false);
    const good = await encodeShare(sample());
    expect((await decodeShare(good.slice(0, 20))).ok).toBe(false);
  });

  it('only reads the share path from the fragment', () => {
    expect(readShareFromLocation('#/s/abc')).toBe('abc');
    expect(readShareFromLocation('#other')).toBe(null);
    expect(readShareFromLocation('')).toBe(null);
  });

  it('strips local metadata from a shared copy, and duplicates get new ids', () => {
    const copy = duplicateDocument(sample(), { title: 'x' });
    expect(copy.deletedAt).toBeUndefined();
    expect(copy.title).toBe('x');
  });
});
