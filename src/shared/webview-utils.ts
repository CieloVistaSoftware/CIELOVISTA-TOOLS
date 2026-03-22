// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * webview-utils.ts
 *
 * THE single source of truth for all CieloVista webview panel HTML.
 *
 * Rule: every feature that renders a WebviewPanel uses this module.
 *       No feature defines its own CSS, toolbar, button styles, or status bar.
 *
 * Design tokens (all use VS Code CSS variables for automatic light/dark support):
 *
 *   Buttons     .cvs-btn            — primary action
 *               .cvs-btn-secondary  — secondary / neutral
 *               .cvs-btn-sm         — small inline (tables, cards)
 *               .cvs-btn-ghost      — dashed outline (optional / create actions)
 *
 *   Toolbar     .cvs-toolbar        — sticky top bar with title + controls
 *   Status      .cvs-status         — inline feedback strip below toolbar
 *   Cards       .cvs-card           — bordered content card
 *               .cvs-card-grid      — auto-fill responsive card grid
 *   Tables      .cvs-table          — full-width bordered table
 *   Badges      .cvs-badge          — small rounded label (counts, types)
 *               .cvs-pill           — outlined pill (status indicators)
 *               .cvs-pill-ok        — green pill
 *               .cvs-pill-warn      — amber pill
 *               .cvs-pill-error     — red pill
 *   Tags        .cvs-tag            — small keyword chip (read-only)
 *   Section     .cvs-section        — grouped block with heading + count
 *
 *   Severity    .cvs-err / .cvs-warn / .cvs-info — coloured dot + text rows
 */

// ─── HTML escaping ────────────────────────────────────────────────────────────

export function esc(s: string): string {
    return String(s)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#039;');
}

// ─── Shared CSS design system ─────────────────────────────────────────────────

