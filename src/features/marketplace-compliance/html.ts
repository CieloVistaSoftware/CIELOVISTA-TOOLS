// Copyright (c) 2025 CieloVista Software. All rights reserved.
import { esc } from '../../shared/webview-utils';
import type { ProjectCompliance } from './types';

function scoreColor(score: number): string {
    if (score >= 80) { return 'var(--vscode-testing-iconPassed)'; }
    if (score >= 50) { return 'var(--vscode-inputValidation-warningBorder,#cca700)'; }
    return 'var(--vscode-inputValidation-errorBorder,#f48771)';
}

export function buildComplianceHtml(results: ProjectCompliance[]): string {
    const perfect = results.filter(r => r.score === 100).length;
    const total   = results.length;
    const fixable = results.filter(r => r.issues.some(i => i.fixable)).length;

    const rows = results.map(r => {
        const issueHtml = r.issues.length === 0
            ? '<span style="color:var(--vscode-testing-iconPassed)">✅ All good</span>'
            : r.issues.map(i => {
                const icon   = i.severity === 'error' ? '🔴' : i.severity === 'warning' ? '🟡' : 'ℹ️';
                const fixBtn = i.fixable
                    ? `<button class="cvs-btn-sm" data-action="fix-one" data-proj="${esc(r.project.name)}">Fix</button>`
                    : '';
                return `<div class="cvs-issue">${icon} <span class="cvs-issue-file">${esc(i.file)}</span> — ${esc(i.message)} ${fixBtn}</div>`;
            }).join('');

        return `<tr>
  <td><button class="cvs-link-btn" data-action="open-folder" data-path="${esc(r.project.path)}">${esc(r.project.name)}</button></td>
  <td><span class="cvs-badge">${esc(r.project.type)}</span></td>
  <td><span style="font-weight:700;color:${scoreColor(r.score)}">${r.score}</span></td>
  <td style="max-width:360px">${issueHtml}</td>
  <td style="white-space:nowrap">
    ${r.issues.some(i => i.fixable) ? `<button class="cvs-btn" data-action="fix-one" data-proj="${esc(r.project.name)}">🔧 Fix</button>` : ''}
    <button class="cvs-btn-secondary" data-action="open-folder" data-path="${esc(r.project.path)}">📂 Open</button>
  </td>
</tr>`;
    }).join('');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
.cvs-toolbar{position:sticky;top:0;z-index:50;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:8px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cvs-toolbar-title{font-size:1.05em;font-weight:700;white-space:nowrap;margin-right:4px}
.cvs-btn,.cvs-btn-secondary,.cvs-btn-sm{border:none;border-radius:3px;cursor:pointer;font-family:inherit;font-weight:600;transition:opacity 0.1s}
.cvs-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:5px 14px;font-size:12px}
.cvs-btn:hover{background:var(--vscode-button-hoverBackground)}
.cvs-btn-secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);padding:5px 12px;font-size:12px}
.cvs-btn-secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
.cvs-btn-sm{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);padding:2px 8px;font-size:11px}
.cvs-btn-sm:hover{background:var(--vscode-button-secondaryHoverBackground)}
.cvs-pill{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid}
.cvs-pill-ok{border-color:var(--vscode-testing-iconPassed);color:var(--vscode-testing-iconPassed)}
.cvs-pill-warn{border-color:var(--vscode-inputValidation-warningBorder,#cca700);color:var(--vscode-inputValidation-warningBorder,#cca700)}
.cvs-badge{display:inline-block;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 7px;font-size:0.8em}
.cvs-link-btn{background:none;border:none;color:var(--vscode-textLink-foreground);cursor:pointer;font-size:inherit;font-weight:700;padding:0;text-decoration:underline;font-family:inherit}
.cvs-issue{font-size:11px;line-height:1.6;display:flex;gap:5px;align-items:flex-start;flex-wrap:wrap;margin-bottom:2px}
.cvs-issue-file{font-family:var(--vscode-editor-font-family);font-weight:700;color:var(--vscode-textLink-foreground)}
.cvs-status{padding:6px 16px;font-size:12px;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textCodeBlock-background);margin:8px 16px;border-radius:2px;display:none}
.cvs-status.visible{display:block}
.cvs-content{padding:12px 16px}
.cvs-table{width:100%;border-collapse:collapse;font-size:12px}
.cvs-table th{text-align:left;padding:6px 10px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-weight:700;white-space:nowrap;font-size:11px;text-transform:uppercase}
.cvs-table td{padding:7px 10px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}
.cvs-table tr:hover td{background:var(--vscode-list-hoverBackground)}
</style>
</head><body>
<div class="cvs-toolbar">
  <span class="cvs-toolbar-title">🛒 Marketplace Compliance</span>
  <span class="cvs-pill cvs-pill-ok">✅ ${perfect} of ${total} perfect</span>
  <span class="cvs-pill cvs-pill-warn">🔧 ${fixable} have auto-fixes</span>
  <div style="flex:1"></div>
  <button class="cvs-btn" data-action="fix-all">🔧 Fix All Auto-Fixable</button>
  <button class="cvs-btn-secondary" data-action="rescan">↺ Rescan</button>
</div>
<div id="cvs-status" class="cvs-status"></div>
<div class="cvs-content">
  <table class="cvs-table">
    <thead><tr><th>Project</th><th>Type</th><th>Score</th><th>Issues</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();
function setStatus(text, ok) {
  var el = document.getElementById('cvs-status');
  el.textContent = text; el.className = 'cvs-status visible';
  el.style.borderColor = ok ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-focusBorder)';
}
document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]'); if (!btn) { return; }
  var a = btn.dataset.action;
  if (a === 'fix-all')    { setStatus('🔧 Fixing all…'); vscode.postMessage({ command: 'fixAll' }); }
  if (a === 'fix-one')    { setStatus('🔧 Fixing ' + btn.dataset.proj + '…'); vscode.postMessage({ command: 'fixOne', project: btn.dataset.proj }); }
  if (a === 'open-folder'){ vscode.postMessage({ command: 'openFolder', path: btn.dataset.path }); }
  if (a === 'rescan')     { setStatus('↺ Rescanning…'); vscode.postMessage({ command: 'rescan' }); }
});
window.addEventListener('message', function(e) {
  if (e.data.type === 'done') { setStatus('✅ ' + e.data.text, true); }
});
})();
</script>
</body></html>`;
}

export function buildSummaryHtml(lines: string[], totalFiles: number, totalProjects: number): string {
    const ICONS: Record<string, string> = { 'LICENSE': '📄', 'CHANGELOG.md': '📝', 'icon.png': '🎨', 'package.json': '📦' };
    const rows = lines.map(line => {
        const [proj, ...rest] = line.split(': ');
        const files = rest.join(': ').split(', ');
        const fileHtml = files.map(f => `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:2px 8px;font-size:11px;margin:2px 3px 2px 0">${ICONS[f.trim()] ?? '✅'} ${esc(f.trim())}</span>`).join('');
        return `<tr><td style="font-weight:700;white-space:nowrap;padding:6px 10px">${esc(proj)}</td><td style="padding:6px 10px">${fileHtml}</td></tr>`;
    }).join('');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:20px}h1{font-size:1.15em;font-weight:700;margin-bottom:6px}.sub{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:16px}.pills{display:flex;gap:16px;margin-bottom:16px}.pill{padding:4px 12px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid var(--vscode-testing-iconPassed);color:var(--vscode-testing-iconPassed)}table{width:100%;border-collapse:collapse}th{text-align:left;padding:6px 10px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-weight:700;font-size:11px}td{border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle}</style>
</head><body>
<h1>✅ Marketplace Fix Complete</h1>
<p class="sub">Auto-fix run completed ${new Date().toLocaleTimeString()}</p>
<div class="pills"><span class="pill">${totalFiles} file(s) created/updated</span><span class="pill">${totalProjects} project(s) fixed</span></div>
<table><thead><tr><th>Project</th><th>Files Created / Updated</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}
