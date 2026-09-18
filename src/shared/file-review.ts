// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * file-review.ts
 *
 * The batch review panel: one diff per proposed file change, each approved or
 * skipped by the user. Nothing is written until the user presses Apply, and
 * then only the files they approved, with the text the review showed them.
 * A message from the webview naming another path, or other text, is ignored
 * (#794).
 *
 * Built for README Compliance (#776, #794) and shared with the README
 * Generator (#798), so every AI or template write in either feature goes
 * through the same review.
 *
 * How an approved item is written depends on its `newFile`:
 *   - false/omitted : the file is replaced (README Compliance's fixes).
 *   - true          : the file is new; it is created with the 'wx' flag, so a
 *                     file that appeared after the review opened is never
 *                     overwritten (the README Generator, #798).
 *
 * No logging here: the caller gets every outcome in onApplied and logs it.
 * No command registration, and no imports from features/ (REG-150).
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as jsdiff from 'diff';
import { esc } from './webview-utils';

export interface ReviewIssue {
    severity: 'error' | 'warning' | 'info';
    message:  string;
    fixable:  boolean;
}

export interface ReviewItem {
    fileName:    string;
    filePath:    string;
    /** Compliance score shown in the card header; omitted when there is none. */
    score?:      number;
    /** Issues listed on the card (only the fixable ones are shown). */
    issues?:     ReviewIssue[];
    /** The text that is written if the user approves this item. */
    aiContent:   string;
    unifiedDiff: string;
    /** True: create the file with 'wx' and never overwrite (see the file comment). */
    newFile?:    boolean;
}

export interface ReviewRefusal {
    filePath: string;
    reason:   'exists' | 'error';
    detail:   string;
    /** The error thrown by the write, when reason is 'error'. */
    error?:   unknown;
}

export interface ReviewResult {
    /** Files written, in the order they were approved. */
    written: string[];
    /** Approved files that were not written, and why. */
    refused: ReviewRefusal[];
    /** Paths in the message that the review was never given. */
    ignored: string[];
}

export interface ReviewOptions {
    /** Panel and toolbar title. */
    title?:     string;
    /** Webview view type; one panel per view type is reused across reviews. */
    viewType?:  string;
    /** Called after Apply, once every approved file has been handled. */
    onApplied?: (result: ReviewResult) => void | Promise<void>;
}

const DEFAULT_TITLE     = 'AI Batch Fix Review';
const DEFAULT_VIEW_TYPE = 'readmeBatchFix';

interface OpenReview { panel: vscode.WebviewPanel; listener?: vscode.Disposable; }
const _open = new Map<string, OpenReview>();

/**
 * A review item for a file that does not exist yet: the diff is the proposed
 * text against an empty "new file", and approval creates it with 'wx'.
 */
export function buildNewFileReviewItem(filePath: string, fileName: string, proposed: string, afterLabel = 'after'): ReviewItem {
    const unifiedDiff = jsdiff.createPatch(fileName, '', proposed, 'new file', afterLabel, { context: 4 });
    return { fileName, filePath, aiContent: proposed, unifiedDiff, newFile: true };
}

/** Writes one approved item according to its `newFile` (see the file comment). */
function writeItem(item: ReviewItem): ReviewRefusal | undefined {
    try {
        fs.writeFileSync(item.filePath, item.aiContent, item.newFile ? { encoding: 'utf8', flag: 'wx' } : 'utf8');
        return undefined;
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
            return { filePath: item.filePath, reason: 'exists', detail: 'the file was created after the review was built' };
        }
        return { filePath: item.filePath, reason: 'error', detail: err instanceof Error ? err.message : String(err), error: err };
    }
}

/**
 * Opens (or reuses) the review panel for these items. Only the files the user
 * approves are written, and only with the text shown here.
 */
export function showFileReview(items: ReviewItem[], options: ReviewOptions = {}): void {
    const title    = options.title ?? DEFAULT_TITLE;
    const viewType = options.viewType ?? DEFAULT_VIEW_TYPE;
    const html     = buildFileReviewHtml(items, title);
    const byPath   = new Map(items.map(item => [item.filePath, item]));

    let open = _open.get(viewType);
    if (open) {
        open.panel.title        = `📝 ${title}`;
        open.panel.webview.html = html;
        open.panel.reveal(vscode.ViewColumn.Beside);
    } else {
        const panel = vscode.window.createWebviewPanel(
            viewType, `📝 ${title}`, vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = html;
        const entry: OpenReview = { panel };
        panel.onDidDispose(() => {
            entry.listener?.dispose();
            if (_open.get(viewType) === entry) { _open.delete(viewType); }
        });
        _open.set(viewType, entry);
        open = entry;
    }

    const current = open;
    current.listener?.dispose();
    current.listener = current.panel.webview.onDidReceiveMessage(async (msg) => {
        if (!msg || msg.command !== 'applyBatch') { return; }
        const approved: Array<{ filePath: string }> = Array.isArray(msg.approved) ? msg.approved : [];
        const result: ReviewResult = { written: [], refused: [], ignored: [] };
        for (const filePath of new Set(approved.map(a => a && a.filePath))) {
            const item = byPath.get(filePath);
            if (!item) { result.ignored.push(String(filePath)); continue; }
            const refusal = writeItem(item);
            if (refusal) { result.refused.push(refusal); } else { result.written.push(item.filePath); }
        }
        current.panel.dispose();
        await options.onApplied?.(result);
    });
}

/** Closes the review panel of one view type (for a feature's deactivate()). */
export function disposeFileReview(viewType: string = DEFAULT_VIEW_TYPE): void {
    const open = _open.get(viewType);
    if (!open) { return; }
    open.listener?.dispose();
    _open.delete(viewType);
    open.panel.dispose();
}

export function buildFileReviewHtml(items: ReviewItem[], title: string): string {
    const itemsData = items.map((item, i) => ({
        i,
        fileName:    item.fileName,
        filePath:    item.filePath,
        score:       item.score,
        aiContent:   item.aiContent,
        unifiedDiff: item.unifiedDiff,
    }));

    const cardsHtml = items.map((item, i) => {
        const fixable    = (item.issues ?? []).filter(iss => iss.fixable);
        const issueLines = fixable.map(iss =>
            `<li>${iss.severity === 'error' ? '🔴' : '🟡'} ${esc(iss.message)}</li>`
        ).join('');
        const badge = typeof item.score === 'number'
            ? `<span class="batch-score">Score: ${item.score}/100</span>`
            : item.newFile ? '<span class="batch-score">New file</span>'
            : '';
        return `<div class="batch-card" id="card-${i}" data-index="${i}">
  <div class="batch-hd">
    <span class="batch-fname">${esc(item.fileName)}</span>
    ${badge}
    <div style="flex:1"></div>
    <button class="btn-approve-one" data-index="${i}">☑ Approve</button>
    <button class="btn-skip-one"   data-index="${i}">✕ Skip</button>
  </div>
  <div class="batch-path">${esc(item.filePath)}</div>
  ${issueLines ? `<div class="batch-issues"><ul>${issueLines}</ul></div>` : ''}
  <div class="batch-diff-wrap"><div id="diff-${i}"></div></div>
</div>`;
    }).join('');

    const itemsJson = JSON.stringify(itemsData);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/diff2html@3.4.56/bundles/css/diff2html.min.css">
<script src="https://cdn.jsdelivr.net/npm/diff2html@3.4.56/bundles/js/diff2html-ui.min.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}
#toolbar h1{font-size:0.95em;font-weight:700;flex:1}
.btn-primary{background:#3fb950;color:#000;border:none;padding:6px 16px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:700}
.btn-primary:hover{opacity:.85}.btn-primary:disabled{opacity:.4;cursor:not-allowed}
.btn-sec{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:6px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.btn-sec:hover{background:var(--vscode-button-secondaryHoverBackground)}
#cards{padding:14px 16px 60px}
.batch-card{border:1px solid var(--vscode-panel-border);border-radius:5px;margin-bottom:16px;overflow:hidden;transition:border-color 0.12s}
.batch-card.approved{border-color:#3fb950}
.batch-card.skipped{opacity:.4}
.batch-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--vscode-textCodeBlock-background)}
.batch-fname{font-weight:700;font-size:0.92em}.batch-score{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.batch-path{font-size:10px;color:var(--vscode-descriptionForeground);padding:4px 14px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--vscode-editor-font-family)}
.batch-issues{padding:6px 14px;font-size:11px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border)}
.batch-issues ul{padding-left:16px;display:flex;flex-wrap:wrap;gap:3px 16px}
.batch-issues li{list-style:none}
.batch-diff-wrap{padding:8px 14px}
.btn-approve-one{background:transparent;color:#3fb950;border:1px solid #3fb950;padding:3px 12px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap}
.btn-approve-one.active{background:#3fb950;color:#000}
.btn-approve-one:hover{background:rgba(63,185,80,.15)}
.btn-skip-one{background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px}
.btn-skip-one:hover{border-color:var(--vscode-focusBorder)}
.d2h-wrapper{font-family:var(--vscode-editor-font-family,monospace)!important;font-size:12px!important}
.d2h-file-header{background:var(--vscode-textCodeBlock-background)!important;border-color:var(--vscode-panel-border)!important;color:var(--vscode-editor-foreground)!important}
.d2h-code-linenumber{background:var(--vscode-textCodeBlock-background)!important;border-color:var(--vscode-panel-border)!important;color:var(--vscode-descriptionForeground)!important}
</style>
</head>
<body>
<div id="toolbar">
  <h1>📝 ${esc(title)} — ${items.length} file${items.length !== 1 ? 's' : ''}</h1>
  <button class="btn-primary" id="btn-apply" disabled>✅ Apply Approved (0)</button>
  <button class="btn-sec" id="btn-approve-all">✓ Approve All</button>
  <button class="btn-sec" id="btn-skip-all">✕ Skip All</button>
</div>
<div id="cards">
${cardsHtml}
</div>
<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();
const ITEMS = ${itemsJson};
var approved = {};

function updateCta() {
  var count = Object.keys(approved).filter(function(k) { return approved[k]; }).length;
  var btn = document.getElementById('btn-apply');
  btn.textContent = '\\u2705 Apply Approved (' + count + ')';
  btn.disabled = count === 0;
}

function setApprove(idx, val) {
  var card = document.getElementById('card-' + idx);
  if (!card) { return; }
  var appBtn = card.querySelector('.btn-approve-one');
  if (val) {
    approved[idx] = true;
    card.classList.add('approved');
    card.classList.remove('skipped');
    appBtn.textContent = '\\u2705 Approved';
    appBtn.classList.add('active');
  } else {
    delete approved[idx];
    card.classList.remove('approved', 'skipped');
    appBtn.textContent = '\\u2611 Approve';
    appBtn.classList.remove('active');
  }
  updateCta();
}

document.querySelectorAll('.btn-approve-one').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var idx = parseInt(btn.dataset.index, 10);
    setApprove(idx, !approved[idx]);
  });
});

document.querySelectorAll('.btn-skip-one').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var idx = parseInt(btn.dataset.index, 10);
    delete approved[idx];
    var card = document.getElementById('card-' + idx);
    card.classList.remove('approved');
    card.classList.add('skipped');
    card.querySelector('.btn-approve-one').textContent = '\\u2611 Approve';
    card.querySelector('.btn-approve-one').classList.remove('active');
    updateCta();
  });
});

