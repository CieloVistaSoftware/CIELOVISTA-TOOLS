// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * image-reader.ts
 * Feature: Image Reader Webview
 *
 * Provides a command to open an image reader panel using HTML, CSS, and JS assets.
 * All assets are loaded from src/features/image-reader-assets/.
 *
 * Exports:
 *   - activate(context): Registers the command and webview panel
 *   - deactivate(): Cleans up resources (no-op for this feature)
 */

import * as vscode from 'vscode';
import * as path from 'path';

const COMMAND_ID = 'cvs.imageReader.open';
const PANEL_TITLE = 'Image Reader';

let panel: vscode.WebviewPanel | undefined;

/**
 * Activates the Image Reader feature by registering the command.
 * @param context VS Code extension context
 */
export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(COMMAND_ID, () => {
        if (panel) {
            panel.reveal();
            return;
        }
        panel = vscode.window.createWebviewPanel(
            'imageReader',
            PANEL_TITLE,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'features', 'image-reader-assets'))
                ]
            }
        );
        panel.webview.html = getWebviewContent(context, panel.webview);
        panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
    });
    context.subscriptions.push(disposable);
}

/**
 * Deactivates the Image Reader feature (no-op).
 */
export function deactivate() {
    if (panel) {
        panel.dispose();
        panel = undefined;
    }
}

/**
 * Generates the HTML content for the webview, loading assets from the feature folder.
 * @param context VS Code extension context
 * @param webview The webview instance
 */
function getWebviewContent(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const assetRoot = path.join(context.extensionPath, 'src', 'features', 'image-reader-assets');
    const htmlPath = vscode.Uri.file(path.join(assetRoot, 'image_reader_html.html'));
    const cssPath = vscode.Uri.file(path.join(assetRoot, 'image_reader_css.css'));
    const jsPath = vscode.Uri.file(path.join(assetRoot, 'image_reader_js.js'));

    const cssUri = webview.asWebviewUri(cssPath);
    const jsUri = webview.asWebviewUri(jsPath);

    // Read HTML file and inject correct URIs for CSS/JS
    // (In production, use fs.readFileSync or async read)
    let html = `<!DOCTYPE html><html><head><link rel="stylesheet" href="${cssUri}"></head><body><script src="${jsUri}"></script></body></html>`;
    // TODO: Replace above with actual HTML file content and asset injection
    return html;
}
