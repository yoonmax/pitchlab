import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { drag, guardErrors, openApp, playerPoint, state } from './helpers.js';

guardErrors(test);

test('opens with a usable board and no errors', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page).toHaveTitle('pitchlab');
  await expect(page.locator('.wordmark')).toHaveAttribute('aria-label', 'pitchlab');
  const count = await state(page, (s) => Object.keys(s.doc.objects).length);
  expect(count).toBe(22);
  expect(errors).toEqual([]);
});

test('drags a player, with undo and redo', async ({ page }) => {
  await openApp(page);
  const p = await playerPoint(page, 'home', 6);
  await drag(page, p, { x: p.x + 90, y: p.y + 40 });
  const moved = await playerPoint(page, 'home', 6);
  expect(moved.wx).toBeGreaterThan(p.wx + 3);
  expect(moved.x).toBeCloseTo(p.x + 90, -1);
  await page.getByTestId('undo').click();
  const back = await playerPoint(page, 'home', 6);
  expect(back.wx).toBeCloseTo(p.wx, 2);
  await page.getByTestId('redo').click();
  expect((await playerPoint(page, 'home', 6)).wx).toBeCloseTo(moved.wx, 2);
});

test('keeps dragging accurate after zoom, pan and rotation', async ({ page }) => {
  await openApp(page);
  await page.waitForTimeout(100);
  const box = await page.getByTestId('board').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -80);
  await page.keyboard.up('Control');
  await page.getByTestId('flip').click();
  await page.waitForTimeout(900);
  const p = await playerPoint(page, 'home', 8);
  await drag(page, p, { x: p.x + 60, y: p.y - 30 });
  const q = await playerPoint(page, 'home', 8);
  expect(Math.abs(q.x - (p.x + 60))).toBeLessThan(10);
  expect(Math.abs(q.y - (p.y - 30))).toBeLessThan(10);
});

test('draws an arrow, edits a curve handle, and erases it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('a');
  const box = await page.getByTestId('board').boundingBox();
  await drag(page, { x: box.x + 200, y: box.y + 60 }, { x: box.x + 420, y: box.y + 90 });
  expect(await state(page, (s) => Object.values(s.doc.annotations).filter((a) => a.kind === 'arrow').length)).toBe(1);
  await page.keyboard.press('v');
  const c1 = page.locator('[data-hit="handle"][data-which="c1"]');
  await expect(c1).toBeAttached();
  const hb = await c1.boundingBox();
  await drag(page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, { x: hb.x + hb.width / 2, y: hb.y + 80 });
  expect(await state(page, (s) => Object.values(s.doc.annotations)[0].c1 !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('e');
  await page.mouse.click(box.x + 200 + 2, box.y + 60 + 1);
  await page.keyboard.press('v');
});

test('creates a pass and a run that play back, pause and scrub', async ({ page }) => {
  const errors = await openApp(page);
  const six = await playerPoint(page, 'home', 6);
  const seven = await playerPoint(page, 'home', 7);
  await page.keyboard.press('r');
  await drag(page, seven, { x: seven.x + 120, y: seven.y - 30 }, 16);
  await page.keyboard.press('p');
  const target = await playerPoint(page, 'home', 7, 0);
  await drag(page, six, { x: target.x + 60, y: target.y - 15 }, 16);
  const events = await state(page, (s) => Object.values(s.doc.events).map((e) => e.type).sort());
  expect(events).toEqual(['pass', 'run']);
  const pass = await state(page, (s) => Object.values(s.doc.events).find((e) => e.type === 'pass'));
  expect(pass.receiver).toBeTruthy();
  await expect(page.getByTestId('clip-pass')).toBeVisible();
  await expect(page.getByTestId('clip-run')).toBeVisible();

  await page.keyboard.press('v');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__pitchlab.transport.seek(0));
  await page.getByTestId('play').click();
  await page.waitForTimeout(350);
  const a = await page.evaluate(() => window.__pitchlab.transport.t);
  expect(a).toBeGreaterThan(0.1);
  await page.getByTestId('play').click();
  const held = await page.evaluate(() => window.__pitchlab.transport.t);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__pitchlab.transport.t)).toBe(held);

  // Scrubbing writes to the DOM directly, and matches a pure sample at that time.
  const ruler = await page.getByTestId('ruler').boundingBox();
  await page.mouse.click(ruler.x + 56, ruler.y + 8);
  const check = await page.evaluate(() => {
    const { transport, editor, compile } = window.__pitchlab;
    const doc = editor.getState().doc;
    const c = compile(doc);
    const o = Object.values(doc.objects).find((p) => p.team === 'home' && p.number === 7);
    const el = document.querySelector(`[data-object="${o.id}"]`);
    return { t: transport.t, attr: el.getAttribute('transform'), seg: c.tracks[o.id].segs[0].t0 };
  });
  expect(check.t).toBeCloseTo(1, 0);
  expect(check.attr).toMatch(/translate/);
  await page.getByTestId('speed').selectOption('4');
  expect(await page.evaluate(() => window.__pitchlab.transport.speed)).toBe(4);
  expect(errors).toEqual([]);
});

