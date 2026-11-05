import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { drag, guardErrors, openApp, playerPoint, state } from './helpers.js';

guardErrors(test);

const annotationKinds = (page) => state(page, (s) => Object.values(s.doc.annotations).map((a) => a.kind).sort());
const eventTypes = (page) => state(page, (s) => Object.values(s.doc.events).map((e) => e.type).sort());

test('every event tool adds the right event from a player', async ({ page }) => {
  await openApp(page);
  const six = await playerPoint(page, 'home', 6);
  await page.keyboard.press('d');
  await drag(page, six, { x: six.x + 50, y: six.y + 20 });
  expect(await eventTypes(page)).toEqual(['dribble']);
  expect(await state(page, (s) => s.doc.objects[s.doc.ball.owner].number)).toBe(6);

  const nine = await playerPoint(page, 'away', 4);
  await page.keyboard.press('g');
  await drag(page, nine, { x: nine.x + 30, y: nine.y + 10 });
  const four = await playerPoint(page, 'away', 5);
  await page.keyboard.press('x');
  await drag(page, four, { x: four.x - 60, y: four.y - 10 });
  const ten = await playerPoint(page, 'home', 10);
  await page.keyboard.press('r');
  await page.getByTestId('tool-variant').selectOption('overlap');
  await drag(page, ten, { x: ten.x + 80, y: ten.y - 50 });
  expect(await eventTypes(page)).toEqual(['defend', 'dribble', 'overlap', 'press']);

  // Dribbler still has the ball after the dribble, so can shoot; a click aims at the goal.
  await page.keyboard.press('s');
  const after = await playerPoint(page, 'home', 6);
  await page.mouse.click(after.x, after.y);
  const shot = await state(page, (s) => Object.values(s.doc.events).find((e) => e.type === 'shot'));
  expect(shot.to).toEqual({ x: 105, y: 34 });
  const issues = await state(page, (s, x) => x.compile(s.doc).issues.filter((i) => i.level === 'error').length);
  expect(issues).toBe(0);
});

test('a ball action by a player without the ball is refused with a reason', async ({ page }) => {
  await openApp(page);
  const six = await playerPoint(page, 'home', 6);
  const eight = await playerPoint(page, 'home', 8);
  await page.keyboard.press('p');
  await drag(page, six, eight);
  const nine = await playerPoint(page, 'home', 9);
  await drag(page, nine, { x: nine.x + 40, y: nine.y + 40 });
  await expect(page.getByText(/does not have the ball/)).toBeVisible();
  expect(await eventTypes(page)).toEqual(['pass']);
});

test('a second pass follows on from where the first one lands', async ({ page }) => {
  await openApp(page);
  const six = await playerPoint(page, 'home', 6);
  const eight = await playerPoint(page, 'home', 8);
  const seven = await playerPoint(page, 'home', 7);
  await page.keyboard.press('p');
  await drag(page, six, eight);
  await drag(page, eight, seven);
  const evs = await state(page, (s) => Object.values(s.doc.events).sort((a, b) => a.t - b.t));
  expect(evs).toHaveLength(2);
  expect(evs[1].t).toBeGreaterThanOrEqual(evs[0].t + evs[0].duration);
  expect(await state(page, (s, x) => x.compile(s.doc).issues.length)).toBe(0);
  await page.getByTestId('nav-plays').click();
  await expect(page.getByTestId('summary')).toContainText('#6 passes to #8');
  await expect(page.getByTestId('summary')).toContainText('#8 passes to #7');
});

