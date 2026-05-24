import { BrowserContext, Page } from '@playwright/test';

/**
 * Finds the webview page in the given browser context.
 * VS Code webviews are not standard browser pages, so we need to iterate
 * through all pages to find the one that hosts the webview content.
 * 
 * @param context The Playwright BrowserContext.
 * @returns A Promise that resolves to the webview Page object, or undefined if not found.
 */
export async function webviewLocator(context: BrowserContext): Promise<Page | undefined> {
  for (const p of context.pages()) {
    // Webviews in VS Code are hosted in an iframe with a specific src attribute.
    // We can look for this pattern to identify the webview page.
    const isWebview = await p.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe.webview.ready'));
      return iframes.some(iframe => (iframe as HTMLIFrameElement).src.startsWith('vscode-webview://'));
    });

    if (isWebview) {
      // The actual content is inside the iframe, so we need to get the frame's page.
      const webviewFrame = p.frameLocator('iframe.webview.ready');
      // This is a bit of a simplification. In reality, we might need to handle the frame's content directly.
      // For this test, we assume the frame's page is what we need.
      return p;
    }
  }
  return undefined;
}