export const CVS_CSS = `
/* ── Reset ── */
*{box-sizing:border-box;margin:0;padding:0}

/* ── Base ── */
body{
  font-family:var(--vscode-font-family);
  font-size:13px;
  color:var(--vscode-editor-foreground);
  background:var(--vscode-editor-background);
  line-height:1.5;
}

/* ── Buttons ── */
.cvs-btn,
.cvs-btn-secondary,
.cvs-btn-sm,
.cvs-btn-ghost{
  border:none;
  border-radius:3px;
  cursor:pointer;
  font-family:inherit;
  font-weight:600;
  letter-spacing:0.02em;
  transition:opacity 0.1s, background 0.1s;
  white-space:nowrap;
  display:inline-flex;
  align-items:center;
  gap:4px;
}
.cvs-btn{
  background:var(--vscode-button-background);
  color:var(--vscode-button-foreground);
  padding:5px 14px;
  font-size:12px;
}
.cvs-btn:hover{background:var(--vscode-button-hoverBackground)}
.cvs-btn:active{opacity:0.8}
.cvs-btn:disabled{opacity:0.45;cursor:not-allowed}

.cvs-btn-secondary{
  background:var(--vscode-button-secondaryBackground);
  color:var(--vscode-button-secondaryForeground);
  padding:5px 12px;
  font-size:12px;
}
.cvs-btn-secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
.cvs-btn-secondary:active{opacity:0.8}
.cvs-btn-secondary:disabled{opacity:0.45;cursor:not-allowed}

.cvs-btn-sm{
  background:var(--vscode-button-secondaryBackground);
  color:var(--vscode-button-secondaryForeground);
  padding:2px 8px;
  font-size:11px;
  font-weight:500;
}
.cvs-btn-sm:hover{background:var(--vscode-button-secondaryHoverBackground)}
.cvs-btn-sm:active{opacity:0.8}

.cvs-btn-ghost{
  background:transparent;
  color:var(--vscode-button-secondaryForeground);
  padding:4px 10px;
  font-size:12px;
  border:1px dashed var(--vscode-focusBorder);
  opacity:0.75;
}
.cvs-btn-ghost:hover{opacity:1;background:var(--vscode-button-secondaryBackground)}

/* ── Toolbar ── */
.cvs-toolbar{
  position:sticky;
  top:0;
  z-index:50;
  background:var(--vscode-editor-background);
  border-bottom:1px solid var(--vscode-panel-border);
  padding:8px 16px;
  display:flex;
  gap:8px;
  align-items:center;
  flex-wrap:wrap;
}
.cvs-toolbar-title{
  font-size:1.05em;
  font-weight:700;
  white-space:nowrap;
  margin-right:4px;
}
.cvs-toolbar-spacer{flex:1;min-width:8px}
.cvs-toolbar-stat{
  font-size:11px;
  color:var(--vscode-descriptionForeground);
  white-space:nowrap;
}

/* ── Search input ── */
.cvs-search{
  flex:1;
  min-width:160px;
  padding:4px 9px;
  background:var(--vscode-input-background);
  color:var(--vscode-input-foreground);
  border:1px solid var(--vscode-input-border);
  border-radius:3px;
  font-size:12px;
  font-family:inherit;
}
.cvs-search:focus{outline:1px solid var(--vscode-focusBorder)}

/* ── Select dropdown ── */
.cvs-select{
  padding:4px 8px;
  background:var(--vscode-dropdown-background);
  color:var(--vscode-dropdown-foreground);
  border:1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
  border-radius:3px;
  font-size:12px;
  font-family:inherit;
  cursor:pointer;
}

/* ── Status bar ── */
.cvs-status{
  padding:6px 16px;
  font-size:12px;
  border-left:3px solid var(--vscode-focusBorder);
  background:var(--vscode-textCodeBlock-background);
  margin:8px 16px 0;
  border-radius:2px;
  display:none;
}
.cvs-status.visible{display:block}

/* Fixed bottom status strip (for long-running ops) */
.cvs-status-strip{
  position:fixed;
  bottom:0;left:0;right:0;
  padding:6px 16px;
  font-size:12px;
  background:var(--vscode-statusBar-background);
  color:var(--vscode-statusBar-foreground);
  border-top:1px solid var(--vscode-panel-border);
  display:none;
  align-items:center;
  gap:8px;
  z-index:100;
}
.cvs-status-strip.visible{display:flex}
.cvs-spin{
  display:inline-block;
  animation:cvs-spin 1s linear infinite;
}
@keyframes cvs-spin{to{transform:rotate(360deg)}}

/* ── Cards ── */
.cvs-card-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
  gap:10px;
}
.cvs-card{
  background:var(--vscode-textCodeBlock-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:4px;
  padding:10px 12px;
  display:flex;
  flex-direction:column;
  gap:5px;
  transition:border-color 0.12s;
}
.cvs-card:hover{border-color:var(--vscode-focusBorder)}
.cvs-card.hidden{display:none}
.cvs-card-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:6px;
}
.cvs-card-label{
  font-size:10px;
  font-weight:700;
  color:var(--vscode-textLink-foreground);
  text-transform:uppercase;
  letter-spacing:0.05em;
}
.cvs-card-meta{
  font-size:10px;
  color:var(--vscode-descriptionForeground);
}
.cvs-card-title{
  font-weight:700;
  font-size:0.93em;
  line-height:1.3;
}
.cvs-card-subtitle{
  font-family:var(--vscode-editor-font-family);
  font-size:10px;
  color:var(--vscode-descriptionForeground);
}
.cvs-card-desc{
  font-size:11px;
  line-height:1.5;
  opacity:0.85;
  flex:1;
}
.cvs-card-path{
  font-family:var(--vscode-editor-font-family);
  font-size:9px;
  color:var(--vscode-descriptionForeground);
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.cvs-card-footer{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-top:4px;
  flex-wrap:wrap;
  gap:4px;
}
.cvs-card-actions{display:flex;gap:4px;flex-wrap:wrap}

/* ── Tables ── */
.cvs-table{
  width:100%;
  border-collapse:collapse;
  font-size:12px;
}
.cvs-table th{
  text-align:left;
  padding:6px 10px;
  background:var(--vscode-textCodeBlock-background);
  border-bottom:2px solid var(--vscode-focusBorder);
  font-weight:700;
  white-space:nowrap;
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:0.04em;
}
.cvs-table td{
  padding:7px 10px;
  border-bottom:1px solid var(--vscode-panel-border);
  vertical-align:top;
}
.cvs-table tr:hover td{background:var(--vscode-list-hoverBackground)}

/* ── Badges & pills ── */
.cvs-badge{
  display:inline-block;
  background:var(--vscode-badge-background);
  color:var(--vscode-badge-foreground);
  border-radius:10px;
  padding:1px 7px;
  font-size:0.8em;
  font-weight:600;
}
.cvs-pill{
  display:inline-block;
  padding:3px 10px;
  border-radius:12px;
  font-size:11px;
  font-weight:600;
  border:1px solid var(--vscode-panel-border);
  color:var(--vscode-descriptionForeground);
}
.cvs-pill-ok{
  border-color:var(--vscode-testing-iconPassed);
  color:var(--vscode-testing-iconPassed);
}
.cvs-pill-warn{
  border-color:var(--vscode-inputValidation-warningBorder,#cca700);
  color:var(--vscode-inputValidation-warningForeground,#cca700);
}
.cvs-pill-error{
  border-color:var(--vscode-inputValidation-errorBorder,#f48771);
  color:var(--vscode-inputValidation-errorForeground,#f48771);
}

/* ── Tags ── */
.cvs-tag{
  display:inline-block;
  font-size:9px;
  padding:1px 6px;
  border-radius:3px;
  background:var(--vscode-editor-background);
  border:1px solid var(--vscode-panel-border);
  color:var(--vscode-descriptionForeground);
  cursor:pointer;
}
.cvs-tag:hover{border-color:var(--vscode-focusBorder)}
.cvs-tag-row{display:flex;flex-wrap:wrap;gap:3px}

/* ── Sections ── */
.cvs-section{margin-bottom:28px}
.cvs-section.hidden{display:none}
.cvs-section-heading{
  font-size:0.95em;
  font-weight:700;
  border-bottom:2px solid var(--vscode-focusBorder);
  padding-bottom:5px;
  margin-bottom:10px;
  display:flex;
  align-items:center;
  gap:8px;
}

/* ── Severity rows ── */
.cvs-issue{
  font-size:11px;
  line-height:1.6;
  display:flex;
  gap:5px;
  align-items:flex-start;
  flex-wrap:wrap;
  margin-bottom:2px;
}
.cvs-issue-file{
  font-family:var(--vscode-editor-font-family);
  font-weight:700;
  color:var(--vscode-textLink-foreground);
}

/* ── Link-style button ── */
.cvs-link-btn{
  background:none;
  border:none;
  color:var(--vscode-textLink-foreground);
  cursor:pointer;
  font-size:inherit;
  font-weight:700;
  padding:0;
  text-decoration:underline;
  font-family:inherit;
}
.cvs-link-btn:hover{opacity:0.8}

/* ── Content area ── */
.cvs-content{padding:12px 16px 48px}
`;

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export interface PageOptions {
    /** Page title shown in the browser tab (not the panel tab) */
    title: string;
    /** HTML for the <body> — toolbar, content, etc. */
    body: string;
    /** Extra CSS appended after CVS_CSS */
    extraCss?: string;
    /** JS placed inside an IIFE <script> block at the end of <body> */
    script?: string;
}

