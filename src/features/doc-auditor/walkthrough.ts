// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import * as fs     from 'fs';
import { log }     from '../../shared/output-channel';
import { mergeFiles, moveToGlobal, deleteDoc, diffFiles } from './actions';
import type { AuditResults, Finding, FindingKind } from './types';

const FEATURE = 'doc-auditor';

export function buildFindingsList(results: AuditResults): Finding[] {
    const findings: Finding[] = [];
    for (const g of results.duplicates) {
        findings.push({ kind:'duplicate', title:`Duplicate: ${g.fileName}`, description:`${g.files.length} copies in: ${g.files.map(f=>f.projectName).join(', ')}`, primaryPaths: g.files.map(f=>f.filePath) });
    }
    for (const g of results.similar) {
        findings.push({ kind:'similar', title:`${Math.round(g.similarity*100)}% similar: ${g.fileA.fileName} ↔ ${g.fileB.fileName}`, description:`${g.fileA.projectName} ↔ ${g.fileB.projectName} · ${g.reason}`, primaryPaths:[g.fileA.filePath,g.fileB.filePath] });
    }
    for (const c of results.moveCandidates) {
        findings.push({ kind:'move', title:`Move to Global: ${c.file.fileName}`, description:`${c.file.projectName} · ${c.reason}`, primaryPaths:[c.file.filePath], secondaryPath:c.file.filePath });
    }
    for (const o of results.orphans) {
        findings.push({ kind:'orphan', title:`Orphan: ${o.file.fileName}`, description:`${o.file.projectName} · ${o.reason}`, primaryPaths:[o.file.filePath], secondaryPath:o.file.filePath });
    }
    return findings;
}

