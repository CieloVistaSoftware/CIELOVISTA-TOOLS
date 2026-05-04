// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * help-panel.ts
 *
 * Renders a feature's .README.md as a proper VS Code webview panel.
 *
 * Layout:
 *   ┌─ Toolbar ────────────────────────────────────────────────────┐
 *   │  ← Back   📄 Feature Name                  [✕ Close]        │
 *   ├─ Quick Actions ──────────────────────────────────────────────┤
 *   │  Card per command: title · description · [▶ Run]            │
 *   ├─ Full Documentation ─────────────────────────────────────────┤
 *   │  Rendered README markdown                                    │
 *   │  command: links → inline [▶ Run] buttons (no security risk) │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Run buttons post { command: 'run', id: 'cvs.xxx' } back to the
 * extension host — identical to the launcher's message protocol.
 */

import { esc, CVS_CSS } from './webview-utils';

export interface HelpCmdEntry {
    id:          string;
    title:       string;
    description: string;
    dewey?:      string;
}

// ─── Command ID extraction ────────────────────────────────────────────────────

/**
 * Extracts all `cvs.*` command IDs from raw README markdown.
 * Finds both `command:cvs.xxx` URI links and bare `cvs.xxx` backtick patterns.
 */
export function extractCommandIds(markdown: string): string[] {
    const found = new Set<string>();

    // Pattern 1: command: URI links  → [text](command:cvs.xxx)
    const uriRe = /\(command:(cvs\.[a-zA-Z0-9_.]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = uriRe.exec(markdown)) !== null) { found.add(m[1]); }

    // Pattern 2: bare backtick IDs in tables or text → `cvs.xxx.yyy`
    const btRe = /`(cvs\.[a-zA-Z0-9_.]+)`/g;
    while ((m = btRe.exec(markdown)) !== null) { found.add(m[1]); }

    return [...found];
}

// ─── Markdown → HTML (help-aware) ─────────────────────────────────────────────

/**
 * Converts README markdown to HTML for the help panel.
 * Replaces `command:cvs.xxx` links with inline Run buttons.
 * Strips the TODO stub sections added by the fixer (we don't want those shown).
 */
function readmeToHtml(md: string): string {
    // Strip all auto-generated TODO stub sections added by the readme compliance fixer.
    // These appear at the bottom as one or more of: "What it does", "Internal architecture",
    // "Manual test" — each containing only placeholder TODO content.
    //
    // Strategy: remove any ## section (preceded by optional ---) whose entire body
    // contains only TODO markers, empty lines, or placeholder code blocks.
    //
    // Run multiple passes to catch all three stub sections in any order.
    const TODO_SECTION = /\n{0,2}(?:---\s*\n+)?## (?:What it does|Internal architecture|Manual test)\s*\n(?:[\s\S]*?_TODO[\s\S]*?)(?=\n## |\n---\s*\n## |$)/g;
    md = md.replace(TODO_SECTION, '');

    // Also strip any trailing --- separators left behind after stripping
    md = md.replace(/(\n---\s*)+$/g, '').trimEnd();

    // Escape HTML entities first (careful — do code blocks separately)
    const lines = md.split('\n');
    const htmlLines: string[] = [];
    let inCode = false;
    let inTable = false;
    let tableRows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        // Fenced code block toggle
        if (/^```/.test(raw)) {
            if (!inCode) {
                inCode = true;
                const lang = raw.slice(3).trim();
                htmlLines.push(`<pre><code class="lang-${esc(lang)}">`);
            } else {
                inCode = false;
                htmlLines.push('</code></pre>');
            }
            continue;
        }
        if (inCode) { htmlLines.push(escRaw(raw)); continue; }

        // Table rows
        if (/^\|/.test(raw)) {
            if (!inTable) { inTable = true; tableRows = []; }
            tableRows.push(raw);
            // Peek ahead — if next line isn't a table row, flush table
            const next = lines[i + 1] ?? '';
            if (!/^\|/.test(next)) {
                htmlLines.push(renderTable(tableRows));
                inTable = false;
                tableRows = [];
            }
            continue;
        }
        if (inTable) { inTable = false; }

        // Headings
        const h4 = raw.match(/^#### (.+)$/); if (h4) { htmlLines.push(`<h4>${inlineHtml(h4[1])}</h4>`); continue; }
        const h3 = raw.match(/^### (.+)$/);  if (h3) { htmlLines.push(`<h3>${inlineHtml(h3[1])}</h3>`); continue; }
        const h2 = raw.match(/^## (.+)$/);   if (h2) { htmlLines.push(`<h2>${inlineHtml(h2[1])}</h2>`); continue; }
        const h1 = raw.match(/^# (.+)$/);    if (h1) { htmlLines.push(`<h1>${inlineHtml(h1[1])}</h1>`); continue; }

        // HR
        if (/^---+$/.test(raw)) { htmlLines.push('<hr>'); continue; }

        // Blockquote
        const bq = raw.match(/^> (.+)$/); if (bq) { htmlLines.push(`<blockquote>${inlineHtml(bq[1])}</blockquote>`); continue; }

        // Lists
        const li = raw.match(/^[-*] (.+)$/) || raw.match(/^\d+\. (.+)$/);
        if (li) { htmlLines.push(`<li>${inlineHtml(li[1])}</li>`); continue; }

        // Blank line
        if (!raw.trim()) { htmlLines.push('<br>'); continue; }

        // Paragraph line
        htmlLines.push(`<p>${inlineHtml(raw)}</p>`);
    }

    return htmlLines.join('\n');
}

function escRaw(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/**
 * Processes inline markdown within a single line.
 * Converts command: links into inline Run buttons.
 */
function inlineHtml(s: string): string {
    // Escape HTML first
    s = escRaw(s);

    // command: URI links  → inline Run button
    // Pattern after escaping: [text](command:cvs.xxx)  but < > are escaped
    s = s.replace(
        /\[([^\]]+)\]\(command:(cvs\.[a-zA-Z0-9_.]+)\)/g,
        (_match, label, cmdId) =>
            `<code>${label}</code> <button class="inline-run-btn" data-action="run" data-id="${esc(cmdId)}" title="Run ${esc(cmdId)}">&#9654; Run</button>`
    );

    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Normal links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    return s;
}

