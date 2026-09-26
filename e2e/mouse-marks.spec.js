import { test, expect } from '@playwright/test';
import { penStroke } from './pen.js';

// M8: once a real pen has drawn anywhere in the tab, an ordinary mouse marks
// (selects, drags) instead of drawing — a Wacom tablet used next to a mouse
// must not turn an incidental mouse drag into a stroke.
test('a mouse drag after a pen stroke selects instead of drawing, and does not add a stroke', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.editor .cm-content')).toBeVisible();
  await expect(page.locator('.page-stack svg')).toBeVisible({ timeout: 15000 });

  const canvas = page.locator('.pagedraw canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();

  // A real pen stroke first, so the tab has seen a pen (src/strokes.js's
  // module-level penSeen — it never resets).
  await penStroke(page, canvas, [
    [200, 300],
    [240, 310],
    [280, 290],
    [320, 320],
  ]);
  await expect(page.locator('.editor .cm-content')).toContainText(/#place\(.*figures\/(f-\d+)\.svg/);
  const before = await page.locator('.editor .cm-content').textContent();
  const placeCountBefore = (before.match(/#place\(/g) || []).length;

  // A plain mouse drag over empty space, far from the figure just drawn.
  await page.mouse.move(box.x + 700, box.y + 700);
  await page.mouse.down();
  await page.mouse.move(box.x + 760, box.y + 760, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(600); // past the save debounce, in case it wrongly drew

  const after = await page.locator('.editor .cm-content').textContent();
  expect((after.match(/#place\(/g) || []).length).toBe(placeCountBefore);

  // A plain mouse click on the figure just drawn marks it (selects it) —
  // the mouse still marks, it just doesn't draw.
  await page.mouse.click(box.x + 260, box.y + 305);
  await expect(page.locator('.placed-box')).toBeVisible();
});