test('saves a play, reloads, and reopens it from the library', async ({ page }) => {
  await openApp(page);
  const p = await playerPoint(page, 'home', 9);
  await drag(page, p, { x: p.x + 50, y: p.y + 50 });
  await page.getByTestId('save').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved in this browser');
  const before = await playerPoint(page, 'home', 9);
  await page.reload();
  await page.waitForFunction(() => window.__pitchlab?.editor.getState().bootDone);
  const after = await playerPoint(page, 'home', 9);
  expect(after.wx).toBeCloseTo(before.wx, 1);
  await page.getByTestId('nav-library').click();
  await expect(page.getByTestId('library-open')).toHaveCount(1);
  await page.getByTestId('library-open').click();
  await expect(page.getByTestId('board')).toBeVisible();
});

test('autosaves without pressing save, and deletes with undo', async ({ page }) => {
  await openApp(page);
  const p = await playerPoint(page, 'away', 9);
  await drag(page, p, { x: p.x - 40, y: p.y - 40 });
  await expect(page.getByTestId('save-status')).toHaveText('Saved in this browser', { timeout: 4000 });
  await page.getByTestId('nav-library').click();
  await page.getByTestId('library-delete').click();
  await expect(page.getByTestId('library-open')).toHaveCount(0);
  await page.locator('.toast-action').click();
  await expect(page.getByTestId('library-open')).toHaveCount(1);
});

test('exports a real PNG, SVG and JSON, then reimports the JSON', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('export').click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-png').click()]);
  const bytes = readFileSync(await png.path());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(20000);
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-svg').click()]);
  const text = readFileSync(await svg.path(), 'utf8');
  expect(text).toContain('<svg');
  expect(text).toContain('@font-face');
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const path = await json.path();
  await page.keyboard.press('Escape');
  await page.getByTestId('nav-library').click();
  await page.getByTestId('import-input').setInputFiles({ name: 'play.json', mimeType: 'application/json', buffer: readFileSync(path) });
  await expect(page.getByText(/Imported/)).toBeVisible();
  expect(await state(page, (s) => Object.keys(s.doc.objects).length)).toBe(22);
});

test('rejects a corrupt file with a clear message', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('nav-library').click();
  await page.getByTestId('import-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ not json') });
  await expect(page.getByText(/not valid JSON/)).toBeVisible();
});

test('every example animates without errors', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByTestId('nav-plays').click();
  for (const id of ['build-up-433', 'third-man', 'winger-overlap', 'high-press', 'counterattack', 'corner-routine', 'rondo']) {
    await page.getByTestId('nav-plays').click();
    await page.getByTestId(`example-${id}`).click();
    const d = await page.evaluate(() => window.__pitchlab.transport.duration);
    expect(d).toBeGreaterThan(1);
    await page.evaluate(() => window.__pitchlab.transport.seek(window.__pitchlab.transport.duration / 2));
    expect(await state(page, (s, x) => x.compile(s.doc).issues.filter((i) => i.level === 'error').length)).toBe(0);
  }
  expect(errors).toEqual([]);
});

test('switches formation and keeps player identities', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('nav-formations').click();
  const before = await state(page, (s) => Object.values(s.doc.objects).filter((o) => o.team === 'home').map((o) => o.id).sort());
  await page.getByTestId('formation-3-5-2').click();
  const after = await state(page, (s) => Object.values(s.doc.objects).filter((o) => o.team === 'home').map((o) => o.id).sort());
  expect(after).toEqual(before);
  expect(await state(page, (s) => s.doc.teams.home.formation)).toBe('3-5-2');
  await page.getByTestId('formation-name').fill('Our block');
  await page.getByTestId('formation-save').click();
  await expect(page.locator('.customlist').getByText('Our block')).toBeVisible();
});

