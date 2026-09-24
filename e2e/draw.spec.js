import { test, expect } from '@playwright/test';
import { penStroke } from './pen.js';

test('a pen stroke in the drawing mode inserts a figure into the source', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.editor .cm-content')).toBeVisible();

  await page.getByRole('button', { name: /draw/i }).click();
  const canvas = page.locator('.overlay-canvas canvas');
  await expect(canvas).toBeVisible();

  await penStroke(page, canvas, [
    [40, 200],
    [80, 160],
    [120, 200],
    [160, 160],
    [200, 200],
  ]);

  // The stroke landed before Done is even pressed: undo has something to undo.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

  await page.getByRole('button', { name: /^done/i }).click();
  await expect(page.locator('.overlay-canvas canvas')).toHaveCount(0);
  await expect(page.locator('.editor .cm-content')).toContainText(/image\("figures\/f-\d+\.svg"\)/);
});
