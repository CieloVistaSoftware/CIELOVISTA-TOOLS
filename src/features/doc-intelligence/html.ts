// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/** html.ts — Builds the accept/reject/modify intelligence dashboard. */

import { esc } from '../../shared/webview-utils';
import type { Finding, IntelligenceReport } from './types';

const KIND_ICON: Record<string, string> = {
    'duplicate':          '📄',
    'similar':            '🔀',
    'misplaced':          '📦',
    'orphan':             '👻',
    'missing-readme':     '📝',
    'missing-claude':     '🤖',
    'missing-changelog':  '📋',
};

const ACTION_LABEL: Record<string, string> = {
    'merge':          '⛙ Merge',
    'diff':           '⬛ Diff',
    'move-to-global': '📦 Move to Global',
    'delete':         '🗑 Delete',
    'open':           '↗ Open',
    'create':         '✨ Create',
    'none':           '—',
};

function dotHtml(severity: string): string {
    return severity === 'red' ? '🔴' : severity === 'yellow' ? '🟡' : 'ℹ️';
}

function kindLabel(kind: string): string {
    return kind.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function avoidNextRun(kind: string): string {
  switch (kind) {
    case 'missing-readme':
      return 'Create README.md when a project is first registered and keep it updated during each release.';
    case 'missing-claude':
      return 'Create CLAUDE.md in every project root using the standard starter template.';
    case 'missing-changelog':
      return 'Add CHANGELOG.md at project start and append entries on every shipped change.';
    case 'duplicate':
      return 'Keep one canonical document per topic and replace duplicates with links.';
    case 'similar':
      return 'Consolidate overlapping docs early and store shared guidance in one canonical file.';
    case 'misplaced':
      return 'Store cross-project standards in global docs and keep project docs focused on local implementation.';
    case 'orphan':
      return 'Link every important doc from README.md, CLAUDE.md, or docs index files.';
    default:
      return 'Keep docs in one canonical location and review doc health during each release cycle.';
  }
}

export function buildDashboardHtml(report: IntelligenceReport): string {
    const { findings, summary, totalDocs, projects, scannedAt, durationMs } = report;

    const pending  = findings.filter(f => !f.decision || f.decision === 'pending');
    const accepted = findings.filter(f => f.decision === 'accepted');
    const skipped  = findings.filter(f => f.decision === 'skipped');

    // Group findings by kind for the summary pills
    const byKind: Record<string, number> = {};
    for (const f of findings) { byKind[f.kind] = (byKind[f.kind] ?? 0) + 1; }

    const pillsHtml = Object.entries(byKind).map(([k, n]) =>
        `<span class="di-pill">${KIND_ICON[k] ?? '•'} ${n} ${esc(kindLabel(k))}</span>`
    ).join('');

    const scanDate  = new Date(scannedAt).toLocaleString();
    const progress  = findings.length === 0 ? 100 : Math.round(((accepted.length + skipped.length) / findings.length) * 100);

    // Cards — one per finding
    const cardsHtml = findings.length === 0
        ? `<div class="di-empty">🎉 No issues found across ${totalDocs} docs in ${projects} projects.<br><span style="opacity:0.6;font-size:12px">Your doc health is perfect.</span></div>`
      : findings.map(f => buildCard(f, scanDate)).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:var(--vscode-font-family);
  font-size:13px;
  color:var(--vscode-editor-foreground);
  background:var(--vscode-editor-background);
}

/* ── Toolbar ── */
.di-toolbar{
  position:sticky;top:0;z-index:50;
  background:var(--vscode-editor-background);
  border-bottom:1px solid var(--vscode-panel-border);
  padding:10px 16px;
  display:flex;flex-direction:column;gap:8px;
}
.di-toolbar-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.di-title{font-size:1.15em;font-weight:700;white-space:nowrap}
.di-meta{font-size:11px;color:var(--vscode-descriptionForeground)}
.di-pills{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.di-pill{
  display:inline-block;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:600;
  background:var(--vscode-textCodeBlock-background);
  border:1px solid var(--vscode-panel-border);
}

/* ── Progress bar ── */
.di-progress-row{display:flex;align-items:center;gap:10px}
.di-progress-track{
  flex:1;height:6px;border-radius:3px;
  background:var(--vscode-textCodeBlock-background);
  overflow:hidden;
}
.di-progress-fill{
  height:100%;border-radius:3px;
  background:var(--vscode-testing-iconPassed);
  transition:width 0.3s;
}
.di-progress-label{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}

/* ── Toolbar actions ── */
.di-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.di-btn{
  background:var(--vscode-button-background);color:var(--vscode-button-foreground);
  border:none;padding:5px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;
}
.di-btn:hover{background:var(--vscode-button-hoverBackground)}
.di-btn:disabled{opacity:0.4;cursor:not-allowed}
.di-btn-sec{
  background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);
  border:none;padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px;
}
.di-btn-sec:hover{background:var(--vscode-button-secondaryHoverBackground)}
.di-filter-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.di-filter-btn{
  background:transparent;color:var(--vscode-descriptionForeground);
  border:1px solid var(--vscode-panel-border);padding:3px 10px;border-radius:12px;
  cursor:pointer;font-size:11px;white-space:nowrap;
}
.di-filter-btn:hover{border-color:var(--vscode-focusBorder);color:var(--vscode-editor-foreground)}
.di-filter-btn.active{
  background:var(--vscode-button-background);color:var(--vscode-button-foreground);
  border-color:var(--vscode-button-background);
}

/* ── Content ── */
.di-content{padding:14px 16px 60px}

/* ── Finding cards ── */
.di-card{
  border:1px solid var(--vscode-panel-border);border-radius:5px;
  margin-bottom:10px;overflow:hidden;
  transition:border-color 0.12s,opacity 0.2s;
}
.di-card.accepted{border-color:var(--vscode-testing-iconPassed);opacity:0.6}
.di-card.accepted:hover{opacity:1}
.di-card.skipped{opacity:0.35}
.di-card.skipped:hover{opacity:0.7}
.di-card.hidden{display:none}

.di-card-header{
  display:flex;align-items:center;gap:8px;
  padding:10px 14px;background:var(--vscode-textCodeBlock-background);
  user-select:none;
}
.di-dot{font-size:12px;flex-shrink:0}
.di-kind-badge{
  font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;
  padding:2px 7px;border-radius:3px;
  background:var(--vscode-editor-background);
  border:1px solid var(--vscode-panel-border);
  color:var(--vscode-descriptionForeground);
  white-space:nowrap;flex-shrink:0;
}
.di-card-title{font-weight:700;font-size:0.92em;flex:1;line-height:1.3}
.di-project-context{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.di-card-decision{font-size:11px;font-weight:700;white-space:nowrap;margin-left:auto}
.di-card-decision.accepted{color:var(--vscode-testing-iconPassed)}
.di-card-decision.skipped{color:var(--vscode-descriptionForeground)}

.di-card-body{display:block;padding:12px 14px;border-top:1px solid var(--vscode-panel-border)}

.di-context-grid{display:grid;grid-template-columns:90px 1fr;gap:5px 10px;margin-bottom:12px;font-size:12px}
.di-context-grid .k{color:var(--vscode-descriptionForeground);font-weight:700}
.di-context-grid .v{line-height:1.45}

.di-reason{
  font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:10px;
}
.di-recommendation{
  font-size:12px;line-height:1.6;
  border-left:3px solid var(--vscode-focusBorder);
  padding:6px 12px;background:var(--vscode-editor-background);
  border-radius:0 3px 3px 0;margin-bottom:12px;
}
.di-paths{
  display:flex;flex-direction:column;gap:3px;margin-bottom:12px;
}
.di-path{
  font-family:var(--vscode-editor-font-family);font-size:10px;
  color:var(--vscode-descriptionForeground);
  background:var(--vscode-textCodeBlock-background);
  padding:3px 8px;border-radius:2px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}

/* ── Decision buttons ── */
.di-decisions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.di-accept-btn{
  background:var(--vscode-testing-iconPassed);color:#fff;
  border:none;padding:5px 14px;border-radius:3px;
  cursor:pointer;font-size:12px;font-weight:700;
}
.di-accept-btn:hover{opacity:0.85}
.di-skip-btn{
  background:var(--vscode-button-secondaryBackground);
  color:var(--vscode-button-secondaryForeground);
  border:none;padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px;
}
.di-skip-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.di-preview-btn{
  background:transparent;color:var(--vscode-textLink-foreground);
  border:1px solid var(--vscode-panel-border);padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px;
}
.di-preview-btn:hover{border-color:var(--vscode-textLink-foreground)}
.di-undo-btn{
  background:transparent;color:var(--vscode-descriptionForeground);
  border:1px solid var(--vscode-panel-border);padding:5px 12px;border-radius:3px;cursor:pointer;font-size:11px;
}
.di-undo-btn:hover{border-color:var(--vscode-focusBorder)}

/* ── File table ── */
.di-file-table{display:flex;flex-direction:column;gap:3px;margin-bottom:10px}
.di-file-row{
  display:flex;align-items:center;gap:8px;
  background:var(--vscode-textCodeBlock-background);
  border:1px solid var(--vscode-panel-border);
  border-radius:3px;padding:4px 8px;
}
.di-file-row:hover{border-color:var(--vscode-focusBorder)}
.di-file-label{
  font-size:10px;font-weight:700;color:var(--vscode-descriptionForeground);
  white-space:nowrap;min-width:40px;
}
.di-file-path{
  font-family:var(--vscode-editor-font-family);font-size:10px;
  color:var(--vscode-editor-foreground);flex:1;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.di-file-btns{display:flex;gap:4px;flex-shrink:0}
.di-file-btn{
  background:var(--vscode-button-secondaryBackground);
  color:var(--vscode-button-secondaryForeground);
  border:none;padding:2px 8px;border-radius:2px;
  cursor:pointer;font-size:10px;font-weight:600;white-space:nowrap;
}
.di-file-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.di-pair-btns{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.di-diff-btn{
  background:transparent;
  color:var(--vscode-textLink-foreground);
  border:1px solid var(--vscode-panel-border);
  padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;
}
.di-diff-btn:hover{border-color:var(--vscode-textLink-foreground);background:var(--vscode-list-hoverBackground)}
.di-merge-btn{
  background:var(--vscode-button-background);
  color:var(--vscode-button-foreground);
  border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;
}
.di-merge-btn:hover{background:var(--vscode-button-hoverBackground)}

/* ── Empty / status ── */
.di-empty{
  padding:60px 20px;text-align:center;
  color:var(--vscode-descriptionForeground);line-height:2.2;
}
#di-status-strip{
  position:fixed;bottom:0;left:0;right:0;
  padding:7px 16px;font-size:12px;
  background:var(--vscode-statusBar-background);
  color:var(--vscode-statusBar-foreground);
  border-top:1px solid var(--vscode-panel-border);
  display:none;align-items:center;gap:8px;z-index:100;
}
#di-status-strip.visible{display:flex}
</style>
</head>
<body>

<div class="di-toolbar">
  <div class="di-toolbar-top">
    <span class="di-title">🧠 Doc Intelligence</span>
    <span class="di-meta">
      ${esc(totalDocs.toString())} docs · ${esc(projects.toString())} projects · scanned ${esc(scanDate)} · ${esc(durationMs.toString())}ms
    </span>
    <div style="flex:1"></div>
    <div class="di-actions">
      <button class="di-btn" id="btn-execute-all" title="Execute all accepted actions">
        ✅ Execute Accepted (${accepted.length})
      </button>
      <button class="di-btn-sec" id="btn-accept-all">✅ Accept All</button>
      <button class="di-btn-sec" id="btn-skip-all">⏭ Skip All</button>
      <button class="di-btn-sec" id="btn-rescan">↺ Rescan</button>
    </div>
  </div>

  <div class="di-pills">${pillsHtml}</div>

  <div class="di-progress-row">
    <div class="di-progress-track">
      <div class="di-progress-fill" id="di-progress-fill" style="width:${esc(progress.toString())}%"></div>
    </div>
    <span class="di-progress-label" id="di-progress-label">
      ${esc(accepted.length.toString())} accepted · ${esc(skipped.length.toString())} skipped · ${esc(pending.length.toString())} pending
    </span>
  </div>

  <div class="di-filter-bar">
    <span style="font-size:11px;color:var(--vscode-descriptionForeground)">Filter:</span>
    <button class="di-filter-btn active" data-filter="all">All (${findings.length})</button>
    <button class="di-filter-btn" data-filter="red">🔴 Red (${summary.red})</button>
    <button class="di-filter-btn" data-filter="yellow">🟡 Yellow (${summary.yellow})</button>
    <button class="di-filter-btn" data-filter="info">ℹ️ Info (${summary.info})</button>
    <button class="di-filter-btn" data-filter="pending">⏳ Pending</button>
    <button class="di-filter-btn" data-filter="accepted">✅ Accepted</button>
  </div>
</div>

<div class="di-content">
  ${cardsHtml}
</div>

<div id="di-status-strip">
  <span style="display:inline-block;animation:spin 1s linear infinite">⚙</span>
  <span id="di-strip-text">Running…</span>
</div>

<style>@keyframes spin{to{transform:rotate(360deg)}}</style>

<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();

// ── Decision tracking ─────────────────────────────────────────────────────
var decisions = {}; // id -> 'accepted' | 'skipped' | 'pending'

// Init from rendered state
document.querySelectorAll('.di-card').forEach(function(card) {
  var id = card.dataset.id;
  if (card.classList.contains('accepted'))  { decisions[id] = 'accepted'; }
  else if (card.classList.contains('skipped')) { decisions[id] = 'skipped'; }
  else { decisions[id] = 'pending'; }
});

function setDecision(id, decision) {
  decisions[id] = decision;
  var card = document.querySelector('.di-card[data-id="' + id + '"]');
  if (!card) { return; }

  card.classList.remove('accepted','skipped');
  if (decision === 'accepted') { card.classList.add('accepted'); }
  if (decision === 'skipped')  { card.classList.add('skipped'); }

  var decEl = card.querySelector('.di-card-decision');
  if (decEl) {
    decEl.className = 'di-card-decision ' + (decision === 'pending' ? '' : decision);
    decEl.textContent = decision === 'accepted' ? '✅ Accepted'
                      : decision === 'skipped'  ? '⏭ Skipped'
                      : '';
  }

  updateProgress();
}

function updateProgress() {
  var total    = Object.keys(decisions).length;
  var accepted = Object.values(decisions).filter(function(d) { return d === 'accepted'; }).length;
  var skipped  = Object.values(decisions).filter(function(d) { return d === 'skipped';  }).length;
  var pending  = total - accepted - skipped;
  var pct      = total === 0 ? 100 : Math.round(((accepted + skipped) / total) * 100);

  document.getElementById('di-progress-fill').style.width  = pct + '%';
  document.getElementById('di-progress-label').textContent =
    accepted + ' accepted · ' + skipped + ' skipped · ' + pending + ' pending';

  var execBtn = document.getElementById('btn-execute-all');
  execBtn.textContent = '\\u2705 Execute Accepted (' + accepted + ')';
  execBtn.disabled    = accepted === 0;
}

// ── Filter ────────────────────────────────────────────────────────────────
var _filter = 'all';
function setFilter(f) {
  _filter = f;
  document.querySelectorAll('.di-filter-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.filter === f);
  });
  document.querySelectorAll('.di-card').forEach(function(card) {
    var sev      = card.dataset.severity;
    var decision = decisions[card.dataset.id] || 'pending';
    var show = f === 'all'
      || (f === 'red'      && sev === 'red')
      || (f === 'yellow'   && sev === 'yellow')
      || (f === 'info'     && sev === 'info')
      || (f === 'pending'  && decision === 'pending')
      || (f === 'accepted' && decision === 'accepted');
    card.classList.toggle('hidden', !show);
  });
}

// ── Bulk actions ──────────────────────────────────────────────────────────
function acceptAll() {
  document.querySelectorAll('.di-card').forEach(function(card) {
    setDecision(card.dataset.id, 'accepted');
  });
}
function skipAll() {
  document.querySelectorAll('.di-card').forEach(function(card) {
    setDecision(card.dataset.id, 'skipped');
  });
}


// ── Execute all accepted ──────────────────────────────────────────────────
function executeAll() {
  var accepted = Object.entries(decisions)
    .filter(function(e) { return e[1] === 'accepted'; })
    .map(function(e) { return e[0]; });
  if (!accepted.length) { return; }
  showStrip('Executing ' + accepted.length + ' action(s)…');
  vscode.postMessage({ command: 'executeAll', ids: accepted });
}

function rescan() {
  showStrip('Rescanning…');
  vscode.postMessage({ command: 'rescan' });
}

// ── Individual action buttons ─────────────────────────────────────────────
document.querySelectorAll('[data-di-action]').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var action  = btn.dataset.diAction;
    var id      = btn.closest('.di-card').dataset.id;
    var pathsRaw = btn.dataset.paths;
    var paths;
    try { paths = JSON.parse(pathsRaw); } catch { paths = [pathsRaw]; }

    if (action === 'accept')   { setDecision(id, 'accepted'); return; }
    if (action === 'skip')     { setDecision(id, 'skipped');  return; }
    if (action === 'undo')     { setDecision(id, 'pending');  return; }
    if (action === 'preview')  {
      showStrip('Opening preview…');
      vscode.postMessage({ command: 'preview', id: id, paths: paths });
      return;
    }
    if (action === 'execute-one') {
      showStrip('Executing…');
      vscode.postMessage({ command: 'executeOne', id: id });
    }
    if (action === 'open-file') {
      vscode.postMessage({ command: 'openFile', paths: paths });
    }
    if (action === 'diff-pair') {
      showStrip('Opening diff…');
      vscode.postMessage({ command: 'diffPair', paths: paths });
    }
    if (action === 'merge-all') {
      showStrip('Opening merge…');
      vscode.postMessage({ command: 'mergeAll', id: id, paths: paths });
    }
  });
});

