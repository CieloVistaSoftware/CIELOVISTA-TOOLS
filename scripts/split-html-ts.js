/**
 * split-html-ts.js  v3 — correct boundary detection
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const DIR     = 'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\src\\features\\cvs-command-launcher';
const HTML_TS = path.join(DIR, 'html.ts');
const CSS_TS  = path.join(DIR, 'launcher-css.ts');
const JS_TS   = path.join(DIR, 'launcher-js.ts');

const raw   = fs.readFileSync(HTML_TS, 'utf8');
const lines = raw.split('\n');

// Boundaries (0-indexed line numbers from earlier debug)
const CSS_OPEN_LINE  = 142;  // "    const CSS = `"
const CSS_CLOSE_LINE = 269;  // "`;"
const COMMENT_LINE   = 271;  // "    // BUG FIX:..."
const JS_OPEN_LINE   = 275;  // "    const JS = `"
const JS_CLOSE_LINE  = 771;  // "`;" before return

// Verify
console.log('CSS open line:', JSON.stringify(lines[CSS_OPEN_LINE]));
console.log('CSS close line:', JSON.stringify(lines[CSS_CLOSE_LINE]));
console.log('JS open line:', JSON.stringify(lines[JS_OPEN_LINE]));
console.log('JS close line:', JSON.stringify(lines[JS_CLOSE_LINE]));
console.log('Next line:', JSON.stringify(lines[JS_CLOSE_LINE + 1]));

// Extract CSS content: lines between CSS_OPEN and CSS_CLOSE (exclusive)
const cssContent = lines.slice(CSS_OPEN_LINE + 1, CSS_CLOSE_LINE).join('\n');

// Extract JS content: lines between JS_OPEN and JS_CLOSE (exclusive)
const jsContent = lines.slice(JS_OPEN_LINE + 1, JS_CLOSE_LINE).join('\n');

console.log('\nCSS lines extracted:', CSS_CLOSE_LINE - CSS_OPEN_LINE - 1);
console.log('JS lines extracted:', JS_CLOSE_LINE - JS_OPEN_LINE - 1);

// ── Apply done handler fix ─────────────────────────────────────────────────────
// In the raw file, unicode escapes inside the JS template literal are \\u2705
// (two backslashes). When read by Node.js, these are two separate characters.
const OLD_DONE = "  if (msg.type === 'done')  { runStatusTxt.textContent = '\\u2705 Done:';  runStatusCmd.textContent = msg.title || '';   setTimeout(function() { runStatus.classList.remove('visible'); }, 2000); }\n  if (msg.type === 'error') { runStatusTxt.textContent = '\\u274c Failed:'; runStatusCmd.textContent = msg.message || msg.title || ''; setTimeout(function() { runStatus.classList.remove('visible'); }, 4000); }";

const NEW_DONE = "  if (msg.type === 'done') {\n    runStatusTxt.textContent = '\\u2705 Done:';\n    runStatusCmd.textContent = msg.title || '';\n    var existingNext = document.getElementById('run-status-next');\n    if (existingNext) { existingNext.remove(); }\n    var nextEntry = msg.nextAction ? CATALOG.find(function(c) { return c.id === msg.nextAction; }) : null;\n    if (nextEntry) {\n      var nb = document.createElement('button');\n      nb.id = 'run-status-next';\n      nb.textContent = nextEntry.title + ' \\u2192';\n      nb.style.cssText = 'margin-left:auto;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:3px 12px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap';\n      nb.addEventListener('click', function() {\n        runStatus.classList.remove('visible');\n        nb.remove();\n        vscode.postMessage({ command: 'run', id: msg.nextAction });\n      });\n      runStatus.appendChild(nb);\n    }\n    setTimeout(function() {\n      runStatus.classList.remove('visible');\n      var b = document.getElementById('run-status-next'); if (b) { b.remove(); }\n    }, nextEntry ? 8000 : 2500);\n  }\n  if (msg.type === 'error') {\n    runStatusTxt.textContent = '\\u274c Failed:';\n    runStatusCmd.textContent = msg.message || msg.title || '';\n    var eb = document.getElementById('run-status-next'); if (eb) { eb.remove(); }\n    setTimeout(function() { runStatus.classList.remove('visible'); }, 4000);\n  }";

const jsBefore = jsContent.indexOf(OLD_DONE);
console.log('\nOLD_DONE found at index:', jsBefore);

const jsFixed = jsBefore >= 0 ? jsContent.replace(OLD_DONE, NEW_DONE) : jsContent;
if (jsBefore < 0) {
    // Try direct search for the key phrase with actual characters in the file
    const probe = jsContent.indexOf("msg.type === 'done'");
    console.warn('WARNING: OLD_DONE not found. done phrase at:', probe);
    if (probe >= 0) console.log('Context:', JSON.stringify(jsContent.slice(probe - 10, probe + 120)));
}

// ── Write launcher-css.ts ──────────────────────────────────────────────────────
const CPY = '// Copyright (c) 2025 CieloVista Software. All rights reserved.\n// Unauthorized copying or distribution of this file is strictly prohibited.\n';
const cssTsOut = `${CPY}
/**
 * launcher-css.ts
 * Webview CSS for CieloVista Tools launcher.
 * Extracted from html.ts to comply with the 300-line file size standard.
 */

