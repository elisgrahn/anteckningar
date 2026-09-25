import { test, expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Same folder playwright.config.js points the dev server's file API at.
const DOCUMENT_DIR = path.join(os.tmpdir(), 'anteckningar-e2e-document');

// M4: nothing typed offline is lost, and a stale write never overwrites a
// newer one on disk — it lands as a conflict copy instead.

test('text typed while the server is unreachable reaches it once the network returns', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.editor .cm-content')).toBeVisible();

  await page.route('**/api/doc', (route) => route.abort());

  await page.locator('.editor .cm-content').click();
  await page.keyboard.press('Control+End');
  const marker = `queued-${Date.now()}`;
  await page.keyboard.type(`\n${marker}\n`);

  // Past the 400ms save debounce: the save attempt fails and the line is
  // queued instead of lost, which the status field says so.
  await expect(page.locator('.status')).toContainText('not synced', { timeout: 3000 });

  await page.unroute('**/api/doc');

  // Past a poll interval, the queue gets flushed.
  await expect(page.locator('.status')).not.toContainText('not synced', { timeout: 5000 });
  const state = await page.request.get('/api/state').then((r) => r.json());
  expect(state.source).toContain(marker);
});

test('a write based on a stale version is saved as a conflict copy, not overwriting the newer one', async ({
  request,
}) => {
  const before = await request.get('/api/state').then((r) => r.json());

  const winner = await request
    .put('/api/doc', {
      data: before.source + '\nwriter A\n',
      headers: { 'x-base-mtime': String(before.mtime) },
    })
    .then((r) => r.json());
  expect(winner.conflict).toBeFalsy();

  // Still holds the old mtime, as if it had been queued from before writer A.
  const loser = await request
    .put('/api/doc', {
      data: before.source + '\nwriter B\n',
      headers: { 'x-base-mtime': String(before.mtime) },
    })
    .then((r) => r.json());
  expect(loser.conflict).toBe(true);
  expect(loser.conflictFile).toMatch(/\.conflict-.*\.typ$/);

  const after = await request.get('/api/state').then((r) => r.json());
  expect(after.source).toContain('writer A');
  expect(after.source).not.toContain('writer B');

  // Both versions on disk — the conflict copy has no API route of its own
  // (invariant 3: the server owns the files), so read it straight off disk.
  const conflictContent = await fs.readFile(path.join(DOCUMENT_DIR, loser.conflictFile), 'utf8');
  expect(conflictContent).toContain('writer B');
});
