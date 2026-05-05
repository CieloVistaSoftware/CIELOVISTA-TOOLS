// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * doc-catalog — activate/deactivate only.
 *
 * Responsibilities split into:
 *   types.ts      — shared interfaces
 *   registry.ts   — loadRegistry
 *   content.ts    — text extraction, esc, extractTitle, extractDescription, extractTags
 *   categories.ts — Dewey category assignment
 *   scanner.ts    — scanForCards (walks disk)
 *   projects.ts   — loadProjectInfo, buildProjectsSectionHtml
 *   html.ts       — buildCatalogHtml (pure HTML string builder)
 *   commands.ts   — buildCatalog, openCatalog, viewSpecificDoc
 */
import * as vscode from 'vscode';
import { log } from '../../shared/output-channel';
import { openCatalog, viewSpecificDoc, clearCachedCards, rebuildCatalog, deserializeCatalogPanel, disposeViewServer, viewArchivedCatalog } from './commands';

const FEATURE = 'doc-catalog';

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');

    vscode.window.registerWebviewPanelSerializer('docCatalog', {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
            deserializeCatalogPanel(panel);
        }
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.catalog.open',           () => openCatalog(false)),
        vscode.commands.registerCommand('cvs.catalog.rebuild',        rebuildCatalog),
        vscode.commands.registerCommand('cvs.catalog.view',           viewSpecificDoc),
        vscode.commands.registerCommand('cvs.catalog.viewArchived',   viewArchivedCatalog),
    );
}

export function deactivate(): void {
    log(FEATURE, 'Deactivating');
    disposeViewServer();
}
