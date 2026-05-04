// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * license-sync.ts
 *
 * Scans all registered projects for LICENSE files and lets you push
 * the canonical CieloVistaStandards LICENSE to every project in one click.
 *
 * Features:
 *   - Shows current license status per project (missing / matches / differs)
 *   - Live editable canonical text in the panel
 *   - Per-project Update button
 *   - "Update All" for everything that doesn't match
 *   - Saves edits back to CieloVistaStandards/LICENSE
 *   - Opens updated files beside the panel
 *
 * Command: cvs.license.sync
 */

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError } from '../shared/output-channel';
import { REGISTRY_PATH, loadRegistry, ProjectEntry } from '../shared/registry';

const FEATURE        = 'license-sync';
const CANONICAL_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\LICENSE';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadCanonical(): string {
    try {
        if (!fs.existsSync(CANONICAL_PATH)) { return ''; }
        return fs.readFileSync(CANONICAL_PATH, 'utf8');
    } catch { return ''; }
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type LicenseStatus = 'missing' | 'matches' | 'differs';

interface ProjectLicense {
    name:       string;
    projPath:   string;
    type:       string;
    status:     LicenseStatus;
    licensePath:string;
    current:    string; // current content (empty if missing)
}

function scanProject(project: ProjectEntry, canonical: string): ProjectLicense {
    const licensePath = path.join(project.path, 'LICENSE');
    const licenseTxt  = path.join(project.path, 'LICENSE.txt');
    const actualPath  = fs.existsSync(licensePath) ? licensePath
                      : fs.existsSync(licenseTxt)  ? licenseTxt
                      : licensePath; // default write target

    if (!fs.existsSync(project.path)) {
        return { name: project.name, projPath: project.path, type: project.type,
                 status: 'missing', licensePath: actualPath, current: '' };
    }

    const exists = fs.existsSync(actualPath);
    if (!exists) {
        return { name: project.name, projPath: project.path, type: project.type,
                 status: 'missing', licensePath: actualPath, current: '' };
    }

    try {
        const current = fs.readFileSync(actualPath, 'utf8');
        const matches = current.trim() === canonical.trim();
        return { name: project.name, projPath: project.path, type: project.type,
                 status: matches ? 'matches' : 'differs', licensePath: actualPath, current };
    } catch {
        return { name: project.name, projPath: project.path, type: project.type,
                 status: 'missing', licensePath: actualPath, current: '' };
    }
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function buildHtml(projects: ProjectLicense[], canonical: string): string {
    const total   = projects.length;
    const matches = projects.filter(p => p.status === 'matches').length;
    const differs = projects.filter(p => p.status === 'differs').length;
    const missing = projects.filter(p => p.status === 'missing').length;
    const needsUpdate = differs + missing;

    const rows = projects.map(p => {
        const dot   = p.status === 'matches' ? '🟢'
                    : p.status === 'differs' ? '🟡'
                    : '🔴';
        const label = p.status === 'matches' ? '<span class="ok-label">Matches canonical</span>'
                    : p.status === 'differs' ? '<span class="warn-label">Different content</span>'
                    : '<span class="err-label">Missing LICENSE</span>';
        const diffBtn = p.status === 'differs'
            ? `<button class="sec-btn" data-action="diff" data-proj="${esc(p.name)}" title="Diff current vs canonical">⬛ Diff</button>`
            : '';
        const updateBtn = p.status !== 'matches'
            ? `<button class="fix-btn" data-action="update" data-proj="${esc(p.name)}">⬆ Update</button>`
            : '';
        const openBtn = p.status !== 'missing'
            ? `<button class="sec-btn" data-action="open" data-proj="${esc(p.name)}" title="Open current LICENSE">📄 Open</button>`
            : '';

        return `<tr class="row-${esc(p.status)}">
  <td class="dot-cell">${dot}</td>
  <td class="name-cell">${esc(p.name)}</td>
  <td class="type-cell">${esc(p.type)}</td>
  <td class="status-cell">${label}</td>
  <td class="btn-cell">${diffBtn}${openBtn}${updateBtn}</td>
</tr>`;
    }).join('');

    const canonicalEscaped = esc(canonical);
    const year = new Date().getFullYear();

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}

.toolbar{position:sticky;top:0;z-index:10;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.toolbar h2{font-size:1.05em;font-weight:700;flex:1;white-space:nowrap}
.pill{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid;white-space:nowrap}
.pill-ok  {border-color:var(--vscode-testing-iconPassed);color:var(--vscode-testing-iconPassed)}
.pill-warn{border-color:#cca700;color:#cca700}
.pill-err {border-color:var(--vscode-inputValidation-errorBorder,#f48771);color:var(--vscode-inputValidation-errorBorder,#f48771)}
.rescan-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:12px}
.rescan-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.update-all-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:4px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:700}
.update-all-btn:hover{background:var(--vscode-button-hoverBackground)}
.update-all-btn:disabled{opacity:0.4;cursor:not-allowed}

.content{padding:12px 16px 60px}

.canonical-box{border:1px solid var(--vscode-panel-border);border-radius:4px;margin-bottom:18px}
.canonical-header{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--vscode-textCodeBlock-background);border-bottom:1px solid var(--vscode-panel-border);border-radius:4px 4px 0 0}
.canonical-header h3{font-size:0.9em;font-weight:700;flex:1}
.canonical-path{font-family:var(--vscode-editor-font-family);font-size:10px;color:var(--vscode-descriptionForeground)}
.save-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600}
.save-btn:hover{background:var(--vscode-button-hoverBackground)}
.save-btn:disabled{opacity:0.4;cursor:not-allowed}
.year-hint{font-size:10px;color:var(--vscode-descriptionForeground)}
#canonical-text{
  width:100%;min-height:160px;max-height:300px;resize:vertical;
  font-family:var(--vscode-editor-font-family);font-size:12px;line-height:1.55;
  background:var(--vscode-input-background);color:var(--vscode-input-foreground);
  border:none;padding:10px 12px;border-radius:0 0 4px 4px;
  outline:none;
}
#canonical-text:focus{outline:1px solid var(--vscode-focusBorder)}