test('every drawing tool adds an annotation, and the eraser removes it', async ({ page }) => {
  await openApp(page);
  const box = await page.getByTestId('board').boundingBox();
  const at = (x, y) => ({ x: box.x + x, y: box.y + y });
  await page.keyboard.press('f');
  await drag(page, at(180, 50), at(320, 90));
  await page.keyboard.press('l');
  await drag(page, at(180, 90), at(320, 130));
  await page.keyboard.press('z');
  await page.mouse.move(box.x + 700, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 800, box.y + 60, { steps: 5 });
  await page.mouse.move(box.x + 800, box.y + 140, { steps: 5 });
  await page.mouse.move(box.x + 700, box.y + 140, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('u');
  await drag(page, at(420, 500), at(520, 560));
  await page.getByTestId('tool-variant').selectOption('circle');
  await drag(page, at(540, 500), at(620, 560));
  await page.keyboard.press('a');
  await page.getByTestId('tool-variant').selectOption('curved');
  await drag(page, at(200, 540), at(300, 500));
  await page.keyboard.press('p');
  await drag(page, at(150, 300), at(150, 330));
  expect(await annotationKinds(page)).toEqual(['arrow', 'arrow', 'circle', 'highlight', 'pen', 'rect', 'zone']);
  const curved = await state(page, (s) => Object.values(s.doc.annotations).find((a) => a.kind === 'arrow' && !a.lineStyle?.includes('pass')));
  expect(curved.c1).not.toBeNull();

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 400, box.y + 60);
  await page.locator('.board-text-input').fill('Press here');
  await page.keyboard.press('Enter');
  expect(await state(page, (s) => Object.values(s.doc.annotations).find((a) => a.kind === 'text').text)).toBe('Press here');
  expect(await state(page, (s) => s.tool)).toBe('select');

  await page.keyboard.press('e');
  await page.mouse.click(box.x + 460, box.y + 530);
  expect(await annotationKinds(page)).not.toContain('rect');
  const players = await state(page, (s) => Object.keys(s.doc.objects).length);
  const seven = await playerPoint(page, 'home', 7);
  await page.mouse.click(seven.x, seven.y);
  expect(await state(page, (s) => Object.keys(s.doc.objects).length)).toBe(players);
  await page.getByTestId('undo').click();
  expect(await annotationKinds(page)).toContain('rect');
});

test('multi-select, group drag, duplicate, delete and clipboard', async ({ page }) => {
  await openApp(page);
  const a = await playerPoint(page, 'home', 3);
  const b = await playerPoint(page, 'home', 11);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');
  expect(await state(page, (s) => s.selection.objects.length)).toBe(2);
  await drag(page, a, { x: a.x + 40, y: a.y + 40 });
  const a2 = await playerPoint(page, 'home', 3);
  const b2 = await playerPoint(page, 'home', 11);
  expect(a2.wx - a.wx).toBeCloseTo(b2.wx - b.wx, 2);
  await page.keyboard.press('Control+d');
  expect(await state(page, (s) => Object.keys(s.doc.objects).length)).toBe(24);
  await page.keyboard.press('Delete');
  expect(await state(page, (s) => Object.keys(s.doc.objects).length)).toBe(22);
  await page.mouse.click(a2.x, a2.y);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  expect(await state(page, (s) => Object.keys(s.doc.objects).length)).toBe(23);
  await page.keyboard.press('ArrowRight');
  const sel = await state(page, (s) => s.doc.objects[s.selection.objects[0]].x);
  expect(sel).toBeCloseTo(a2.wx + 3 + 0.5, 1);
});

test('marquee selects by dragging empty pitch, and locked players stay put', async ({ page }) => {
  await openApp(page);
  const box = await page.getByTestId('board').boundingBox();
  await drag(page, { x: box.x + 60, y: box.y + 60 }, { x: box.x + box.width * 0.45, y: box.y + box.height - 60 });
  expect(await state(page, (s) => s.selection.objects.length)).toBeGreaterThan(5);
  await page.keyboard.press('Escape');
  const p = await playerPoint(page, 'home', 6);
  await page.mouse.click(p.x, p.y);
  await page.getByRole('button', { name: 'Lock' }).click();
  await drag(page, p, { x: p.x + 80, y: p.y });
  expect((await playerPoint(page, 'home', 6)).wx).toBeCloseTo(p.wx, 2);
});

