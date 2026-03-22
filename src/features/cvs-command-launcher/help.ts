// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError }                from '../../shared/output-channel';
import { buildHelpPanelHtml, extractCommandIds } from '../../shared/help-panel';
import { CATALOG }                      from './catalog';
import type { CmdEntry }                from './types';

const FEATURE = 'cvs-command-launcher';

export let _helpPanel: vscode.WebviewPanel | undefined;

export function openHelpPanel(docPath: string, launcherPanel: vscode.WebviewPanel): void {
    if (!fs.existsSync(docPath)) {
        vscode.window.showWarningMessage(`Help doc not found: ${docPath}`);
        return;
    }
    const markdown    = fs.readFileSync(docPath, 'utf8');
    const cmdIds      = extractCommandIds(markdown);
    const cmdEntries  = cmdIds
        .map(id => CATALOG.find(c => c.id === id))
        .filter((c): c is CmdEntry => !!c)
        .map(c => ({ id: c.id, title: c.title, description: c.description, dewey: c.dewey }));

    const h1Match    = markdown.match(/^#\s+(.+)$/m);
    const featureName = h1Match ? h1Match[1].replace(/^feature:\s*/i, '') : path.basename(docPath, '.README.md');
    const html        = buildHelpPanelHtml(markdown, cmdEntries, featureName);

    if (_helpPanel) {
        _helpPanel.webview.html = html;
        _helpPanel.reveal(vscode.ViewColumn.Beside);
        return;
    }

    _helpPanel = vscode.window.createWebviewPanel(
        'cvsHelp', `📄 ${featureName}`, vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: false }
    );
    _helpPanel.webview.html = html;
    _helpPanel.onDidDispose(() => { _helpPanel = undefined; });

    _helpPanel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'back') { _helpPanel?.dispose(); launcherPanel.reveal(); return; }
        if (msg.command !== 'run' || !msg.id) { return; }
        const entry = CATALOG.find(c => c.id === msg.id);
        const title = entry?.title ?? msg.id;
        try {
            log(FEATURE, `Help panel executing: ${msg.id}`);
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Running: ${title}`, cancellable: false },
                async () => { await vscode.commands.executeCommand(msg.id); }
            );
            _helpPanel?.webview.postMessage({ type: 'done', title });
        } catch (err) {
            logError(FEATURE, `Failed to execute ${msg.id}`, err);
            _helpPanel?.webview.postMessage({ type: 'error', title, message: String(err) });
        }
    });
}