export const CSS = \`
${cssContent}
\`;
`;
fs.writeFileSync(CSS_TS, cssTsOut, 'utf8');
console.log(`\nWrote launcher-css.ts: ${cssTsOut.split('\n').length} lines`);

// ── Write launcher-js.ts ───────────────────────────────────────────────────────
// jsFixed uses ${catalogJson}, ${total}, ${wsPathJs} — keep as function params
const jsTsOut = `${CPY}
/**
 * launcher-js.ts
 * Client-side JavaScript IIFE for CieloVista Tools launcher webview.
 * Extracted from html.ts to comply with the 300-line file size standard.
 *
 * Done handler: shows checkmark + optional next-action button (8s timeout).
 */

export function buildLauncherJs(catalogJson: string, total: number, wsPathJs: string): string {
    return \`
${jsFixed}
\`;
}
`;
fs.writeFileSync(JS_TS, jsTsOut, 'utf8');
console.log(`Wrote launcher-js.ts: ${jsTsOut.split('\n').length} lines`);

// ── Rewrite html.ts ────────────────────────────────────────────────────────────
// Replace:
//   lines 0..CSS_OPEN_LINE-1   = keep (imports + helpers)
//   CSS_OPEN_LINE..CSS_CLOSE   = replace with: const CSS = launcherCss;
//   CSS_CLOSE+1..COMMENT-1     = keep (blank line)
//   COMMENT..JS_CLOSE          = replace with import call
//   JS_CLOSE+1..end            = keep (return + closing brace)

const topLines    = lines.slice(0, CSS_OPEN_LINE);
const midLines    = lines.slice(CSS_CLOSE_LINE + 1, COMMENT_LINE);  // blank line between CSS and comment
const bottomLines = lines.slice(JS_CLOSE_LINE + 1);

// Add imports right after the existing imports block (after "import type { CmdEntry }")
const importIdx = topLines.findIndex(l => l.includes("import type { CmdEntry }"));
topLines.splice(importIdx + 1, 0,
    "import { CSS as launcherCss } from './launcher-css';",
    "import { buildLauncherJs } from './launcher-js';"
);

const newLines = [
    ...topLines,
    '    const CSS = launcherCss;',
    ...midLines,
    '    // JS lives in launcher-js.ts (file-size compliance — 300-line standard)',
    '    const JS = buildLauncherJs(catalogJson, total, wsPathJs);',
    '',
    ...bottomLines,
];

const newHtml = newLines.join('\n');
fs.writeFileSync(HTML_TS, newHtml, 'utf8');
console.log(`Wrote html.ts: ${newHtml.split('\n').length} lines`);

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n── File size compliance ─────────────────────────────────────────');
[
    [HTML_TS, newHtml.split('\n').length],
    [CSS_TS,  cssTsOut.split('\n').length],
    [JS_TS,   jsTsOut.split('\n').length],
].forEach(([f, n]) => {
    const flag = n > 600 ? ' 🔴 RED' : n > 300 ? ' 🟡 YELLOW' : ' ✅ OK';
    console.log(`  ${path.basename(f)}: ${n} lines${flag}`);
});
