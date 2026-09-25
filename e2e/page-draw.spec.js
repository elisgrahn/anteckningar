import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { penStroke } from './pen.js';

// M7: a whole handwritten page is a figure wrapped in #pagebreak() on both
// sides, so it lands on its own page instead of flowing into the text.
test('New page inserts a figure wrapped in #pagebreak()', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.editor .cm-content')).toBeVisible();

  await page.getByRole('button', { name: 'New page' }).click();
  const canvas = page.locator('.overlay-canvas .sheet canvas');
  await expect(canvas).toBeVisible();

  await penStroke(page, canvas, [
    [40, 200],
    [80, 160],
    [120, 200],
    [160, 160],
  ]);

  await page.getByRole('button', { name: /^done/i }).click();
  await expect(page.locator('.overlay-canvas')).toHaveCount(0);
  await expect(page.locator('.editor .cm-content')).toContainText(
    /#pagebreak\(\)\s*#image\("figures\/f-\d+\.svg"\)\s*#pagebreak\(\)/,
  );
});

// The other half of M7's criterion: typst compile actually gives the figure
// its own page. Real typst binary, a minimal fixture, not the app's own
// browser-side wasm compiler.
test('a page-wrapped figure lands on its own page under real typst compile', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'typst-page-'));
  mkdirSync(path.join(dir, 'figures'));
  writeFileSync(
    path.join(dir, 'main.typ'),
    [
      '#set page(paper: "a4")',
      '#set text(size: 11pt)',
      '',
      '= Before',
      '',
      'Some text before the page.',
      '',
      '#pagebreak()',
      '#image("figures/f-01.svg")',
      '#pagebreak()',
      '',
      '= After',
      '',
      'Some text after the page.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    path.join(dir, 'figures', 'f-01.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="595.3pt" height="841.9pt" viewBox="0 0 1190 1684">' +
      '<path d="M 100 100 Q 100 100 150 150 Q 150 150 200 100" fill="#16233d"/></svg>',
  );

  execFileSync('typst', ['compile', path.join(dir, 'main.typ'), path.join(dir, 'out-{p}.png'), '--font-path', 'public/fonts'], {
    stdio: 'pipe',
  });
  const pages = readdirSync(dir).filter((f) => /^out-\d+\.png$/.test(f));
  expect(pages).toHaveLength(3); // Before, the drawn page, After
});