table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:6px 10px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap}
td{padding:6px 10px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle}
tr:hover td{background:var(--vscode-list-hoverBackground)}
.dot-cell{width:28px;font-size:14px;text-align:center}
.name-cell{font-weight:700;white-space:nowrap}
.type-cell{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.status-cell{}
.btn-cell{white-space:nowrap;text-align:right;display:flex;gap:4px;justify-content:flex-end;align-items:center}

.ok-label  {color:var(--vscode-testing-iconPassed);font-size:11px}
.warn-label{color:#cca700;font-size:11px}
.err-label {color:var(--vscode-inputValidation-errorBorder,#f48771);font-size:11px}

.fix-btn{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap}
.fix-btn:hover{background:var(--vscode-button-hoverBackground)}
.sec-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;padding:3px 9px;border-radius:3px;cursor:pointer;font-size:11px;white-space:nowrap}
.sec-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}

#status-bar{position:fixed;bottom:0;left:0;right:0;padding:6px 16px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);border-top:1px solid var(--vscode-panel-border);display:none}
#status-bar.visible{display:block}
.changed-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#cca700;margin-right:6px;vertical-align:middle;display:none}
.changed-dot.visible{display:inline-block}
</style>
</head><body>

<div class="toolbar">
  <h2>📄 License Sync</h2>
  <span class="pill pill-ok">🟢 ${matches} match</span>
  ${differs > 0 ? `<span class="pill pill-warn">🟡 ${differs} differ</span>` : ''}
  ${missing > 0 ? `<span class="pill pill-err">🔴 ${missing} missing</span>` : ''}
  <button class="rescan-btn" id="btn-rescan">↺ Rescan</button>
  <button class="update-all-btn" id="btn-update-all" ${needsUpdate === 0 ? 'disabled' : ''}>
    ⬆ Update All (${needsUpdate})
  </button>
</div>

<div class="content">

  <div class="canonical-box">
    <div class="canonical-header">
      <h3>📋 Canonical LICENSE</h3>
      <span class="year-hint">Current year: ${year} — update the year in the text as needed</span>
      <span class="canonical-path">${esc(CANONICAL_PATH)}</span>
      <span class="changed-dot" id="changed-dot"></span>
      <button class="save-btn" id="btn-save" disabled>💾 Save Canonical</button>
      <button class="sec-btn" id="btn-open-canonical">📄 Open File</button>
    </div>
    <textarea id="canonical-text" spellcheck="false">${canonicalEscaped}</textarea>
  </div>

  <table>
    <thead>
      <tr><th></th><th>Project</th><th>Type</th><th>Status</th><th style="text-align:right">Actions</th></tr>
    </thead>
    <tbody id="project-rows">${rows}</tbody>
  </table>

</div>

<div id="status-bar"></div>

<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();

// ── Status bar ────────────────────────────────────────────────────────────
function showStatus(t, duration){
  var b = document.getElementById('status-bar');
  b.textContent = t;
  b.className = 'visible';
  clearTimeout(b._timer);
  b._timer = setTimeout(function(){ b.className=''; }, duration || 4000);
}

// ── Canonical text change tracking ────────────────────────────────────────
var ta       = document.getElementById('canonical-text');
var saveBtn  = document.getElementById('btn-save');
var dot      = document.getElementById('changed-dot');
var _dirty   = false;

ta.addEventListener('input', function(){
  if (!_dirty) {
    _dirty = true;
    saveBtn.disabled = false;
    dot.className = 'changed-dot visible';
  }
});

// ── Save canonical ────────────────────────────────────────────────────────
saveBtn.addEventListener('click', function(){
  vscode.postMessage({ action: 'saveCanonical', text: ta.value });
  showStatus('💾 Saving canonical LICENSE…');
  _dirty = false;
  saveBtn.disabled = true;
  dot.className = 'changed-dot';
});

// ── Open canonical file ───────────────────────────────────────────────────
document.getElementById('btn-open-canonical').addEventListener('click', function(){
  vscode.postMessage({ action: 'openCanonical' });
});

// ── Rescan ────────────────────────────────────────────────────────────────
document.getElementById('btn-rescan').addEventListener('click', function(){
  if (_dirty) {
    if (!confirm('You have unsaved changes to the canonical text. Rescan anyway?')) { return; }
  }
  showStatus('Rescanning…');
  vscode.postMessage({ action: 'rescan' });
});

// ── Update all ────────────────────────────────────────────────────────────
document.getElementById('btn-update-all').addEventListener('click', function(){
  var canonical = ta.value;
  if (!canonical.trim()) { showStatus('❌ Canonical text is empty — nothing to write'); return; }
  showStatus('⬆ Updating all projects…');
  vscode.postMessage({ action: 'updateAll', canonical: canonical });
});

// ── Per-row actions ───────────────────────────────────────────────────────
document.addEventListener('click', function(e){
  var btn = e.target.closest('[data-action]');
  if (!btn) { return; }
  var action = btn.dataset.action;
  var proj   = btn.dataset.proj;
  if (!proj) { return; }

  if (action === 'update') {
    var canonical = ta.value;
    if (!canonical.trim()) { showStatus('❌ Canonical text is empty'); return; }
    showStatus('⬆ Updating ' + proj + '…');
    vscode.postMessage({ action: 'updateOne', proj: proj, canonical: canonical });
  }
  if (action === 'diff') {
    showStatus('Opening diff for ' + proj + '…');
    vscode.postMessage({ action: 'diff', proj: proj });
  }
  if (action === 'open') {
    vscode.postMessage({ action: 'open', proj: proj });
  }
});

// ── Messages from extension ───────────────────────────────────────────────
window.addEventListener('message', function(e){
  var m = e.data;
  if (m.type === 'done')  { showStatus('✅ ' + m.text); }
  if (m.type === 'error') { showStatus('❌ ' + m.text, 6000); }
  if (m.type === 'canonical') {
    // Canonical was reloaded (after save or rescan)
    ta.value = m.text;
    _dirty = false;
    saveBtn.disabled = true;
    dot.className = 'changed-dot';
  }
});

})();
</script>
</body></html>`;
}

// ─── Command ─────────────────────────────────────────────────────────────────

export async function runLicenseSync(): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }

    let canonical = loadCanonical();
    if (!canonical) {
        const create = await vscode.window.showWarningMessage(
            `No canonical LICENSE found at ${CANONICAL_PATH}. Create one now?`,
            'Create', 'Cancel'
        );
        if (create !== 'Create') { return; }
        const year = new Date().getFullYear();
        canonical = `Copyright (c) ${year} CieloVista Software. All rights reserved.\n\nThis software and its associated documentation files (the "Software") are the\nexclusive proprietary property of CieloVista Software. Unauthorized copying,\ndistribution, modification, or use of this Software, in whole or in part, is\nstrictly prohibited without the prior express written permission of CieloVista Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.\n`;
        fs.writeFileSync(CANONICAL_PATH, canonical, 'utf8');
        log(FEATURE, `Created canonical LICENSE at ${CANONICAL_PATH}`);
    }

    const projects = registry.projects.map(p => scanProject(p, canonical));

    const panel = vscode.window.createWebviewPanel(
        'licenseSync', '📄 License Sync', vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = buildHtml(projects, canonical);

    panel.webview.onDidReceiveMessage(async msg => {
        const { action } = msg as { action: string };

        try {
            // ── Save canonical ──────────────────────────────────────────
            if (action === 'saveCanonical') {
                const text = (msg as any).text as string;
                fs.writeFileSync(CANONICAL_PATH, text, 'utf8');
                log(FEATURE, 'Canonical LICENSE saved');
                panel.webview.postMessage({ type: 'done', text: 'Canonical LICENSE saved' });
                panel.webview.postMessage({ type: 'canonical', text });
                return;
            }

            // ── Open canonical ──────────────────────────────────────────
            if (action === 'openCanonical') {
                const doc = await vscode.workspace.openTextDocument(CANONICAL_PATH);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                return;
            }

            // ── Rescan ──────────────────────────────────────────────────
            if (action === 'rescan') {
                const fresh    = loadRegistry();
                const freshCan = loadCanonical();
                if (!fresh) { return; }
                const freshProjects = fresh.projects.map(p => scanProject(p, freshCan));
                panel.webview.html = buildHtml(freshProjects, freshCan);
                panel.webview.postMessage({ type: 'canonical', text: freshCan });
                return;
            }

            // ── Update one ──────────────────────────────────────────────
            if (action === 'updateOne') {
                const proj      = (msg as any).proj as string;
                const canonical = ((msg as any).canonical as string).trim();
                const reg       = loadRegistry();
                if (!reg) { return; }
                const entry = reg.projects.find(p => p.name === proj);
                if (!entry || !fs.existsSync(entry.path)) {
                    panel.webview.postMessage({ type: 'error', text: `Project path not found: ${proj}` });
                    return;
                }
                const licensePath = path.join(entry.path, 'LICENSE');
                fs.writeFileSync(licensePath, canonical + '\n', 'utf8');
                log(FEATURE, `Updated LICENSE: ${licensePath}`);
                const doc = await vscode.workspace.openTextDocument(licensePath);
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                // Rescan and refresh
                const updated = reg.projects.map(p => scanProject(p, canonical));
                panel.webview.html = buildHtml(updated, canonical);
                panel.webview.postMessage({ type: 'done', text: `LICENSE updated for ${proj}` });
                return;
            }

            // ── Update all ──────────────────────────────────────────────
            if (action === 'updateAll') {
                const canonical = ((msg as any).canonical as string).trim();
                const reg       = loadRegistry();
                if (!reg) { return; }
                let updated = 0;
                let skipped = 0;
                for (const p of reg.projects) {
                    if (!fs.existsSync(p.path)) { skipped++; continue; }
                    const result = scanProject(p, canonical);
                    if (result.status === 'matches') { skipped++; continue; }
                    const licensePath = path.join(p.path, 'LICENSE');
                    try {
                        fs.writeFileSync(licensePath, canonical + '\n', 'utf8');
                        log(FEATURE, `Updated LICENSE: ${licensePath}`);
                        updated++;
                    } catch (err) {
                        logError(`Failed to write LICENSE for ${p.name}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                        skipped++;
                    }
                }
                // Save canonical too if it changed
                fs.writeFileSync(CANONICAL_PATH, canonical + '\n', 'utf8');
                // Refresh panel
                const freshProjects = reg.projects.map(p => scanProject(p, canonical));
                panel.webview.html = buildHtml(freshProjects, canonical);
                panel.webview.postMessage({ type: 'done', text: `Updated ${updated} project${updated !== 1 ? 's' : ''}${skipped ? `, ${skipped} skipped` : ''}` });
                return;
            }

            // ── Diff ────────────────────────────────────────────────────
            if (action === 'diff') {
                const proj = (msg as any).proj as string;
                const reg  = loadRegistry();
                if (!reg) { return; }
                const entry = reg.projects.find(p => p.name === proj);
                if (!entry) { return; }
                const currentPath   = path.join(entry.path, 'LICENSE');
                if (!fs.existsSync(currentPath)) { return; }
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    vscode.Uri.file(currentPath),
                    vscode.Uri.file(CANONICAL_PATH),
                    `${proj}/LICENSE ↔ Canonical`
                );
                return;
            }

            // ── Open ────────────────────────────────────────────────────
            if (action === 'open') {
                const proj = (msg as any).proj as string;
                const reg  = loadRegistry();
                if (!reg) { return; }
                const entry = reg.projects.find(p => p.name === proj);
                if (!entry) { return; }
                const licensePath = path.join(entry.path, 'LICENSE');
                if (fs.existsSync(licensePath)) {
                    const doc = await vscode.workspace.openTextDocument(licensePath);
                    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                }
                return;
            }

        } catch (err) {
            logError(`License sync error: ${action}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
            panel.webview.postMessage({ type: 'error', text: String(err) });
        }
    });

    log(FEATURE, `License sync opened — ${projects.length} projects scanned`);
}

/** @internal — exported for unit testing only */
export const _test = { scanProject, esc, loadCanonical };
