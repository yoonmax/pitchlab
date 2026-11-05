import { expect } from '@playwright/test';

/** Open a clean app with the debug hook and the welcome card out of the way. */
export async function openApp(page, path = '/?debug') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(path);
  await expect(page.getByTestId('board')).toBeVisible();
  await page.waitForFunction(() => window.__pitchlab && window.__pitchlab.editor.getState().bootDone);
  const dismiss = page.getByTestId('welcome-dismiss');
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  return errors;
}

/** Find a player by team and shirt number and return its current screen position. */
export async function playerPoint(page, team, number, t = null) {
  return page.evaluate(({ team, number, t }) => {
    const { editor, compile, camera, transport } = window.__pitchlab;
    const doc = editor.getState().doc;
    const o = Object.values(doc.objects).find((p) => p.team === team && String(p.number) === String(number));
    const c = compile(doc);
    const time = t ?? transport.t;
    const tr = c.tracks[o.id];
    let pos = { x: o.x, y: o.y };
    for (const s of tr.segs) if (time >= s.t1) pos = s.p3;
    const s = camera.toScreen(pos.x, pos.y);
    const r = document.querySelector('.board-svg').getBoundingClientRect();
    return { x: s.x + r.left, y: s.y + r.top, id: o.id, wx: pos.x, wy: pos.y };
  }, { team, number, t });
}

export async function drag(page, a, b, steps = 12) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

/** Fails a test if the page threw at any point, even when the interface looks fine. */
export function guardErrors(test) {
  test.beforeEach(async ({ page }, info) => {
    info.pageErrors = [];
    page.on('pageerror', (e) => info.pageErrors.push(e.message));
  });
  test.afterEach(async ({ page: _page }, info) => {
    if (info.status === 'passed' && info.pageErrors.length) throw new Error(`Page errors: ${info.pageErrors.join('; ')}`);
  });
}

export const state = (page, fn) => page.evaluate(`(${fn})(window.__pitchlab.editor.getState(), window.__pitchlab)`);