test('inspector edits a player and precise positions', async ({ page }) => {
  await openApp(page);
  const p = await playerPoint(page, 'home', 9);
  await page.mouse.click(p.x, p.y);
  await page.locator('#inspector-name').fill('Mbeki');
  await page.locator('#inspector-number').fill('19');
  await page.locator('#inspector-number').press('Enter');
  const o = await state(page, (s) => s.doc.objects[s.selection.objects[0]]);
  expect(o).toMatchObject({ name: 'Mbeki', number: '19' });
  const x = page.getByRole('spinbutton', { name: 'Position along the pitch' });
  await x.fill('60');
  await x.press('Enter');
  expect(await state(page, (s) => s.doc.objects[s.selection.objects[0]].x)).toBe(60);
  await page.getByRole('radio', { name: 'Away' }).click();
  expect(await state(page, (s) => s.doc.objects[s.selection.objects[0]].team)).toBe('away');
});

test('keyboard alone can select from the object list and move a player', async ({ page }) => {
  await openApp(page);
  await page.getByRole('radio', { name: 'Objects' }).click();
  const first = page.locator('.objectlist button').first();
  await first.focus();
  await page.keyboard.press('Enter');
  const before = await state(page, (s) => s.doc.objects[s.selection.objects[0]].x);
  await page.keyboard.press('Shift+ArrowRight');
  expect(await state(page, (s) => s.doc.objects[s.selection.objects[0]].x)).toBe(before + 5);
});

test('context menu acts on what was clicked', async ({ page }) => {
  await openApp(page);
  const p = await playerPoint(page, 'home', 6);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Give this player the ball' }).click();
  expect(await state(page, (s) => s.doc.objects[s.doc.ball.owner].number)).toBe(6);
  const box = await page.getByTestId('board').boundingBox();
  await page.keyboard.press('Escape');
  await page.mouse.click(box.x + 60, box.y + 30, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Add cone here' }).click();
  expect(await state(page, (s) => Object.values(s.doc.objects).filter((o) => o.type === 'cone').length)).toBe(1);
});

test('view controls and follow-ball keep the camera consistent', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('nav-plays').click();
  await page.getByTestId('example-third-man').click();
  await page.getByTestId('orient').click();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => Math.round(window.__pitchlab.camera.cam.rot))).toBe(-90);
  await page.getByTestId('fit').click();
  await page.getByTestId('orient').click();
  await page.waitForTimeout(800);
  const zoomed = await page.evaluate(() => window.__pitchlab.camera.cam.zoom);
  await page.getByTestId('follow-ball').click();
  await page.evaluate(() => window.__pitchlab.transport.seek(1.5));
  await page.waitForTimeout(800);
  const cam = await page.evaluate(() => {
    const { camera } = window.__pitchlab;
    return { zoom: camera.cam.zoom, cx: camera.cam.cx };
  });
  expect(cam.zoom).toBeGreaterThan(zoomed * 1.4);
  await page.getByTestId('fit').click();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__pitchlab.editor.getState().followMode)).toBe('none');
});

test('a training session prints with its drills', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('nav-library').click();
  await page.getByRole('radio', { name: 'Sessions' }).click();
  await page.getByTestId('new-session').click();
  await page.getByTestId('session-add-template').selectOption('y-pattern');
  await expect(page.locator('.session-drills li')).toHaveCount(1);
  await page.getByTestId('session-add-template').selectOption('warmup-gates');
  await expect(page.locator('.session-drills li')).toHaveCount(2);
  await expect(page.getByText('20 minutes')).toBeVisible();
  await page.getByTestId('print-session').click();
  await expect(page.getByTestId('print-sheet')).toContainText('Y passing pattern');
  await expect(page.getByTestId('print-sheet').locator('svg')).toHaveCount(2);
});

test('video export produces a real file where the browser can encode', async ({ page }) => {
  test.setTimeout(120000);
  await openApp(page);
  await page.getByTestId('nav-plays').click();
  await page.getByTestId('example-third-man').click();
  await page.getByTestId('export').click();
  const button = page.getByTestId('export-video');
  await page.waitForTimeout(1500);
  test.skip(!(await button.isVisible()), 'This browser build has no video encoder');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 100000 }), button.click()]);
  const bytes = readFileSync(await dl.path());
  expect(bytes.length).toBeGreaterThan(20000);
  const name = dl.suggestedFilename();
  if (name.endsWith('.mp4')) expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
  else expect(bytes[0]).toBe(0x1a);
});

