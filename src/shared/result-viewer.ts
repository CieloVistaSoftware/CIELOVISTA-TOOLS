// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * result-viewer.ts
 *
 * Singleton webview panel that records every command result with a
 * return code, title, timestamp, summary and optional change details.
 *
 * RC = 0  → green  (success)
 * RC ≠ 0  → red    (error / failure)
 *
 * Usage:
 *   import { showCommandResult } from '../../shared/result-viewer';
 *   showCommandResult({ rc: 0, commandId: 'cvs.readme.fix',
 *                       title: 'Fix a Non-Compliant README',
 *                       summary: 'Fixed 3 issues in README.md',
 *                       changes: [{ action: 'Added section "What it does"', file: 'README.md' }] });
 */

import * as vscode from 'vscode';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ChangeEntry {
    action:   string;    // e.g. 'Added section "What it does"'
    file?:    string;    // optional file path
    before?:  string;    // optional before snippet (keep short, ~120 chars)
    after?:   string;    // optional after snippet
}

export interface CommandResult {
    rc:        number;   // 0 = success, non-zero = error
    commandId: string;
    title:     string;
    summary:   string;   // one concise line describing what happened
    details?:  string;   // optional free-form paragraph
    changes?:  ChangeEntry[];
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _panel:  vscode.WebviewPanel | undefined;
let _serial: number = 0;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a command result and push it into the result-viewer panel.
 * Creates the panel on first call; subsequent calls just post a message.
 * Reveals the panel without stealing focus.
 */
export function showCommandResult(result: CommandResult): void {
    _ensurePanel();
    _serial++;
    _panel!.webview.postMessage({ type: 'result', serial: _serial, ts: Date.now(), ...result });
    _panel!.reveal(vscode.ViewColumn.Two, true /* preserveFocus */);
}

export function disposeResultViewer(): void {
    _panel?.dispose();
    _panel = undefined;
}

// ─── Panel lifecycle ──────────────────────────────────────────────────────────

function _ensurePanel(): void {
    if (_panel) { return; }
    _panel = vscode.window.createWebviewPanel(
        'cvsResultViewer',
        '📋 CieloVista Results',
        { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _panel.webview.html = _buildHtml();
    _panel.onDidDispose(() => { _panel = undefined; });
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function _buildHtml(): string {
    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);display:flex;flex-direction:column;height:100vh;overflow:hidden}
#toolbar{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;background:var(--vscode-editor-background);position:sticky;top:0;z-index:10}
#toolbar h1{font-size:0.95em;font-weight:700;flex:1}
#count{font-size:11px;color:var(--vscode-descriptionForeground)}
#btn-clear{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px}
#btn-clear:hover{background:var(--vscode-button-secondaryHoverBackground)}
#feed{flex:1;overflow-y:auto;padding:10px 14px 30px;display:flex;flex-direction:column;gap:8px}
#empty{padding:40px 0;text-align:center;color:var(--vscode-descriptionForeground);font-size:12px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px}
.rc-card{border:1px solid var(--vscode-panel-border);border-radius:5px;overflow:hidden;animation:slideIn 0.15s ease}
@keyframes slideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
.rc-card.rc-ok {border-left:3px solid #3fb950}
.rc-card.rc-err{border-left:3px solid #f48771}
.rc-header{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--vscode-textCodeBlock-background);cursor:pointer;user-select:none}
.rc-badge{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;font-weight:700;padding:1px 7px;border-radius:3px;flex-shrink:0;letter-spacing:0.03em;white-space:nowrap}
.rc-ok  .rc-badge{background:rgba(63,185,80,0.18);color:#3fb950;border:1px solid rgba(63,185,80,0.4)}
.rc-err .rc-badge{background:rgba(244,135,113,0.18);color:#f48771;border:1px solid rgba(244,135,113,0.4)}
.rc-title{font-weight:700;font-size:0.9em;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rc-ts{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap;flex-shrink:0}
.rc-chevron{font-size:10px;color:var(--vscode-descriptionForeground);flex-shrink:0;transition:transform 0.15s}
.rc-card.open .rc-chevron{transform:rotate(90deg)}
.rc-summary{padding:6px 10px 7px;font-size:12px;line-height:1.5;border-bottom:1px solid var(--vscode-panel-border)}
.rc-body{display:none;padding:8px 10px 10px;background:var(--vscode-editor-background);flex-direction:column;gap:8px}
.rc-card.open .rc-body{display:flex}
.rc-cmdid{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);background:var(--vscode-textCodeBlock-background);padding:2px 7px;border-radius:3px;display:inline-block}
.rc-details{font-size:12px;line-height:1.65;white-space:pre-wrap;opacity:0.9}
.section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--vscode-focusBorder);margin-top:2px}
.changes-list{display:flex;flex-direction:column;gap:5px}
.change-row{display:flex;flex-direction:column;gap:2px;border-left:2px solid var(--vscode-focusBorder);padding-left:8px}
.change-action{font-size:11px;font-weight:600}
.change-file{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground)}
.diff-pair{display:flex;flex-direction:column;gap:2px;margin-top:3px}
.diff-before,.diff-after{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;padding:2px 6px;border-radius:2px;white-space:pre-wrap;word-break:break-all}
.diff-before{background:rgba(244,135,113,0.12);color:#f48771}
.diff-after {background:rgba(63,185,80,0.12);color:#3fb950}
`;

    const JS = `
(function(){
'use strict';
const feed  = document.getElementById('feed');
const empty = document.getElementById('empty');
const count = document.getElementById('count');
let   total = 0;

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function fmt(ts){
  const d  = new Date(ts);
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ss = String(d.getSeconds()).padStart(2,'0');
  return hh+':'+mm+':'+ss;
}

function buildCard(msg){
  const ok  = msg.rc === 0;
  const cls = ok ? 'rc-ok' : 'rc-err';
  const rcLabel = ok ? 'RC\u202f0\u2002\u2714' : 'RC\u202f'+msg.rc+'\u2002\u2716';

  let changesHtml = '';
  if (msg.changes && msg.changes.length){
    changesHtml += '<div class="section-label">Changes ('+msg.changes.length+')</div><div class="changes-list">';
    for (const c of msg.changes){
      let diffHtml = '';
      if (c.before !== undefined || c.after !== undefined){
        diffHtml = '<div class="diff-pair">'
          +(c.before !== undefined ? '<div class="diff-before">- '+esc(c.before)+'</div>' : '')
          +(c.after  !== undefined ? '<div class="diff-after" >+ '+esc(c.after )+'</div>' : '')
          +'</div>';
      }
      changesHtml +=
        '<div class="change-row">'
          +'<span class="change-action">'+esc(c.action)+'</span>'
          +(c.file ? '<span class="change-file">'+esc(c.file)+'</span>' : '')
          +diffHtml
        +'</div>';
    }
    changesHtml += '</div>';
  }

  const detailsHtml = msg.details
    ? '<div class="section-label">Details</div><div class="rc-details">'+esc(msg.details)+'</div>'
    : '';

  const hasBody = !!(changesHtml || detailsHtml);

  return '<div class="rc-card '+cls+(hasBody?' expandable':'')+'" id="entry-'+msg.serial+'">'
    +'<div class="rc-header">'
      +'<span class="rc-badge">'+rcLabel+'</span>'
      +'<span class="rc-title" title="'+esc(msg.commandId)+'">'+esc(msg.title)+'</span>'
      +'<span class="rc-ts">'+esc(fmt(msg.ts))+'</span>'
      +(hasBody ? '<span class="rc-chevron">&#9658;</span>' : '')
    +'</div>'
    +'<div class="rc-summary">'+esc(msg.summary)+'</div>'
    +(hasBody
      ? '<div class="rc-body">'
          +'<span class="rc-cmdid">'+esc(msg.commandId)+'</span>'
          +detailsHtml
          +changesHtml
        +'</div>'
      : '')
    +'</div>';
}

document.addEventListener('click', function(e){
  const hdr = e.target.closest('.rc-header');
  if (!hdr) { return; }
  const card = hdr.closest('.rc-card');
  if (card && card.querySelector('.rc-body')) { card.classList.toggle('open'); }
});

document.getElementById('btn-clear').addEventListener('click', function(){
  feed.innerHTML = '';
  total = 0;
  count.textContent = '';
  empty.style.display = 'flex';
  feed.style.display  = 'none';
});

window.addEventListener('message', function(e){
  const msg = e.data;
  if (msg.type !== 'result') { return; }
  total++;
  empty.style.display = 'none';
  feed.style.display  = 'flex';
  count.textContent   = total === 1 ? '1 result' : total+' results';
  const wrapper     = document.createElement('div');
  wrapper.innerHTML = buildCard(msg);
  const card = wrapper.firstChild;
  feed.insertBefore(card, feed.firstChild);
  // Auto-expand if there is body content
  if (card.querySelector && card.querySelector('.rc-body')) { card.classList.add('open'); }
});
})();
`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div id="toolbar">
  <h1>&#128203; CieloVista Results</h1>
  <span id="count"></span>
  <button id="btn-clear">Clear</button>
</div>
<div id="feed" style="display:none"></div>
<div id="empty">
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="4" y="4" width="24" height="24" rx="3"/>
    <line x1="9" y1="11" x2="23" y2="11"/>
    <line x1="9" y1="16" x2="23" y2="16"/>
    <line x1="9" y1="21" x2="17" y2="21"/>
  </svg>
  <span>No results yet &#8212; run any command to see its RC here</span>
</div>
<script>${JS}</script>
</body></html>`;
}