document.getElementById('btn-approve-all').addEventListener('click', function() {
  ITEMS.forEach(function(item) { setApprove(item.i, true); });
});

document.getElementById('btn-skip-all').addEventListener('click', function() {
  ITEMS.forEach(function(item) {
    delete approved[item.i];
    var card = document.getElementById('card-' + item.i);
    card.classList.remove('approved');
    card.classList.add('skipped');
    var appBtn = card.querySelector('.btn-approve-one');
    appBtn.textContent = '\\u2611 Approve';
    appBtn.classList.remove('active');
  });
  updateCta();
});

document.getElementById('btn-apply').addEventListener('click', function() {
  var toWrite = ITEMS
    .filter(function(item) { return !!approved[item.i]; })
    .map(function(item) { return { filePath: item.filePath, content: item.aiContent }; });
  if (!toWrite.length) { return; }
  vscode.postMessage({ command: 'applyBatch', approved: toWrite });
});

document.addEventListener('DOMContentLoaded', function() {
  ITEMS.forEach(function(item) {
    var target = document.getElementById('diff-' + item.i);
    if (!target || !item.unifiedDiff) { return; }
    var ui = new Diff2HtmlUI(target, item.unifiedDiff, {
      drawFileList: false, matching: 'lines', outputFormat: 'line-by-line',
      highlight: true, renderNothingWhenEmpty: false,
    });
    ui.draw();
    ui.highlightCode();
  });
});

updateCta();
})();
<\/script>
</body>
</html>`;
}
