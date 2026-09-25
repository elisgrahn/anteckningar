import { test, expect } from '@playwright/test';
import { penStroke } from './pen.js';

// Reads a figure's embedded scene back out, the same way src/ink.js does.
async function sceneOf(page, name) {
  const res = await page.request.get(`/api/figure/${name}`);
  const { svg } = await res.json();
  const i = svg.indexOf('<!--scene:');
  const j = svg.indexOf('-->', i);
  return JSON.parse(svg.slice(i + '<!--scene:'.length, j).replace(/- -/g, '--'));
}

test('a second pen stroke on top of a placed figure continues it instead of starting a new one', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.editor .cm-content')).toBeVisible();
  await expect(page.locator('.page-stack svg')).toBeVisible({ timeout: 15000 });

  const canvas = page.locator('.pagedraw canvas');
  await expect(canvas).toBeVisible();

  // First stroke: blank page, so it becomes a new placed figure.
  await penStroke(page, canvas, [
    [200, 300],
    [240, 310],
    [280, 290],
    [320, 320],
  ]);
  await expect(page.locator('.editor .cm-content')).toContainText(/#place\(.*figures\/(f-\d+)\.svg/);

  const content = await page.locator('.editor .cm-content').textContent();
  const [, name] = content.match(/figures\/(f-\d+\.svg)/);
  expect((content.match(/#place\(/g) || []).length).toBe(1);
  expect((await sceneOf(page, name)).strokes).toHaveLength(1);

  // Second stroke starts inside the same figure's rectangle (same spot the
  // first one was drawn at) — it should land inside the pen-down-continuation
  // check and grow the existing figure rather than create figures/f-02.svg.
  await penStroke(page, canvas, [
    [210, 305],
    [250, 330],
    [290, 305],
  ]);

  // Give the 400 ms save debounce time to land, then check the figure grew
  // instead of a second #place line appearing.
  await expect
    .poll(async () => (await sceneOf(page, name)).strokes.length, { timeout: 5000 })
    .toBe(2);

  const after = await page.locator('.editor .cm-content').textContent();
  expect((after.match(/#place\(/g) || []).length).toBe(1);
});
