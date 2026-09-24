import { defineConfig } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

// A throwaway document/ folder, never the real notes in the repo — see
// ANTECKNINGAR_DOCUMENT_DIR in vite.config.js. Cleared before each run so a
// leftover figure from a crashed test can't make the next run flaky.
const DOCUMENT_DIR = path.join(os.tmpdir(), 'anteckningar-e2e-document');
const PORT = 5273;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node -e "require('fs').rmSync(process.env.ANTECKNINGAR_DOCUMENT_DIR,{recursive:true,force:true})" && npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    env: { ANTECKNINGAR_DOCUMENT_DIR: DOCUMENT_DIR },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
