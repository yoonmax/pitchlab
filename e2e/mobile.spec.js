import { expect, test } from '@playwright/test';
import { openApp, playerPoint, state } from './helpers.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('phone layout fits, with the pitch vertical and touch dragging', async ({ page }) => {
  const errors = await openApp(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.__pitchlab.camera.target.rot)).toBe(-90);
  const box = await page.getByTestId('board').boundingBox();
  expect(box.height).toBeGreaterThan(300);
  const p = await playerPoint(page, 'home', 6);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
  for (let i = 1; i <= 8; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + i * 6, y: p.y + i * 4 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const q = await playerPoint(page, 'home', 6);
  expect(Math.abs(q.x - (p.x + 48))).toBeLessThan(14);
  expect(await state(page, (s) => s.past.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
