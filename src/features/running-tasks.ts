// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

// component: tasks

/**
 * running-tasks.ts
 *
 * Running Tasks — cielovista-tools
 *
 * Shows all running Windows processes in a task-manager-style webview with
 * safety classification (Safe / Caution / Critical).
 *
 * Features:
 *   - Filter by name, path, or company
 *   - Toggle to show only "Safe to Kill" processes
 *   - Multi-select and bulk kill
 *   - Click a row that has a window title → bring that window into focus
 *   - Auto-refreshes every 10 seconds while the panel is open
 *
 * Commands: cvs.tools.runningTasks
 */

import * as vscode from 'vscode';
import * as cp     from 'child_process';
import { log, logError } from '../shared/output-channel';
import { esc } from '../shared/webview-utils';

const FEATURE = 'running-tasks';

// ─── Types ────────────────────────────────────────────────────────────────────

type Safety = 'safe' | 'caution' | 'critical';

interface TaskEntry {
    pid:         number;
    name:        string;
    windowTitle: string;
    memoryMb:    number;
    threads:     number;
    company:     string;
    description: string;
    path:        string;
    safety:      Safety;
}

interface TaskData {
    tasks:         TaskEntry[];
    totalMemoryGb: number;
    scannedAt:     string;
    trends:        Record<number, 'up' | 'down' | 'stable'>;
}

// ─── Trend tracking ───────────────────────────────────────────────────────────

/** Previous memory readings keyed by PID — module-level so they survive refreshes */
const _prevMemory = new Map<number, number>();
const TREND_THRESHOLD_MB = 2; // ignore deltas < 2 MB (normal GC / measurement noise)

// ─── Safety classification ────────────────────────────────────────────────────

// Process names (lowercase, no extension) that are OS core — killing causes BSOD
const CRITICAL_NAMES = new Set([
    'system', 'smss', 'csrss', 'wininit', 'winlogon', 'lsass', 'lsm',
    'services', 'memory compression', 'registry', 'secure system',
    'fontdrvhost', 'dwm',
]);

// Process names that are services/drivers — may break functionality
const CAUTION_NAMES = new Set([
    'svchost', 'taskhostw', 'runtimebroker', 'sihost', 'ctfmon', 'conhost',
    'searchindexer', 'searchhost', 'securityhealthservice', 'spoolsv',
    'audiodg', 'dashost', 'wuauclt', 'msiexec', 'dllhost', 'wermgr',
    'backgroundtaskhost', 'applicationframehost', 'textinputhost', 'startmenuexperiencehost',
    'shellexperiencehost', 'explorer',
]);

function classifyProcess(name: string): Safety {
    const lower = name.toLowerCase().replace(/\.exe$/i, '');
    if (CRITICAL_NAMES.has(lower)) { return 'critical'; }
    if (CAUTION_NAMES.has(lower))  { return 'caution';  }
    return 'safe';
}

// ─── PowerShell helpers ───────────────────────────────────────────────────────

function runPs(script: string, timeoutMs = 15000): string {
    try {
        return cp.execFileSync('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-Command', script,
        ], { encoding: 'utf8', timeout: timeoutMs });
    } catch (err: any) {
        return (err?.stdout as Buffer | string | undefined)?.toString?.() ?? '';
    }
}

// ─── Data collection ──────────────────────────────────────────────────────────