// ── Strip ─────────────────────────────────────────────────────────────────
function showStrip(text) {
  var s = document.getElementById('di-status-strip');
  document.getElementById('di-strip-text').textContent = text;
  s.classList.add('visible');
}
function hideStrip() {
  document.getElementById('di-status-strip').classList.remove('visible');
}

// ── Messages from extension ───────────────────────────────────────────────
window.addEventListener('message', function(e) {
  var msg = e.data;
  if (msg.type === 'done')     { hideStrip(); }
  if (msg.type === 'progress') { showStrip(msg.text); }
  if (msg.type === 'decision') { setDecision(msg.id, msg.decision); }
});

updateProgress();

// Wire up toolbar buttons
document.getElementById('btn-execute-all').addEventListener('click', executeAll);
document.getElementById('btn-accept-all').addEventListener('click', acceptAll);
document.getElementById('btn-skip-all').addEventListener('click', skipAll);
document.getElementById('btn-rescan').addEventListener('click', rescan);

// Filter buttons use data-filter — delegate instead of inline onclick
document.querySelectorAll('.di-filter-btn').forEach(function(btn) {
  btn.addEventListener('click', function() { setFilter(btn.dataset.filter); });
});
})();
</script>
</body>
</html>`;
}

/** Builds the per-file rows + diff pair buttons for duplicate/similar findings. */
function buildFileTable(f: Finding): string {
    const isMultiFile = (f.kind === 'duplicate' || f.kind === 'similar') && f.paths.length > 1;

    // Per-file rows
    const fileRows = f.paths.map((p, i) => {
        const label     = `File ${i + 1}`;
        const pathJson  = esc(JSON.stringify([p]));
        return `<div class="di-file-row">
  <span class="di-file-label">${label}</span>
  <span class="di-file-path" title="${esc(p)}">${esc(p)}</span>
  <div class="di-file-btns">
    <button class="di-file-btn" data-di-action="open-file" data-paths="${pathJson}" title="Open in editor">↗ Open</button>
  </div>
