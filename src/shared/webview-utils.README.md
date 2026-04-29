---
title: feature: shared/webview-utils.ts
description: Shared helpers for building VS Code Webview panel HTML. Any feature that opens a Webview imports from here. No feature rolls its own HTML boilerpla…
project: cielovista-tools
category: 700 — Project Docs
relativePath: src/shared/webview-utils.README.md
created: 2026-04-22
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [webview, utils, readme]
---

# feature: shared/webview-utils.ts

## Purpose

Shared helpers for building VS Code Webview panel HTML. Any feature that opens a Webview imports from here. No feature rolls its own HTML boilerplate, Markdown converter, or CSS reset.

---

## API

### `escapeHtml(text: string): string`

Escapes `&`, `<`, `>`, `"`, and `'` for safe insertion into HTML. Always use this before inserting user-controlled or file-sourced strings into HTML.

```typescript
import { escapeHtml } from '../shared/webview-utils';
const safe = escapeHtml(userInput);
panel.webview.html = `<p>${safe}</p>`;
 ```
---

### `markdownToHtml(md: string): string`

Converts a limited subset of Markdown to HTML. Supported syntax:

| Markdown | Output |
|---|---|
| `# H1` | `<h1>` |
| `## H2` | `<h2>` |
| `### H3` | `<h3>` |
| `**bold**` | `<strong>` |
| `*italic*` | `<em>` |
| `` `inline code` `` | `<code>` |
| `- item` or `* item` | `<li>` |
| `1. item` | `<li>` |
| ` ```lang\ncode\n``` ` | `<pre><code>` |
| Blank line | `</p><p>` |

**Not supported:** tables, blockquotes, links, images. For full Markdown, use a library.

---

### `buildWebviewPage(opts: WebviewOptions): string`

Returns a complete HTML document ready to set as `panel.webview.html`. Automatically applies VS Code CSS variables for theme compatibility (light/dark).

```typescript
import { buildWebviewPage } from '../shared/webview-utils';

panel.webview.html = buildWebviewPage({
    title: 'My Panel',
    bodyHtml: '<h1>Hello</h1><p>Content here</p>',
    scripts: `
        const vscode = acquireVsCodeApi();
        document.getElementById('btn').addEventListener('click', () => {
            vscode.postMessage({ command: 'clicked' });
        });
    `,
});
 ```
**`WebviewOptions` interface:**

```typescript
interface WebviewOptions {
    title:        string;   // <title> and shown in panel header
    bodyHtml:     string;   // HTML inside <body>
    extraStyles?: string;   // Additional CSS injected into <head>
    scripts?:     string;   // JS content (without <script> tags)
}
 ```
**Built-in CSS variables exposed:**

- `--vscode-font-family`, `--vscode-font-size`
- `--vscode-editor-foreground`, `--vscode-editor-background`
- `--vscode-button-background`, `--vscode-button-foreground`, `--vscode-button-hoverBackground`
- `--vscode-panel-border`, `--vscode-input-background`, `--vscode-input-foreground`
- `.card` — bordered card container
- `.muted` — de-emphasised text
- `.actions` — flex row for buttons

---

### `buildMarkdownPage(title, markdown, scripts?): string`

Convenience wrapper that converts a Markdown string and wraps it in a full page. Use for simple read-only content panels.

```typescript
import { buildMarkdownPage } from '../shared/webview-utils';
panel.webview.html = buildMarkdownPage('Copilot Rules', rulesMarkdown);
 ```
---

## Security note

VS Code Webview panels run in a sandboxed iframe. All user-controlled content **must** be escaped with `escapeHtml()` before insertion. Scripts must use `acquireVsCodeApi()` to communicate back to the extension host — they cannot call Node.js APIs directly.

---

## What it does

_TODO: one paragraph describing the single responsibility of this file._

---

## Internal architecture

 ```
activate()
  └── TODO: describe call flow
 ```
---

## Manual test

1. TODO: step one
2. TODO: step two
3. TODO: expected result