function collectData(): TaskData {
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-Process | Sort-Object WorkingSet64 -Descending
$arr = @($procs | ForEach-Object {
    $p = $_
    $fvi = $null
    try { $fvi = $p.MainModule.FileVersionInfo } catch {}
    [PSCustomObject]@{
        pid         = $p.Id
        name        = $p.ProcessName
        windowTitle = if ($p.MainWindowTitle) { $p.MainWindowTitle } else { '' }
        memoryMb    = [math]::Round($p.WorkingSet64 / 1MB, 1)
        threads     = $p.Threads.Count
        company     = if ($fvi -and $fvi.CompanyName)     { $fvi.CompanyName }     else { '' }
        description = if ($fvi -and $fvi.FileDescription) { $fvi.FileDescription } else { '' }
        path        = if ($p.MainModule) { $p.MainModule.FileName } else { '' }
    }
})
$arr | ConvertTo-Json -Depth 2 -Compress
`;

    let tasks: TaskEntry[] = [];
    try {
        const raw = runPs(script).trim();
        if (raw) {
            const parsed = JSON.parse(raw);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            tasks = arr.map((p: any): TaskEntry => ({
                pid:         Number(p.pid)         || 0,
                name:        String(p.name         || ''),
                windowTitle: String(p.windowTitle  || ''),
                memoryMb:    Number(p.memoryMb)    || 0,
                threads:     Number(p.threads)     || 0,
                company:     String(p.company      || ''),
                description: String(p.description  || ''),
                path:        String(p.path         || ''),
                safety:      classifyProcess(String(p.name || '')),
            }));
        }
    } catch (err) {
        logError('Failed to parse process data', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
    }

    // Compute memory trends (up / down / stable) vs previous snapshot
    const trends: Record<number, 'up' | 'down' | 'stable'> = {};
    for (const t of tasks) {
        const prev = _prevMemory.get(t.pid);
        if (prev !== undefined) {
            const delta = t.memoryMb - prev;
            trends[t.pid] = delta > TREND_THRESHOLD_MB ? 'up'
                          : delta < -TREND_THRESHOLD_MB ? 'down'
                          : 'stable';
        }
        _prevMemory.set(t.pid, t.memoryMb);
    }
    // Remove stale PIDs that are no longer running
    for (const pid of Array.from(_prevMemory.keys())) {
        if (!tasks.some(t => t.pid === pid)) { _prevMemory.delete(pid); }
    }

    const totalMemoryMb = tasks.reduce((s, t) => s + t.memoryMb, 0);
    return {
        tasks,
        totalMemoryGb: Math.round(totalMemoryMb / 1024 * 100) / 100,
        scannedAt: new Date().toISOString(),
        trends,
    };
}

// ─── Kill helper ──────────────────────────────────────────────────────────────

function killPids(pids: number[]): number {
    if (pids.length === 0) { return 0; }
    const idList = pids.join(',');
    try {
        runPs(`Stop-Process -Id ${idList} -Force -ErrorAction SilentlyContinue`, 6000);
        return pids.length;
    } catch {
        return 0;
    }
}

// ─── Window-focus helper (issue #429) ─────────────────────────────────────────
// Uses P/Invoke SetForegroundWindow + ShowWindow(SW_RESTORE=9) via PowerShell.

const WIN_FOCUS_TYPE = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class CvsWinFocus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
}
'@ -ErrorAction SilentlyContinue
`;

function focusWindowByPid(pid: number): boolean {
    const script = `
${WIN_FOCUS_TYPE}
$proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
    $handle = $proc.MainWindowHandle
    if ([CvsWinFocus]::IsIconic($handle)) {
        [CvsWinFocus]::ShowWindow($handle, 9) | Out-Null # SW_RESTORE
    }
    [CvsWinFocus]::BringWindowToTop($handle) | Out-Null
    [CvsWinFocus]::SetForegroundWindow($handle) | Out-Null
    [CvsWinFocus]::SwitchToThisWindow($handle, $true)
    Write-Output 'ok'
} else {
    Write-Output 'no-window'
}
`;
    const result = runPs(script, 5000).trim();
    return result === 'ok';
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml(data: TaskData): string {
    const { tasks, totalMemoryGb, trends } = data;
    const scannedAt = new Date(data.scannedAt).toLocaleTimeString();

    const safeCount     = tasks.filter(t => t.safety === 'safe').length;
    const cautionCount  = tasks.filter(t => t.safety === 'caution').length;
    const criticalCount = tasks.filter(t => t.safety === 'critical').length;

    const rows = tasks.map(t => {
        const safetyDot = t.safety === 'critical' ? 'dot-critical' : t.safety === 'caution' ? 'dot-caution' : 'dot-safe';
        const hasWindow = t.windowTitle ? ' data-has-window="1"' : '';
        const windowCls = t.windowTitle ? ' has-window' : '';
        const memStr    = t.memoryMb >= 1024
            ? (t.memoryMb / 1024).toFixed(2) + ' GB'
            : t.memoryMb.toFixed(1) + ' MB';
        const trend     = trends[t.pid];
        const trendHtml = trend === 'up'   ? '&thinsp;<span style="color:#3fb950;font-weight:700" title="Memory increasing">+</span>'
                        : trend === 'down' ? '&thinsp;<span style="color:#f85149;font-weight:700" title="Memory decreasing">−</span>'
                        : '';
        return `<tr data-pid="${t.pid}" data-safety="${esc(t.safety)}"${hasWindow} data-mem="${t.memoryMb}" data-threads="${t.threads}">
  <td class="col-check"><input type="checkbox" class="row-check" data-pid="${t.pid}"></td>
  <td class="col-dot"><span class="dot ${safetyDot}" title="${esc(t.safety)}"></span></td>
  <td class="col-pid">${t.pid}</td>
  <td class="col-name" title="${esc(t.path)}">${esc(t.name)}</td>
  <td class="col-wintitle${windowCls}" title="${esc(t.windowTitle)}">${esc(t.windowTitle)}</td>
  <td class="col-mem">${memStr}${trendHtml}</td>
  <td class="col-threads">${t.threads}</td>
  <td class="col-company" title="${esc(t.company)}">${esc(t.company)}</td>
  <td class="col-desc" title="${esc(t.description)}">${esc(t.description)}</td>
  <td class="col-path" title="${esc(t.path)}">${esc(t.path)}</td>
</tr>`;
    }).join('');

    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);display:flex;flex-direction:column;height:100vh;overflow:hidden}
.toolbar{flex-shrink:0;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 14px}
.toolbar-row1{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.toolbar-row1 h2{font-size:1.05em;font-weight:700;flex:1}
.toolbar-row2{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.subtitle{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:8px;line-height:1.5}
.subtitle strong{color:var(--vscode-editor-foreground)}
input[type=text]{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,#555);border-radius:3px;padding:4px 8px;font-size:12px;width:220px}
input[type=text]::placeholder{color:var(--vscode-input-placeholderForeground)}
select{background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border:1px solid var(--vscode-dropdown-border,#555);border-radius:3px;padding:4px 8px;font-size:12px;cursor:pointer}
.btn{border:none;padding:5px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn:hover{background:var(--vscode-button-hoverBackground)}
.btn-kill{background:#c0392b!important;color:#fff!important}
.btn-kill:hover{background:#e74c3c!important}
.btn-kill:disabled{background:#555!important;color:#999!important;cursor:not-allowed}
.count-info{font-size:11px;color:var(--vscode-descriptionForeground);display:flex;align-items:center;gap:6px;margin-left:auto}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%}
.dot-safe{background:#3fb950}
.dot-caution{background:#cca700}
.dot-critical{background:#f85149}
.scroll-wrap{flex:1;overflow:auto}
table{width:100%;border-collapse:collapse;font-size:12px}
thead{position:sticky;top:0;z-index:10}
th{text-align:left;padding:7px 8px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;user-select:none}
th[data-col]{cursor:pointer}
th[data-col]:hover{background:var(--vscode-list-hoverBackground)}
th[data-col]::after{content:' ⇅';opacity:0.3;font-size:9px}
th.sort-asc::after{content:' ▲';opacity:1;color:var(--vscode-focusBorder)}
th.sort-desc::after{content:' ▼';opacity:1;color:var(--vscode-focusBorder)}
td{padding:5px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
tr:hover td{background:var(--vscode-list-hoverBackground)}
tr.selected td{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
.col-check{width:28px}
.col-dot{width:24px}
.col-pid{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);width:55px}
.col-name{font-weight:700;max-width:160px}
.col-wintitle{max-width:220px;color:var(--vscode-descriptionForeground)}
.col-wintitle.has-window{color:var(--vscode-editor-foreground);cursor:pointer;text-decoration:underline dotted}
.col-wintitle.has-window:hover{color:var(--vscode-textLink-activeForeground)}
.col-mem{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;width:80px;text-align:right}
.col-threads{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;width:60px;text-align:right}
.col-company{max-width:160px}
.col-desc{max-width:180px}
.col-path{max-width:220px;font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground)}
#status-bar{flex-shrink:0;padding:5px 14px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);border-top:1px solid var(--vscode-panel-border);min-height:24px}
`;

    const JS = `
(function(){
'use strict';
var vsc = acquireVsCodeApi();
var filterInput  = document.getElementById('filter-input');
var safetySelect = document.getElementById('safety-select');
var statusBar    = document.getElementById('status-bar');
var killBtn      = document.getElementById('btn-kill');
var checkAll     = document.getElementById('check-all');

// ── Pause state ───────────────────────────────────────────────────────────────
// Auto-refresh is suppressed whenever the filter has text OR any checkbox is
// checked. This prevents the list from rebuilding while the user is selecting
// processes or has typed a filter query.
var _paused = false;

function updatePauseState(){
    _paused = filterInput.value.length > 0 || getCheckedPids().length > 0;
}

var timer = setInterval(function(){ if (!_paused){ doRefresh(); } }, 10000);
window.addEventListener('unload', function(){ clearInterval(timer); });

function status(msg){ statusBar.textContent = msg; }

function getCheckedPids(){
    return Array.from(document.querySelectorAll('.row-check:checked')).map(function(cb){
        return parseInt(cb.dataset.pid, 10);
    });
}

function updateKillBtn(){
    killBtn.disabled = getCheckedPids().length === 0;
    updatePauseState();
}

function saveUiState(){
    vsc.setState({ sortCol: _sortCol, sortAsc: _sortAsc,
                   filterText: filterInput.value, safetyMode: safetySelect.value });
}

function applyFilter(){
    var text  = filterInput.value.toLowerCase();
    var mode  = safetySelect.value;
    var rows  = document.querySelectorAll('tbody tr');
    var shown = 0;
    rows.forEach(function(tr){
        var safety = tr.dataset.safety || '';
        var passMode = mode === 'all' || (mode === 'safe' && safety === 'safe') ||
                       (mode === 'caution' && (safety === 'safe' || safety === 'caution'));
        var passText = !text || tr.textContent.toLowerCase().includes(text);
        var visible = passMode && passText;
        tr.style.display = visible ? '' : 'none';
        if (visible) { shown++; }
    });
    var total = rows.length;
    var pausedNote = _paused ? ' · auto-refresh paused' : '';
    status('Showing ' + shown + ' of ' + total + ' processes' + pausedNote);
}

filterInput.addEventListener('input', function(){
    updatePauseState();
    applyFilter();
    saveUiState();
});
safetySelect.addEventListener('change', function(){
    applyFilter();
    saveUiState();
});

checkAll.addEventListener('change', function(){
    var checked = checkAll.checked;
    document.querySelectorAll('tbody tr[style=""],.row-check').forEach(function(el){
        if (el.tagName === 'TR' && el.style.display !== 'none') {
            el.querySelector('.row-check').checked = checked;
        }
    });
    document.querySelectorAll('tbody tr').forEach(function(tr){
        if (tr.style.display !== 'none') {
            var cb = tr.querySelector('.row-check');
            if (cb) { cb.checked = checked; }
        }
    });
    updateKillBtn();
});

document.getElementById('tbody').addEventListener('change', function(e){
    if (e.target.classList.contains('row-check')){ updateKillBtn(); }
});

document.getElementById('tbody').addEventListener('click', function(e) {
    // If the click was on a checkbox or a window title link, let the other handlers manage it.
    if (e.target.type === 'checkbox' || e.target.closest('.col-wintitle.has-window')) {
        return;
    }

    // Find the table row that was clicked.
    const tr = e.target.closest('tr');
    if (!tr) { return; }

    // Find the checkbox in that row and toggle its state.
    const checkbox = tr.querySelector('.row-check');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        // Manually trigger a 'change' event on the checkbox so the updateKillBtn handler fires.
        checkbox.dispatchEvent(new Event('change'));
    }
});

document.getElementById('btn-refresh').addEventListener('click', function(){
    // Manual refresh: clear pause so filter/checks don't suppress the upcoming rebuild
    _paused = false;
    status('Refreshing...');
    doRefresh();
});

killBtn.addEventListener('click', function(){
    // Capture PIDs immediately — before anything else can mutate the DOM
    var pids = getCheckedPids();
    if (pids.length === 0) { return; }
    // Pause timer for the duration of the kill so a tick can't wipe selections mid-confirm
    _paused = true;
    if (!confirm('Kill ' + pids.length + ' selected process(es)?\\nThis cannot be undone.')) {
        updatePauseState(); // restore correct pause state if user cancelled
        return;
    }
    status('Killing ' + pids.length + ' process(es)...');
    vsc.postMessage({ command: 'kill', pids: pids });
    // _paused will clear naturally when HTML is rebuilt after kill completes
});

// Click a window-title cell → focus that process window
document.getElementById('tbody').addEventListener('click', function(e){
    var td = e.target.closest('td.col-wintitle.has-window');
    if (!td) { return; }
    var tr = td.closest('tr');
    if (!tr) { return; }
    var pid = parseInt(tr.dataset.pid, 10);
    status('Bringing window into focus...');
    vsc.postMessage({ command: 'focus-window', pid: pid });
});

function doRefresh(){
    vsc.postMessage({ command: 'refresh' });
}

// ── Column sort ───────────────────────────────────────────────────────────────
var NUMERIC_COLS = new Set(['pid','mem','threads']);

// Restore UI state across full HTML refreshes (vsc.getState survives webview reload)
var _savedState = vsc.getState() || {};
var _sortCol = _savedState.sortCol || null;
var _sortAsc = (_savedState.sortAsc !== undefined) ? _savedState.sortAsc : true;

// Restore filter and safety-select so they survive the HTML rebuild on auto-refresh
if (_savedState.filterText) { filterInput.value = _savedState.filterText; }
if (_savedState.safetyMode) { safetySelect.value = _savedState.safetyMode; }
updatePauseState(); // re-evaluate pause now that filter may be non-empty

function cellValue(tr, col) {
    switch(col) {
        case 'pid':     return parseInt(tr.dataset.pid, 10);
        case 'mem':     return parseFloat(tr.dataset.mem);
        case 'threads': return parseInt(tr.dataset.threads, 10);
        case 'name':    return (tr.querySelector('.col-name') ? tr.querySelector('.col-name').textContent : '').toLowerCase();
        case 'wintitle':return (tr.querySelector('.col-wintitle') ? tr.querySelector('.col-wintitle').textContent : '').toLowerCase();
        case 'company': return (tr.querySelector('.col-company') ? tr.querySelector('.col-company').textContent : '').toLowerCase();
        case 'desc':    return (tr.querySelector('.col-desc') ? tr.querySelector('.col-desc').textContent : '').toLowerCase();
        case 'path':    return (tr.querySelector('.col-path') ? tr.querySelector('.col-path').textContent : '').toLowerCase();
        default:        return '';
    }
}

function applySort(col, asc) {
    // Update header indicators
    document.querySelectorAll('th[data-col]').forEach(function(h) {
        h.classList.remove('sort-asc','sort-desc');
    });
    var th = document.querySelector('th[data-col="' + col + '"]');
    if (th) { th.classList.add(asc ? 'sort-asc' : 'sort-desc'); }
    // Sort rows in tbody
    var tbody = document.getElementById('tbody');
    var rows  = Array.from(tbody.querySelectorAll('tr'));
    rows.sort(function(a, b) {
        var av = cellValue(a, col);
        var bv = cellValue(b, col);
        var cmp = (typeof av === 'number') ? (av - bv) : String(av).localeCompare(String(bv));
        return asc ? cmp : -cmp;
    });
    rows.forEach(function(r) { tbody.appendChild(r); });
}

// Reapply saved sort immediately on load (after every HTML refresh)
if (_sortCol) { applySort(_sortCol, _sortAsc); }

document.querySelector('thead').addEventListener('click', function(e) {
    var th = e.target.closest('th[data-col]');
    if (!th) { return; }
    var col = th.dataset.col;
    if (_sortCol === col) { _sortAsc = !_sortAsc; }
    else { _sortCol = col; _sortAsc = NUMERIC_COLS.has(col) ? false : true; }

    applySort(_sortCol, _sortAsc);
    // Persist so next refresh restores the same sort
    vsc.setState({ sortCol: _sortCol, sortAsc: _sortAsc });
    status('Sorted by ' + col + ' (' + (_sortAsc ? '▲ asc' : '▼ desc') + ')');
});

// Initial filter pass
applyFilter();
})();
`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>${CSS}</style></head><body>
<div class="toolbar">
  <div class="toolbar-row1">
    <h2>🖥️ Running Tasks</h2>
  </div>
  <div class="subtitle">
    Shows all Windows processes with safety classification.&nbsp;
    <strong><span class="dot dot-safe" style="display:inline-block"></span> Safe</strong> = user apps, ok to kill.&nbsp;
    <strong><span class="dot dot-caution" style="display:inline-block"></span> Caution</strong> = services/drivers, may break functionality.&nbsp;
    <strong><span class="dot dot-critical" style="display:inline-block"></span> Critical</strong> = OS core, killing causes BSOD.&nbsp;
    Click underlined window titles to bring that window into focus.
  </div>
  <div class="toolbar-row2">
    <input type="text" id="filter-input" placeholder="Filter by name, path, or company...">
    <select id="safety-select">
      <option value="all">All Processes</option>
      <option value="safe" selected>Safe to Kill</option>
      <option value="caution">Safe + Caution</option>
    </select>
    <button class="btn" id="btn-refresh">↺ Refresh</button>
    <button class="btn btn-kill" id="btn-kill" disabled>☠ Kill Selected</button>
    <div class="count-info">
      ${tasks.length} processes &nbsp;|&nbsp; ${totalMemoryGb} GB &nbsp;|&nbsp;
      <span class="dot dot-safe"></span>&nbsp;${safeCount}&nbsp;
      <span class="dot dot-caution"></span>&nbsp;${cautionCount}&nbsp;
      <span class="dot dot-critical"></span>&nbsp;${criticalCount}
    </div>
  </div>
</div>
<div class="scroll-wrap">
<table>
  <thead><tr>
    <th><input type="checkbox" id="check-all"></th>
    <th></th>
    <th data-col="pid">PID</th>
    <th data-col="name">NAME</th>
    <th data-col="wintitle">WINDOW TITLE</th>
    <th data-col="mem">MEMORY</th>
    <th data-col="threads">THREADS</th>
    <th data-col="company">COMPANY</th>
    <th data-col="desc">DESCRIPTION</th>
    <th data-col="path">PATH</th>
  </tr></thead>
  <tbody id="tbody">${rows}</tbody>
</table>
</div>
<div id="status-bar">Updated ${scannedAt} · auto-refreshes every 10s</div>
<script>${JS}</script>
</body></html>`;
}

// ─── Panel management ─────────────────────────────────────────────────────────

let _panel: vscode.WebviewPanel | undefined;

function refresh(): void {
    if (!_panel) { return; }
    try {
        _panel.webview.html = buildHtml(collectData());
    } catch (err) {
        logError('refresh failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
    }
}

function showPanel(): void {
    if (_panel) {
        _panel.reveal(vscode.ViewColumn.One, true);
        refresh();
        return;
    }

    _panel = vscode.window.createWebviewPanel(
        'runningTasks',
        '🖥️ Running Tasks',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true }
    );

    refresh();
    _panel.onDidDispose(() => { _panel = undefined; });

    _panel.webview.onDidReceiveMessage(msg => {
        try {
            switch (msg.command) {
                case 'refresh':
                    refresh();
                    break;

                case 'kill': {
                    const pids: number[] = Array.isArray(msg.pids)
                        ? msg.pids.map((p: unknown) => Number(p)).filter((p: number) => p > 0)
                        : [];
                    if (pids.length === 0) { break; }
                    const killed = killPids(pids);
                    log(FEATURE, `Killed ${killed} process(es): ${pids.join(', ')}`);
                    setTimeout(() => refresh(), 800);
                    break;
                }

                case 'focus-window': {
                    const pid = Number(msg.pid);
                    if (!pid || pid <= 0) { break; }
                    const ok = focusWindowByPid(pid);
                    log(FEATURE, `Focus window PID ${pid}: ${ok ? 'success' : 'no window'}`);
                    if (!ok) {
                        void vscode.window.showInformationMessage(`Process ${pid} has no focusable window.`);
                    }
                    break;
                }
            }
        } catch (err) {
            logError(`Handler: ${msg.command}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    });
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tools.runningTasks', () => showPanel())
    );
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
}
