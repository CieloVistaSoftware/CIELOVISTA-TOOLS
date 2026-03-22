// Playwright test: Click every CieloVista Tools card button and assert webview opens
// This test assumes Playwright is set up for VS Code extension UI testing
// and your extension is installed and activated.

import { test, expect } from '@playwright/test';

// Utility: Wait for a webview with a given title to appear
async function waitForWebviewWithTitle(page, title, timeout = 10000) {
  await expect(
    page.locator(`.webview .monaco-workbench .webview-title:has-text("${title}")`)
  ).toBeVisible({ timeout });
}

test('All CieloVista Tools card buttons open a webview', async ({ page }) => {
  // 1. Open the CieloVista Tools launcher (assume command palette or sidebar icon)
  // This step may need to be customized for your UI:
  await page.keyboard.press('F1');
  await page.keyboard.type('CieloVista Tools: Open Launcher');
  await page.keyboard.press('Enter');

  // 2. Wait for the launcher to appear
  await expect(page.locator('.cielovista-launcher')).toBeVisible();

  // 3. Find all card action buttons (e.g., .cielovista-card .action-button)
  const buttons = await page.locator('.cielovista-card .action-button').elementHandles();
  expect(buttons.length).toBeGreaterThan(0);

  // 4. Click each button and assert a webview opens
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    // Get the card title for feedback
    const cardTitle = await button.evaluate(el => el.closest('.cielovista-card').querySelector('.card-title').textContent.trim());
    console.log(`\n[TEST] Clicking card: ${cardTitle}`);
    await button.click();

    // Wait for a webview to open (title should match card or generic webview)
    // You may need to adjust the selector or logic for your extension
    await page.waitForTimeout(500); // Give time for webview to open
    const webviewPanels = await page.locator('.webview').all();
    expect(webviewPanels.length).toBeGreaterThan(0);
    // Optionally, check the webview content or title
    // Print feedback to console
    console.log(`[PASS] Webview opened for card: ${cardTitle}`);

    // Optionally, close the webview before next click
    // await page.keyboard.press('Escape');
  }

  console.log('\n[TEST COMPLETE] All card buttons opened a webview.');
});