/**
 * Wraps content in a complete HTML document using the CieloVista design system.
 * Every panel should call this — never write raw <!DOCTYPE html> in a feature.
 */
export function cvsPage(opts: PageOptions): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<style>
${CVS_CSS}
${opts.extraCss ?? ''}
</style>
</head>
<body>
${opts.body}
${opts.script ? `<script>\n(function(){\n'use strict';\n${opts.script}\n})();\n</script>` : ''}
</body>
</html>`;
}

// ─── Common toolbar builder ───────────────────────────────────────────────────

export interface ToolbarItem {
    /** Raw HTML to insert — use cvsBtn() helpers for buttons */
    html: string;
}

/**
 * Builds a standard sticky toolbar.
 *
 * @param title   Panel title with emoji, e.g. "🛒 Marketplace Compliance"
 * @param items   Array of HTML snippets for controls (buttons, pills, search, etc.)
 */
export function cvsToolbar(title: string, items: string[]): string {
    return `<div class="cvs-toolbar">
  <span class="cvs-toolbar-title">${esc(title)}</span>
  ${items.join('\n  ')}
</div>`;
}

// ─── Button helpers ───────────────────────────────────────────────────────────

export function cvsBtn(label: string, attrs = ''): string {
    return `<button class="cvs-btn" ${attrs}>${label}</button>`;
}
export function cvsBtnSecondary(label: string, attrs = ''): string {
    return `<button class="cvs-btn-secondary" ${attrs}>${label}</button>`;
}
export function cvsBtnSm(label: string, attrs = ''): string {
    return `<button class="cvs-btn-sm" ${attrs}>${label}</button>`;
}
export function cvsBtnGhost(label: string, attrs = ''): string {
    return `<button class="cvs-btn-ghost" ${attrs}>${label}</button>`;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

/** Inline status bar (below toolbar, above content) */
export function cvsStatusBar(id = 'cvs-status'): string {
    return `<div id="${id}" class="cvs-status"></div>`;
}

/** Fixed-bottom status strip for long-running operations */
export function cvsStatusStrip(): string {
    return `<div id="cvs-status-strip" class="cvs-status-strip">
  <span class="cvs-spin">&#9696;</span>
  <span id="cvs-strip-text">Running&#8230;</span>
  <span id="cvs-strip-cmd" style="opacity:0.7"></span>