</div>`;
    }).join('');

    // Diff buttons between every pair
    let diffButtons = '';
    if (isMultiFile) {
        for (let i = 0; i < f.paths.length; i++) {
            for (let j = i + 1; j < f.paths.length; j++) {
                const pairJson = esc(JSON.stringify([f.paths[i], f.paths[j]]));
                const aName    = f.paths[i].split('\\').pop() ?? f.paths[i];
                const bName    = f.paths[j].split('\\').pop() ?? f.paths[j];
                diffButtons += `<button class="di-diff-btn" data-di-action="diff-pair" data-paths="${pairJson}" title="Open VS Code diff: ${esc(aName)} vs ${esc(bName)}">⬛ Diff ${i+1} vs ${j+1}</button>`;
            }
        }
        // Also a merge button for the full set
        const allJson = esc(JSON.stringify(f.paths));
        diffButtons += `<button class="di-merge-btn" data-di-action="merge-all" data-paths="${allJson}" title="Merge all ${f.paths.length} copies into one">⛙ Merge All</button>`;
    }

    return `<div class="di-file-table">${fileRows}</div>${diffButtons ? `<div class="di-pair-btns">${diffButtons}</div>` : ''}`;
}

function buildCard(f: Finding, scanDate: string): string {
    const pathsJson     = esc(JSON.stringify(f.paths));
    const decisionClass = f.decision === 'accepted' ? ' accepted' : f.decision === 'skipped' ? ' skipped' : '';
    const decisionLabel = f.decision === 'accepted' ? '<span class="di-card-decision accepted">✅ Accepted</span>'
                        : f.decision === 'skipped'  ? '<span class="di-card-decision skipped">⏭ Skipped</span>'
                        : '<span class="di-card-decision"></span>';

    const actionLabel = ACTION_LABEL[f.action] ?? f.action;
    const filesHtml   = buildFileTable(f);
    const primaryProject = f.projects[0] ?? 'global';
    const whereText = f.paths.length ? f.paths.map(p => p.split('\\').pop() ?? p).join(', ') : 'No file path provided';
    const avoidTip = avoidNextRun(f.kind);

    return `<div class="di-card${decisionClass}" data-id="${esc(f.id)}" data-severity="${esc(f.severity)}" data-kind="${esc(f.kind)}">
  <div class="di-card-header">
    <span class="di-dot">${dotHtml(f.severity)}</span>
    <span class="di-kind-badge">${esc(kindLabel(f.kind))}</span>
    <span class="di-project-context" title="${esc(primaryProject)}">Project: ${esc(primaryProject)}</span>
    <span class="di-card-title">${esc(f.title)}</span>
    ${decisionLabel}
  </div>
  <div class="di-card-body">
    <div class="di-context-grid">
      <div class="k">What</div><div class="v">${esc(f.reason)}</div>
      <div class="k">When</div><div class="v">Found during scan on ${esc(scanDate)}</div>
      <div class="k">Where</div><div class="v">${esc(whereText)}</div>
      <div class="k">How</div><div class="v">${esc(avoidTip)}</div>
    </div>
    <div class="di-reason">${esc(f.reason)}</div>
    <div class="di-recommendation">💡 ${esc(f.recommendation)}</div>
    ${filesHtml}
    <div class="di-decisions">
      <button class="di-accept-btn"
        data-di-action="accept"
        title="Queue this action — runs when you click Execute Accepted">
        ✅ Accept: ${esc(actionLabel)}
      </button>
      ${f.action !== 'none' && f.kind !== 'duplicate' && f.kind !== 'similar' ? `
      <button class="di-preview-btn"
        data-di-action="preview"
        data-paths="${pathsJson}"
        title="Preview without executing">
        👁 Preview
      </button>` : ''}
      <button class="di-skip-btn"
        data-di-action="skip"
        title="Skip this finding">
        ⏭ Skip
      </button>
      ${f.decision && f.decision !== 'pending' ? `
      <button class="di-undo-btn"
        data-di-action="undo"
        title="Mark as pending again">
        ↩ Undo
      </button>` : ''}
    </div>
  </div>
</div>`;
}
