import { copyFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { openApp } from './helpers.js';

// Regenerates README images from the running app: CAPTURE_DOCS=1 npx playwright test docs-capture
test.skip(!process.env.CAPTURE_DOCS, 'Only runs when regenerating documentation images');
test.describe.configure({ timeout: 120000 });

const open = async (page, id) => {
  await page.getByTestId('nav-plays').click();
  await page.getByTestId(`example-${id}`).click();
  await page.getByTestId('nav-board').click();
};

test.describe('desktop', () => {
  test.use({ deviceScaleFactor: 2 });
  test('hero and panels', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page);
    await open(page, 'winger-overlap');
    await page.evaluate(() => window.__pitchlab.transport.seek(2.4));
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'docs/hero.png' });

    const ev = page.getByTestId('clip-through');
    await ev.click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'docs/editing.png' });
    await page.keyboard.press('Escape');

    await page.getByTestId('nav-analysis').click();
    await page.locator('#a-shape').check();
    await page.locator('#a-offside').check();
    await page.evaluate(() => window.__pitchlab.transport.seek(1.6));
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/analysis.png' });
    await page.locator('#a-shape').uncheck();
    await page.locator('#a-offside').uncheck();

    await page.getByTestId('nav-formations').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'docs/formations.png' });

    await page.getByTestId('nav-library').click();
    await page.getByRole('radio', { name: 'Examples' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'docs/library.png' });

    await page.getByTestId('nav-drills').click();
    await page.getByTestId('drill-rondo-5v2').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/drill.png' });

    await page.getByTestId('theme').click();
    await open(page, 'high-press');
    await page.evaluate(() => window.__pitchlab.transport.seek(1.6));
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'docs/dark.png' });
  });
});

test('social image', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.emulateMedia({ colorScheme: 'light' });
  await openApp(page);
  await open(page, 'third-man');
  await page.getByTestId('present').click();
  await page.addStyleTag({ content: '.present-bar { display: none !important; } .toasts { display: none; }' });
  await page.evaluate(() => window.__pitchlab.transport.seek(2.6));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'public/og.png' });
});

test('animated demo comes from the real GIF export', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openApp(page);
  await open(page, 'winger-overlap');
  await page.getByTestId('export').click();
  const [gif] = await Promise.all([page.waitForEvent('download', { timeout: 100000 }), page.getByTestId('export-gif').click()]);
  copyFileSync(await gif.path(), 'docs/demo.gif');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test('phone frame', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/?debug');
    await page.waitForFunction(() => window.__pitchlab?.editor.getState().bootDone);
    await page.getByTestId('welcome-example').tap();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/phone.png' });
  });
});
