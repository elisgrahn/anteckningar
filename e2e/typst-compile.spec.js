import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Invariant 1: typst compile document/main.typ must work with no patches, no
// plugins, no private compiler — the real binary, on the real file on disk.
test('typst compile succeeds on the checked-in document', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'typst-ci-')), 'out.pdf');
  execFileSync('typst', ['compile', 'document/main.typ', out, '--font-path', 'public/fonts'], { stdio: 'pipe' });
});
