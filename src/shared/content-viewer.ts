// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * ContentViewer — Flexible webview panel for rendering Markdown or raw HTML.
 *
 * Usage:
 *   import { showContentViewer } from './content-viewer';
 *   showContentViewer({ title, content, isHtml });
 *
 * If isHtml is true, content is rendered as raw HTML.
 * If isHtml is false, content is treated as Markdown and rendered to HTML.
 */

import * as vscode from 'vscode';

import { mdToHtml } from './md-renderer';

let _panel: vscode.WebviewPanel | undefined;

export interface ContentViewerOptions {
    title: string;
    /**
     * Content can be:
     * - string (Markdown or HTML, controlled by isHtml)
     * - ContentViewerSchema (JSON describing blocks)
     */
    content: string | ContentViewerSchema;
    isHtml?: boolean;
}

/**
 * JSON schema for ContentViewer blocks.
 * Each block can be type: 'markdown', 'html', or 'text'.
 */
export interface ContentViewerSchema {
    blocks: Array<
        | { type: 'markdown'; value: string }
        | { type: 'html'; value: string }
        | { type: 'text'; value: string }
    >;
}

export function showContentViewer(opts: ContentViewerOptions): void {
    let html = '';
    if (typeof opts.content === 'string') {
        html = opts.isHtml ? opts.content : mdToHtml(opts.content);
    } else if (opts.content && Array.isArray(opts.content.blocks)) {
        html = opts.content.blocks.map(block => {
            if (block.type === 'markdown') return mdToHtml(block.value);
            if (block.type === 'html') return block.value;
            if (block.type === 'text') return `<pre>${escapeHtml(block.value)}</pre>`;
            return '';
        }).join('\n');
    } else {
        html = '<div style="color:red">Invalid content for ContentViewer</div>';
    }
    if (_panel) {
        _panel.title = `\u{1F4C4} ${opts.title}`;
        _panel.webview.html = buildHtml(opts.title, html);
        _panel.reveal(vscode.ViewColumn.Beside, true);
        return;
    }
    _panel = vscode.window.createWebviewPanel(
        'contentViewer', `\u{1F4C4} ${opts.title}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _panel.webview.html = buildHtml(opts.title, html);
    _panel.onDidDispose(() => { _panel = undefined; });
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
    <style>
    body { font-family: var(--vscode-font-family); font-size: 14px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); margin: 0; padding: 0; }
    #topbar { padding: 10px 18px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); font-weight: bold; font-size: 1.1em; }
    #content { padding: 24px 32px 48px; max-width: 900px; width: 100%; }
    a { color: var(--vscode-textLink-foreground); }
    </style></head><body>
    <div id="topbar">\u{1F4C4} ${title}</div>
    <div id="content">${bodyHtml}</div>
    </body></html>`;
}

export function disposeContentViewer(): void {
    _panel?.dispose();
    _panel = undefined;
}