function esc(s: string): string {
    return String(s ?? '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c] ?? c));
}

const KIND_ICON: Record<FindingKind, string>  = { duplicate:'📄', similar:'🔀', move:'📦', orphan:'👻' };
const KIND_COLOR: Record<FindingKind, string> = { duplicate:'#f48771', similar:'#cca700', move:'#3fb950', orphan:'#858585' };

function buildWalkthroughHtml(findings: Finding[]): string {
    const findingsJson = JSON.stringify(findings.map(f => ({
        kind: f.kind,
        title: f.title,
        description: f.description,
        primaryPaths: f.primaryPaths,
        secondaryPath: f.secondaryPath ?? '',
    })));

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);display:flex;height:100vh;overflow:hidden}
#sidebar{width:220px;flex-shrink:0;border-right:1px solid var(--vscode-panel-border);overflow-y:auto;display:flex;flex-direction:column}
#sidebar-hd{padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--vscode-descriptionForeground);flex-shrink:0}
.finding-item{padding:8px 12px;cursor:pointer;border-left:3px solid transparent;font-size:12px;display:flex;flex-direction:column;gap:2px;border-bottom:1px solid var(--vscode-panel-border)}
.finding-item:hover{background:var(--vscode-list-hoverBackground)}
.finding-item.active{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground);border-left-color:var(--vscode-focusBorder)}
.finding-item.done{opacity:0.5}
.finding-item .fi-kind{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em}
.finding-item .fi-title{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#main{flex:1;display:flex;flex-direction:column;overflow:hidden}
#progress{padding:8px 16px;border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--vscode-textCodeBlock-background)}
#progress-bar-wrap{flex:1;height:4px;background:var(--vscode-panel-border);border-radius:2px}
#progress-bar{height:4px;background:var(--vscode-focusBorder);border-radius:2px;transition:width 0.3s}
#progress-txt{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
#finding-area{flex:1;padding:20px 24px;overflow-y:auto}
#finding-kind{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px}
#finding-title{font-size:1.15em;font-weight:700;margin-bottom:6px;line-height:1.4}
#finding-desc{font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:14px;line-height:1.6}
#finding-paths{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:8px 12px;margin-bottom:18px;display:flex;flex-direction:column;gap:4px}
.path-line{color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#actions-area{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.act-btn{border:none;border-radius:3px;padding:6px 16px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit}
.act-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.act-primary:hover{background:var(--vscode-button-hoverBackground)}
.act-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.act-secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
.act-danger{background:#c52828;color:#fff}
.act-danger:hover{background:#a32020}
#nav-row{display:flex;gap:8px;align-items:center;padding-top:12px;border-top:1px solid var(--vscode-panel-border)}
#nav-prev,#nav-next{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:5px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-family:inherit}
#nav-prev:hover,#nav-next:hover{background:var(--vscode-button-secondaryHoverBackground)}
#nav-prev:disabled,#nav-next:disabled{opacity:0.35;cursor:default}
#nav-stop{background:transparent;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px;font-family:inherit;margin-left:auto}
#nav-stop:hover{border-color:var(--vscode-focusBorder)}
#done-banner{display:none;text-align:center;padding:40px 20px;flex-direction:column;align-items:center;gap:12px}
#done-banner.visible{display:flex}
#finding-area.done-mode{display:none}
</style></head><body>
<div id="sidebar">
  <div id="sidebar-hd">Findings <span id="sb-count" style="font-weight:400;opacity:0.6"></span></div>
  <div id="sb-list"></div>
</div>
<div id="main">
  <div id="progress">
    <div id="progress-bar-wrap"><div id="progress-bar" style="width:0%"></div></div>
    <span id="progress-txt">0 of ${findings.length} resolved</span>
  </div>
  <div id="finding-area">
    <div id="finding-kind"></div>
    <div id="finding-title"></div>
    <div id="finding-desc"></div>
    <div id="finding-paths"></div>
    <div id="actions-area"></div>
    <div id="nav-row">
      <button id="nav-prev" disabled>&#8592; Prev</button>
      <button id="nav-next">Next &#8594;</button>
      <button id="nav-stop">Stop walkthrough</button>
    </div>
  </div>
  <div id="done-banner">
    <div style="font-size:2em">✅</div>
    <div style="font-size:1.1em;font-weight:700">Walkthrough complete</div>
    <div id="done-summary" style="color:var(--vscode-descriptionForeground);font-size:12px"></div>
  </div>
</div>
<script>(function(){
'use strict';
const vscode   = acquireVsCodeApi();
const FINDINGS = ${findingsJson};
const TOTAL    = FINDINGS.length;

var _idx     = 0;
var _done    = new Array(TOTAL).fill(false);
var _actioned = 0, _skipped = 0;

var elKind    = document.getElementById('finding-kind');
var elTitle   = document.getElementById('finding-title');
var elDesc    = document.getElementById('finding-desc');
var elPaths   = document.getElementById('finding-paths');
var elActions = document.getElementById('actions-area');
var elPrev    = document.getElementById('nav-prev');
var elNext    = document.getElementById('nav-next');
var elStop    = document.getElementById('nav-stop');
var elBar     = document.getElementById('progress-bar');
var elBarTxt  = document.getElementById('progress-txt');
var elSbList  = document.getElementById('sb-list');
var elSbCnt   = document.getElementById('sb-count');
var elArea    = document.getElementById('finding-area');
var elDone    = document.getElementById('done-banner');
var elDoneSumm= document.getElementById('done-summary');

var KIND_ICON  = { duplicate:'📄', similar:'🔀', move:'📦', orphan:'👻' };
var KIND_COLOR = { duplicate:'#f48771', similar:'#cca700', move:'#3fb950', orphan:'#858585' };

var ACTIONS_FOR = {
  duplicate: [{label:'Merge all into one', act:'merge', cls:'act-primary'}, {label:'Open first copy', act:'open', cls:'act-secondary'}, {label:'Skip', act:'skip', cls:'act-secondary'}],
  similar:   [{label:'Diff side by side', act:'diff', cls:'act-primary'}, {label:'Merge into one', act:'merge', cls:'act-secondary'}, {label:'Skip', act:'skip', cls:'act-secondary'}],
  move:      [{label:'Move to Global', act:'move', cls:'act-primary'}, {label:'Open file', act:'open', cls:'act-secondary'}, {label:'Skip', act:'skip', cls:'act-secondary'}],
  orphan:    [{label:'Open to review', act:'open', cls:'act-primary'}, {label:'Delete file', act:'delete', cls:'act-danger'}, {label:'Skip', act:'skip', cls:'act-secondary'}],
};

function renderSidebar() {
  var html = '';
  for (var i = 0; i < TOTAL; i++) {
    var f = FINDINGS[i];
    var cls = 'finding-item' + (i === _idx ? ' active' : '') + (_done[i] ? ' done' : '');
    html += '<div class="' + cls + '" data-idx="' + i + '">'
      + '<span class="fi-kind" style="color:' + (KIND_COLOR[f.kind]||'#888') + '">' + (KIND_ICON[f.kind]||'') + ' ' + f.kind + '</span>'
      + '<span class="fi-title">' + f.title.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>'
      + '</div>';
  }
  elSbList.innerHTML = html;
  elSbCnt.textContent = '(' + TOTAL + ')';
}

function renderFinding(i) {
  var f = FINDINGS[i];
  elKind.textContent  = (KIND_ICON[f.kind]||'') + '  ' + f.kind;
  elKind.style.color  = KIND_COLOR[f.kind] || '#888';
  elTitle.textContent = f.title;
  elDesc.textContent  = f.description;

  var pathsHtml = (f.primaryPaths || []).map(function(p) {
    return '<span class="path-line">' + p.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>';
  }).join('');
  elPaths.innerHTML = pathsHtml || '<span style="opacity:0.5">—</span>';

  var acts = ACTIONS_FOR[f.kind] || [];
  var html = '';
  acts.forEach(function(a) {
    html += '<button class="act-btn ' + a.cls + '" data-act="' + a.act + '">' + a.label + '</button>';
  });
  elActions.innerHTML = html;

  elPrev.disabled = (i === 0);
  elNext.disabled = (i === TOTAL - 1);
  updateProgress();
}

function updateProgress() {
  var resolved = _done.filter(Boolean).length;
  var pct = TOTAL > 0 ? Math.round(resolved / TOTAL * 100) : 0;
  elBar.style.width = pct + '%';
  elBarTxt.textContent = resolved + ' of ' + TOTAL + ' resolved';
}

function navigateTo(i) {
  _idx = Math.max(0, Math.min(TOTAL - 1, i));
  renderFinding(_idx);
  renderSidebar();
  // Scroll sidebar to show active item
  var active = elSbList.querySelector('.finding-item.active');
  if (active) { active.scrollIntoView({ block: 'nearest' }); }
}

function markDone(i, wasAction) {
  _done[i] = true;
  if (wasAction) { _actioned++; } else { _skipped++; }
  updateProgress();
  renderSidebar();
  // Auto-advance to next unresolved finding
  for (var j = i + 1; j < TOTAL; j++) {
    if (!_done[j]) { navigateTo(j); return; }
  }
  // All done
  showDone();
}

function showDone() {
  elArea.style.display = 'none';
  elDone.classList.add('visible');
  elDoneSumm.textContent = _actioned + ' actions taken, ' + _skipped + ' skipped of ' + TOTAL + ' findings.';
  vscode.postMessage({ command: 'walkthrough-done', actioned: _actioned, skipped: _skipped });
}

elActions.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-act]');
  if (!btn) { return; }
  var act = btn.dataset.act;
  var f   = FINDINGS[_idx];
  if (act === 'skip') { markDone(_idx, false); return; }
  vscode.postMessage({ command: 'walkthrough-action', action: act, finding: _idx, primaryPaths: f.primaryPaths, secondaryPath: f.secondaryPath });
  markDone(_idx, true);
});

elPrev.addEventListener('click', function() { navigateTo(_idx - 1); });
elNext.addEventListener('click', function() { navigateTo(_idx + 1); });
elStop.addEventListener('click', showDone);

elSbList.addEventListener('click', function(e) {
  var item = e.target.closest('[data-idx]');
  if (item) { navigateTo(parseInt(item.dataset.idx, 10)); }
});

// Initial render
renderSidebar();
if (TOTAL > 0) { renderFinding(0); }
else { showDone(); }
})();</script></body></html>`;
}

export async function walkThroughFindings(results: AuditResults): Promise<void> {
    const findings = buildFindingsList(results);
    if (!findings.length) { vscode.window.showInformationMessage('No findings to walk through.'); return; }

    const panel = vscode.window.createWebviewPanel(
        'docAuditWalkthrough', '🔍 Audit Walkthrough',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.webview.html = buildWalkthroughHtml(findings);

    panel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'walkthrough-done') {
            const { actioned, skipped } = msg;
            vscode.window.showInformationMessage(`Walkthrough complete — ${actioned} actions taken, ${skipped} skipped.`);
            log(FEATURE, `Walkthrough: ${actioned} actioned, ${skipped} skipped of ${findings.length}`);
            return;
        }
        if (msg.command === 'walkthrough-action') {
            const f = findings[msg.finding as number];
            if (!f) { return; }
            const action: string = msg.action;
            try {
                switch (action) {
                    case 'merge':  await mergeFiles(msg.primaryPaths as string[]); break;
                    case 'diff':   await diffFiles(msg.primaryPaths as string[]); break;
                    case 'move':   if (msg.secondaryPath) { await moveToGlobal(msg.secondaryPath as string); } break;
                    case 'delete': if (msg.secondaryPath) { await deleteDoc(msg.secondaryPath as string); } break;
                    case 'open': {
                        const p = (msg.secondaryPath as string) || (msg.primaryPaths as string[])[0];
                        if (p && fs.existsSync(p)) {
                            const doc = await vscode.workspace.openTextDocument(p);
                            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                        }
                        break;
                    }
                }
            } catch (err) {
                vscode.window.showErrorMessage(`Action failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    });
}
