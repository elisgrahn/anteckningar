import { test, expect } from '@playwright/test';

// A small real-time gap between each dispatched point, unlike penStroke's
// tight loop: back-to-back CDP dispatches can land in the same animation
// frame under load and get coalesced together, and getCoalescedEvents()
// then only reports pressure for the last of them — this test needs each
// point's own pressure to survive.
async function slowPenStroke(page, canvas, points, forces) {
  const client = await page.context().newCDPSession(page);
  const box = await canvas.boundingBox();
  const abs = points.map(([x, y]) => ({ x: box.x + x, y: box.y + y }));
  const dispatch = (type, p, force) =>
    client.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', pointerType: 'pen', force, ...(type === 'mouseReleased' ? { buttons: 0 } : { buttons: 1 }) });

  await dispatch('mousePressed', abs[0], forces[0]);
  for (let i = 1; i < abs.length; i++) {
    await page.waitForTimeout(30);
    await dispatch('mouseMoved', abs[i], forces[i]);
  }
  await page.waitForTimeout(30);
  await dispatch('mouseReleased', abs[abs.length - 1], forces[abs.length - 1]);
}

// M8: a desktop tablet pen (Wacom-style) draws with real pressure — only on a
// non-touch device (isDesktopPen in strokes.js), which this headless
// Chromium is. The eraser end (isEraserEnd) has no test here: CDP's
// Input.dispatchMouseEvent silently normalizes any `buttons` bitmask back to
// 1 for a synthesized pen press (confirmed by instrumenting a pointerdown
// listener — buttons: 32 arrives in the app as buttons: 1), so a trusted
// eraser-contact event can't be simulated in this sandbox. Needs a real
// Wacom pen in Chrome/Firefox — M8's own milestone criterion, not a gap this
// suite can close.

async function sceneOf(page, name) {
  const res = await page.request.get(`/api/figure/${name}`);
  const { svg } = await res.json();
  const i = svg.indexOf('<!--scene:');
  const j = svg.indexOf('-->', i);
  return JSON.parse(svg.slice(i + '<!--scene:'.length, j).replace(/- -/g, '--'));
}

test('a desktop pen stroke is saved with the real pressure it was drawn with', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.editor .cm-content')).toBeVisible();
  // The cursor starts at the end of the document, which — with other tests'
  // figures sharing this same document across the run — can already be an
  // #image(...) line. Draw would then continue that existing, pressure-less
  // figure instead of opening a fresh one. A blank line first guarantees a
  // new figure, regardless of run order.
  await page.locator('.editor .cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /draw/i }).click();
  const canvas = page.locator('.overlay-canvas canvas');
  await expect(canvas).toBeVisible();

  await slowPenStroke(
    page,
    canvas,
    [
      [40, 200],
      [80, 180],
      [120, 160],
      [160, 200],
    ],
    [0.1, 0.3, 0.9, 0.9],
  );
  await page.getByRole('button', { name: /^done/i }).click();
  await expect(page.locator('.editor .cm-content')).toContainText(/figures\/(f-\d+)\.svg/);

  // The last match, not the first: other tests may have left earlier figure
  // references in this shared document, and the one just drawn is appended
  // at the (now blank, now-end-of-document) cursor.
  const content = await page.locator('.editor .cm-content').textContent();
  const matches = [...content.matchAll(/figures\/(f-\d+\.svg)/g)];
  const [, name] = matches[matches.length - 1];
  const { strokes } = await sceneOf(page, name);
  const pressures = strokes[0].points.map((p) => p.pressure);

  expect(pressures.every((p) => typeof p === 'number')).toBe(true);
  expect(Math.max(...pressures) - Math.min(...pressures)).toBeGreaterThan(0.3);
});
