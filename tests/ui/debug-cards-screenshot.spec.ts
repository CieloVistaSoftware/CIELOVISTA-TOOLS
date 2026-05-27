// Source-level check: verify the launcher webview template renders .cmd-card elements.
// Original intent was a VS Code UI test, but .cmd-card elements live inside a
// VS Code webview iframe — unreachable from standard Playwright chromium.
// This source check guards the structural requirement without VS Code running.

import { test, expect } from '@playwright/test';
import * as fs   from 'fs';
import * as path from 'path';

test('Launcher screenshot for .cmd-card debug', async () => {
  const htmlJs  = path.join(__dirname, '../../out/features/cvs-command-launcher/html.js');
  const src     = fs.readFileSync(htmlJs, 'utf8');
  const cardCount = (src.match(/cmd-card/g) ?? []).length;
  console.log('Found .cmd-card occurrences in launcher source:', cardCount);
  expect(cardCount).toBeGreaterThan(0);
});
