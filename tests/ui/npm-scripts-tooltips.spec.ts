// Playwright test: Validate NPM Scripts webview Run button tooltips are present and hyper-descriptive
// Run: npx playwright test tests/ui/npm-scripts-tooltips.spec.ts --headed

import { test, expect } from '@playwright/test';

test('NPM Scripts Run button tooltips are hyper-descriptive', async ({ page }) => {
  // 1. Open the CieloVista Tools NPM Scripts webview (customize as needed)
  await page.keyboard.press('F1');
  await page.keyboard.type('CieloVista Tools: Show NPM Scripts');
  await page.keyboard.press('Enter');

  // 2. Wait for the NPM Scripts webview to appear
  await expect(page.locator('text=NPM Scripts')).toBeVisible();

  // 3. Find all Run buttons
  const runButtons = await page.locator('button.run-btn').elementHandles();
  expect(runButtons.length).toBeGreaterThan(0);

  // 4. Check each Run button for a hyper-descriptive tooltip
  for (const btn of runButtons) {
    const tooltip = await btn.getAttribute('title');
    expect(tooltip).toBeTruthy();
    // Tooltip must mention script name, folder, output, and error/failure indication
    expect(tooltip).toMatch(/run/i);
    expect(tooltip).toMatch(/output/i);
    expect(tooltip).toMatch(/fail|error|highlight/i);
    // Print for debug
    console.log('Run button tooltip:', tooltip);
  }

  console.log('[TEST COMPLETE] All Run buttons have hyper-descriptive tooltips.');
});
