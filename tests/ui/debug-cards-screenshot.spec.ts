// Playwright debug test: Take a screenshot after opening the launcher to verify .cmd-card rendering
// Run: npx playwright test tests/ui/debug-cards-screenshot.spec.ts --headed

import { test, expect } from '@playwright/test';

test('Launcher screenshot for .cmd-card debug', async ({ page }) => {
  await page.keyboard.press('F1');
  await page.keyboard.type('CieloVista Tools: Open Launcher');
  await page.keyboard.press('Enter');
  // Wait a bit for UI to render
  await page.waitForTimeout(2000);
  // Take a screenshot of the visible area
  await page.screenshot({ path: 'launcher-debug.png', fullPage: true });
  // Try to find any .cmd-card
  const cardCount = await page.locator('.cmd-card').count();
  console.log('Found .cmd-card count:', cardCount);
  expect(cardCount).toBeGreaterThan(0);
});