</div>`;
}

// ─── Badge / pill helpers ─────────────────────────────────────────────────────

export function cvsBadge(text: string | number): string {
    return `<span class="cvs-badge">${esc(String(text))}</span>`;
}
export function cvsPill(text: string, variant: 'ok' | 'warn' | 'error' | '' = ''): string {
    const cls = variant ? ` cvs-pill-${variant}` : '';
    return `<span class="cvs-pill${cls}">${esc(text)}</span>`;
}

// ─── Markdown → HTML ─────────────────────────────────────────────────────────

/**
 * Converts a README-style subset of Markdown to HTML.
 * Used by the doc catalog viewer and anywhere else markdown is rendered inline.
 */
export function mdToHtml(md: string): string {
    return md
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/```(\w*)\n([\s\S]*?)```/gm, '<pre><code class="lang-$1">$2</code></pre>')
        .replace(/```([\s\S]*?)```/gm, '<pre><code>$1</code></pre>')
        .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^---+$/gm, '<hr>')
        .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        .replace(/^\* (.+)$/gm, '<li>$1</li>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/^\|(.+)\|$/gm, (row) => {
            const cells = row.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
            return `<tr>${cells}</tr>`;
        })
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<[hlbptcr])(.+)$/gm, '$1<br>');
}

// ─── Standard JS snippets ─────────────────────────────────────────────────────

/**
 * JS to manage the inline status bar (.cvs-status).
 * Inject into every panel's script block.
 *
 * Usage in webview JS:
 *   setStatus('text');           — shows text
 *   setStatus('text', 'ok');    — green
 *   setStatus('text', 'error'); — red
 *   clearStatus();
 */
export const CVS_STATUS_JS = `
function setStatus(text, variant) {
  var el = document.getElementById('cvs-status');
  if (!el) { return; }
  el.textContent = text;
  el.className = 'cvs-status visible';
  if (variant === 'ok')    { el.style.borderColor = 'var(--vscode-testing-iconPassed)'; }
  else if (variant === 'error') { el.style.borderColor = 'var(--vscode-inputValidation-errorBorder,#f48771)'; }
  else                     { el.style.borderColor = 'var(--vscode-focusBorder)'; }
}
function clearStatus() {
  var el = document.getElementById('cvs-status');
  if (el) { el.className = 'cvs-status'; el.textContent = ''; }
}
`;

/**
 * JS to manage the fixed-bottom status strip (.cvs-status-strip).
 * Inject when a panel has long-running operations.
 *
 * Usage: showStrip('label', 'cmd text')  /  hideStrip()
 */
// ─── Backward-compatible aliases (for existing callers) ─────────────────────
export const escapeHtml = esc;
export function buildWebviewPage(opts: { title: string; bodyHtml: string; extraStyles?: string; scripts?: string }): string {
    return cvsPage({ title: opts.title, body: opts.bodyHtml, extraCss: opts.extraStyles, script: opts.scripts });
}
export function buildMarkdownPage(title: string, markdown: string, scripts?: string): string {
    return cvsPage({ title, body: `<h1>${esc(title)}</h1><div class="cvs-content"><p>${mdToHtml(markdown)}</p></div>`, script: scripts });
}

export const CVS_STRIP_JS = `
function showStrip(text, cmd) {
  document.getElementById('cvs-status-strip').classList.add('visible');
  document.getElementById('cvs-strip-text').textContent = text || 'Running\u2026';
  document.getElementById('cvs-strip-cmd').textContent  = cmd  || '';
}
function hideStrip() {
  document.getElementById('cvs-status-strip').classList.remove('visible');
}
`;
