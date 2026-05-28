// NOTE: This test requires VS Code Insiders running with the extension installed
// and DevTools Protocol exposed (launch with --inspect-cdp=9222).
// _electron.connectOverCDP does not exist — the correct API is chromium.connectOverCDP().
// Skipped until a proper VS Code CDP test-runner integration is set up.

import { test } from '@playwright/test';

test.describe.skip('Home Page Button Click Test', () => {
  test('should click all home page buttons and measure time', async () => {
    // To re-enable:
    //   1. Start VS Code Insiders with --inspect-cdp=9222
    //   2. Replace _electron.connectOverCDP with:
    //      const browser = await chromium.connectOverCDP('http://localhost:9222');
    //   3. Locate the webview frame and interact with .home-grid-button elements
  });
});