function renderTable(rows: string[]): string {
    if (rows.length < 2) { return ''; }
    const header = rows[0];
    // rows[1] is the separator  |---|---|
    const body   = rows.slice(2);

    const thCells = header.split('|').slice(1, -1).map(c => `<th>${inlineHtml(c.trim())}</th>`).join('');
    const trRows  = body.map(row => {
        const cells = row.split('|').slice(1, -1).map(c => `<td>${inlineHtml(c.trim())}</td>`).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    return `<table class="help-table"><thead><tr>${thCells}</tr></thead><tbody>${trRows}</tbody></table>`;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

export function buildHelpPanelHtml(
    markdown:  string,
    commands:  HelpCmdEntry[],
    featureName: string,
): string {
    const quickActions = commands.length === 0 ? '' : `
<div class="quick-actions">
  <div class="qa-heading">⚡ Quick Actions</div>
  <div class="qa-grid">
    ${commands.map(cmd => `
    <div class="qa-card">
      <div class="qa-card-top">
        <div class="qa-title">${esc(cmd.title)}</div>
        ${cmd.dewey ? `<span class="qa-dewey">${esc(cmd.dewey)}</span>` : ''}
      </div>
      <div class="qa-desc">${esc(cmd.description)}</div>
      <div class="qa-footer">
        <code class="qa-id">${esc(cmd.id)}</code>
        <button class="qa-run-btn" data-action="run" data-id="${esc(cmd.id)}">&#9654; Run</button>
      </div>
    </div>`).join('')}
  </div>
</div>`;

    const docHtml = readmeToHtml(markdown);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(featureName)} — Help</title>
<style>
${CVS_CSS}

/* ── Help panel extras ── */
.help-toolbar{
  position:sticky;top:0;z-index:50;
  background:var(--vscode-editor-background);
  border-bottom:1px solid var(--vscode-panel-border);
  padding:8px 16px;display:flex;align-items:center;gap:10px;
}
.help-toolbar-title{font-size:1.05em;font-weight:700;flex:1}
.back-btn{
  background:var(--vscode-button-secondaryBackground);
  color:var(--vscode-button-secondaryForeground);
  border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:12px;
  display:flex;align-items:center;gap:4px;
}
.back-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}

/* ── Quick Actions ── */
.quick-actions{
  padding:12px 16px;
  border-bottom:2px solid var(--vscode-focusBorder);
  background:var(--vscode-textCodeBlock-background);
}
.qa-heading{
  font-size:0.82em;font-weight:700;text-transform:uppercase;
  letter-spacing:0.06em;color:var(--vscode-descriptionForeground);
  margin-bottom:10px;
}
.qa-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(240px,1fr));
  gap:8px;
}
.qa-card{
  background:var(--vscode-editor-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:4px;padding:10px 12px;
  display:flex;flex-direction:column;gap:5px;
  transition:border-color 0.12s;
}
.qa-card:hover{border-color:var(--vscode-focusBorder)}
.qa-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.qa-title{font-weight:700;font-size:0.9em;line-height:1.3;flex:1}
.qa-dewey{
  font-family:var(--vscode-editor-font-family);font-size:9px;
  color:var(--vscode-descriptionForeground);
  background:var(--vscode-textCodeBlock-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:3px;padding:1px 5px;white-space:nowrap;opacity:0.75;
}
.qa-desc{font-size:11px;line-height:1.45;opacity:0.85;flex:1}
.qa-footer{display:flex;justify-content:space-between;align-items:center;margin-top:4px}
.qa-id{
  font-family:var(--vscode-editor-font-family);font-size:10px;
  background:var(--vscode-textCodeBlock-background);
  padding:1px 5px;border-radius:2px;
  color:var(--vscode-textLink-foreground);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%;
}
.qa-run-btn{
  background:var(--vscode-button-background);
  color:var(--vscode-button-foreground);
  border:none;padding:4px 12px;border-radius:3px;
  cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;
}
.qa-run-btn:hover{background:var(--vscode-button-hoverBackground)}
.qa-run-btn:active{opacity:0.8}

/* ── Rendered docs ── */
.help-doc{padding:20px 24px 60px;max-width:820px}
.help-doc h1{font-size:1.5em;margin:0 0 14px;line-height:1.3}
.help-doc h2{font-size:1.15em;margin:22px 0 8px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:5px}
.help-doc h3{font-size:1.0em;margin:16px 0 6px;font-weight:700}
.help-doc h4{font-size:0.9em;margin:12px 0 4px;font-weight:700}
.help-doc p{margin:5px 0;line-height:1.65}
.help-doc li{margin:3px 0 3px 20px;line-height:1.6}
.help-doc code{
  background:var(--vscode-textCodeBlock-background);
  padding:1px 5px;border-radius:3px;
  font-family:var(--vscode-editor-font-family);font-size:0.88em;
}
.help-doc pre{
  background:var(--vscode-textCodeBlock-background);
  padding:12px 14px;border-radius:4px;
  overflow-x:auto;margin:8px 0;
  font-family:var(--vscode-editor-font-family);font-size:12px;line-height:1.55;
}
.help-doc pre code{background:none;padding:0}
.help-doc blockquote{
  border-left:3px solid var(--vscode-focusBorder);
  padding:4px 12px;margin:6px 0;
  color:var(--vscode-descriptionForeground);
}
.help-doc hr{border:none;border-top:1px solid var(--vscode-panel-border);margin:16px 0}
.help-doc a{color:var(--vscode-textLink-foreground)}
.help-doc a:hover{color:var(--vscode-textLink-activeForeground)}
.help-table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
.help-table th{
  text-align:left;padding:6px 10px;
  background:var(--vscode-textCodeBlock-background);
  border-bottom:2px solid var(--vscode-focusBorder);
  font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;
}
.help-table td{padding:6px 10px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}
.help-table tr:hover td{background:var(--vscode-list-hoverBackground)}

/* ── Inline run buttons (inside doc text) ── */
.inline-run-btn{
  background:var(--vscode-button-background);
  color:var(--vscode-button-foreground);
  border:none;padding:2px 8px;border-radius:3px;
  cursor:pointer;font-size:10px;font-weight:600;
  vertical-align:middle;margin-left:4px;
}
.inline-run-btn:hover{background:var(--vscode-button-hoverBackground)}

/* ── Run status strip ── */
#run-strip{
  position:fixed;bottom:0;left:0;right:0;
  padding:6px 16px;font-size:12px;
  background:var(--vscode-statusBar-background);
  color:var(--vscode-statusBar-foreground);
  border-top:1px solid var(--vscode-panel-border);
  display:none;align-items:center;gap:8px;z-index:100;
}
#run-strip.visible{display:flex}
</style>
</head>
<body>

<div class="help-toolbar">
  <button class="back-btn" data-action="back">&#8592; Launcher</button>
  <span class="help-toolbar-title">📄 ${esc(featureName)}</span>
</div>

${quickActions}

<div class="help-doc">${docHtml}</div>

<div id="run-strip">
  <span style="animation:cvs-spin 1s linear infinite;display:inline-block">&#9696;</span>
  <span id="run-strip-text">Running…</span>
  <span id="run-strip-cmd" style="opacity:0.7"></span>
</div>

<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();

document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  var action = btn.dataset.action;

  if (action === 'back') {
    vscode.postMessage({ command: 'back' });
    return;
  }

  if (action === 'run') {
    var id   = btn.dataset.id;
    var orig = btn.textContent;
    btn.textContent = '\u23f3';
    btn.disabled    = true;

    var strip    = document.getElementById('run-strip');
    var stripTxt = document.getElementById('run-strip-text');
    var stripCmd = document.getElementById('run-strip-cmd');
    stripTxt.textContent = 'Running:';
    stripCmd.textContent = id;
    strip.classList.add('visible');

    var timer = setTimeout(function() {
      btn.textContent = orig;
      btn.disabled    = false;
      strip.classList.remove('visible');
    }, 20000);

    btn.dataset.timer = timer;
    vscode.postMessage({ command: 'run', id: id });
  }
});

window.addEventListener('message', function(e) {
  var msg = e.data;
  var strip = document.getElementById('run-strip');

  if (msg.type === 'done') {
    document.getElementById('run-strip-text').textContent = '\u2705 Done:';
    document.getElementById('run-strip-cmd').textContent  = msg.title || '';
    setTimeout(function() { strip.classList.remove('visible'); }, 2000);
  }
  if (msg.type === 'error') {
    document.getElementById('run-strip-text').textContent = '\u274c Failed:';
    document.getElementById('run-strip-cmd').textContent  = msg.message || msg.title || '';
    setTimeout(function() { strip.classList.remove('visible'); }, 4000);
  }

  // Restore any spinning buttons
  document.querySelectorAll('[data-action="run"][disabled]').forEach(function(b) {
    if (b.dataset.timer) { clearTimeout(parseInt(b.dataset.timer)); }
    b.textContent = '\u25b6 Run';
    b.disabled    = false;
  });
});

})();
</script>
</body>
</html>`;
}
