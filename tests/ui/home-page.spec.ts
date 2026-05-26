import { test, expect, Page, _electron } from '@playwright/test';
import { webviewLocator } from '../utils/webview-locator';

// This test demonstrates how to interact with a VS Code webview using Playwright.
// It requires a running instance of VS Code with the extension loaded.
test.describe('Home Page Button Click Test', () => {
  let page: Page;

  test.beforeAll(async () => {
    // Connect to the running VS Code instance
    const electronApp = await _electron.connectOverCDP(9222);
    const context = electronApp.context();
    
    // Find the webview page. This might need adjustment if multiple webviews are open.
    page = await webviewLocator(context);
    expect(page).toBeTruthy();
  });

  test('should click all home page buttons and measure time', async () => {
    const startTime = Date.now();
    console.log(`[bg-health-runner] Home Page UI Test: Starting at ${new Date(startTime).toISOString()}`);

    // The home page should already be open from the test setup or a previous command.
    // If not, we would need a way to trigger it. For now, we assume it's visible.
    
    // Wait for the webview to load and for the buttons to be present.
    await page.waitForSelector('.home-grid-button');

    const buttons = await page.locator('.home-grid-button').all();
    expect(buttons.length).toBeGreaterThan(0);

    console.log(`[bg-health-runner] Found ${buttons.length} buttons to click.`);

    for (const button of buttons) {
        const buttonText = await button.innerText();
        try {
            console.log(`[bg-health-runner] Clicking button: ${buttonText}`);
            await button.click();
            // Add a small delay to allow the UI to react.
            await page.waitForTimeout(500); 
        } catch (error) {
            console.error(`[bg-health-runner] Error clicking button "${buttonText}":`, error);
        }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[bg-health-runner] Home Page UI Test: Finished at ${new Date(endTime).toISOString()}`);
    console.log(`[bg-health-runner] Total execution time: ${duration}ms`);

    expect(duration).toBeLessThan(30000); // Fail if it takes longer than 30 seconds
  });
});