test('copy diagram puts an image on the clipboard', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('export').click();
  await page.getByTestId('export-copy').click();
  await expect(page.getByText('Copied the diagram')).toBeVisible();
  const types = await page.evaluate(async () => (await navigator.clipboard.read())[0].types);
  expect(types).toContain('image/png');
});

test('brand is always lowercase in the interface and metadata', async ({ page }) => {
  await openApp(page);
  const html = await page.content();
  expect(html).not.toMatch(/PitchLab|Pitchlab|PITCHLAB/);
  await page.getByTestId('nav-settings').click();
  expect(await page.content()).not.toMatch(/PitchLab|Pitchlab|PITCHLAB/);
});

test('playback does not re-render React, and frames are cheap', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('nav-plays').click();
  await page.getByTestId('example-counterattack').click();
  await page.getByTestId('nav-board').click();
  const result = await page.evaluate(async () => {
    const { transport } = window.__pitchlab;
    const marker = document.querySelector('[data-testid="board"] svg g');
    const nodes = [...document.querySelectorAll('[data-object]')];
    const objectNode = nodes[0];
    transport.seek(0);
    const before = nodes.map((n) => n.getAttribute('transform')).join();
    transport.seek(transport.duration * 0.6);
    const after = nodes.map((n) => n.getAttribute('transform')).join();
    const start = performance.now();
    const n = 2000;
    let writes = 0;
    for (let i = 0; i < n; i++) {
      transport.seek((i / n) * transport.duration);
      writes += nodes[3].getAttribute('transform').length > 0 ? 1 : 0;
    }
    const perSeek = (performance.now() - start) / n;

    // Then a real two seconds of playback, with layout forced each frame so the cost is not hidden.
    const gaps = [];
    transport.seek(0);
    transport.play();
    await new Promise((resolve) => {
      let last = performance.now();
      const stopAt = last + 2000;
      const tick = () => {
        const now = performance.now();
        document.querySelector('[data-object]').getBoundingClientRect();
        gaps.push(now - last);
        last = now;
        if (now < stopAt) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    transport.pause();
    gaps.sort((a, b) => a - b);
    return {
      perSeek, moved: before !== after, writes, count: nodes.length,
      frames: gaps.length, median: gaps[gaps.length >> 1], p95: gaps[Math.floor(gaps.length * 0.95)],
      same: objectNode === document.querySelector('[data-object]') && !!marker,
    };
  });
  console.log(`Measured: ${JSON.stringify(result)}`);
  expect(result.moved).toBe(true);
  expect(result.perSeek).toBeLessThan(8);
  expect(result.same).toBe(true);
});

for (const [name, setup] of [
  ['board', async () => {}],
  ['plays panel', async (page) => { await page.getByTestId('nav-plays').click(); }],
  ['formations panel', async (page) => { await page.getByTestId('nav-formations').click(); }],
  ['drills panel', async (page) => { await page.getByTestId('nav-drills').click(); }],
  ['analysis panel', async (page) => { await page.getByTestId('nav-analysis').click(); }],
  ['library', async (page) => { await page.getByTestId('nav-library').click(); await page.getByRole('radio', { name: 'Examples' }).click(); }],
  ['settings', async (page) => { await page.getByTestId('nav-settings').click(); }],
  ['export dialog', async (page) => { await page.getByTestId('export').click(); }],
]) {
  for (const theme of ['light', 'dark']) {
    test(`no serious accessibility issues: ${name}, ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await openApp(page);
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      await setup(page);
      await page.waitForTimeout(350);
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.board-svg').exclude('.thumb').exclude('.export-preview').exclude('.fglyph').analyze();
      const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const report = serious.flatMap((v) => v.nodes.slice(0, 4).map((n) => `${v.id}: ${n.target.join(' ')} ${n.any?.[0]?.message?.slice(0, 110) ?? ''}`));
      expect(report).toEqual([]);
    });
  }
}