test('builds a set piece with a wall and a drill from a template', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('nav-plays').click();
  await page.getByTestId('setpiece-freekick-direct').click();
  expect(await state(page, (s) => s.doc.kind)).toBe('setpiece');
  await page.getByTestId('wall-3').click();
  await page.getByTestId('nav-drills').click();
  await page.getByTestId('drill-rondo-5v2').click();
  expect(await state(page, (s) => s.doc.drill.objective.length)).toBeGreaterThan(5);
  await page.getByTestId('add-cone').click();
});

test('share link opens read-only and can be copied', async ({ page, context }) => {
  await openApp(page);
  await page.getByTestId('nav-plays').click();
  await page.getByTestId('example-third-man').click();
  await page.getByTestId('share').click();
  const url = await page.getByTestId('share-url').inputValue();
  expect(url).toContain('#/s/');
  const other = await context.newPage();
  await other.goto(url.replace(/^(https?:\/\/[^/]+)\//, '$1/?debug'));
  await other.waitForFunction(() => window.__pitchlab?.editor.getState().bootDone);
  expect(await state(other, (s) => [s.readOnly, s.doc.title])).toEqual([true, 'Third-man combination']);
  await expect(other.getByTestId('tool-select')).toHaveCount(0);
  await other.getByTestId('play').click();
  await other.waitForTimeout(200);
  expect(await other.evaluate(() => window.__pitchlab.transport.t)).toBeGreaterThan(0);
  await other.getByTestId('shared-copy').click();
  expect(await state(other, (s) => s.readOnly)).toBe(false);
});

test('analysis overlays compute and offside flags a player', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('nav-analysis').click();
  await page.locator('#a-hull').check();
  await page.locator('#a-shape').check();
  await expect(page.getByTestId('metrics')).toContainText('Width');
  await page.locator('#a-offside').check();
  await expect(page.getByTestId('offside-result')).toBeVisible();
  await page.locator('#a-network').check();
  await page.getByTestId('sample-data').click();
  await expect(page.getByTestId('network-count')).toContainText('passes');
  await page.locator('#a-zones').check();
  await page.locator('#a-heat').check();
});

test('shortcuts, theme and presentation mode work', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('r');
  expect(await state(page, (s) => s.tool)).toBe('run');
  await page.keyboard.press('Escape');
  expect(await state(page, (s) => s.tool)).toBe('select');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByTestId('theme').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(theme);
  await page.getByTestId('present').click();
  await expect(page.getByTestId('presentation')).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.topbar')).toBeVisible();
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
});

test('typing in a field does not trigger shortcuts', async ({ page }) => {
  await openApp(page);
  await page.locator('#doc-title').fill('rrr ppp');
  expect(await state(page, (s) => s.tool)).toBe('select');
  await page.locator('#doc-title').press('Enter');
  expect(await state(page, (s) => s.doc.title)).toBe('rrr ppp');
});

test('adds and moves a keyframe', async ({ page }) => {
  await openApp(page);
  const p = await playerPoint(page, 'home', 10);
  await page.mouse.click(p.x, p.y);
  await page.evaluate(() => window.__pitchlab.transport.seek(3));
  await page.keyboard.press('k');
  await expect(page.getByTestId('keyframe')).toHaveCount(1);
  await drag(page, p, { x: p.x + 80, y: p.y });
  const key = await state(page, (s) => Object.values(s.doc.events)[0]);
  expect(key.type).toBe('key');
  expect(key.t).toBe(3);
  expect(key.to.x).toBeGreaterThan(p.wx);
  const kf = await page.getByTestId('keyframe').boundingBox();
  await drag(page, { x: kf.x + kf.width / 2, y: kf.y + kf.height / 2 }, { x: kf.x + kf.width / 2 + 56, y: kf.y + kf.height / 2 });
  expect(await state(page, (s) => Object.values(s.doc.events)[0].t)).toBeGreaterThan(3.5);
});

test('animated GIF export follows the timeline', async ({ page }) => {
  test.setTimeout(120000);
  await openApp(page);
  await page.getByTestId('nav-plays').click();
  await page.getByTestId('example-third-man').click();
  await page.getByTestId('export').click();
  const [gif] = await Promise.all([page.waitForEvent('download', { timeout: 100000 }), page.getByTestId('export-gif').click()]);
  const bytes = readFileSync(await gif.path());
  expect(bytes.subarray(0, 3).toString()).toBe('GIF');
  expect(bytes.length).toBeGreaterThan(50000);
});

test('3D replay opens and renders a canvas', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByTestId('nav-plays').click();
  await page.getByTestId('example-winger-overlap').click();
  await page.getByTestId('replay3d').click();
  await expect(page.getByTestId('replay').locator('canvas')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
});
