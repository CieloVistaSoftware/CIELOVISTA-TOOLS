// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
// FILE REMOVED BY REQUEST
/**
 * claude-process-monitor.ts
 *
 * Claude Process Monitor — cielovista-tools
 *
 * Monitors all running Claude.exe instances on Windows.
 * Shows: PID, memory, uptime, parent process (who opened it), and allows
 * killing any or all instances at will via a task-manager-style webview.
 *
 * Root cause analysis detects:
 *   - Instance count overload (> 3 instances)
 *   - Memory pressure per instance (> 500 MB)
 *   - MCP server port contention (52100, 52101)
 *   - Orphaned processes (parent process no longer running)
 *
 * Auto-refreshes every 5 seconds while the panel is open.
 *
 * Command: cvs.claude.processMonitor
 */

import * as vscode  from 'vscode';
import * as cp      from 'child_process';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'claude-process-monitor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaudeProcess {
    pid:        number;
    name:       string;
    memoryMb:   number;
    uptimeMs:   number;
    parentPid:  number;
    parentName: string;
    cmdLine:    string;
}

interface PortInfo {
    port:  number;
    count: number;
}

interface MonitorData {
    processes: ClaudeProcess[];
    ports:     PortInfo[];
    scannedAt: string;
    warnings:  string[];
}

// ─── PowerShell helpers ───────────────────────────────────────────────────────

function runPs(script: string): string {
    try {
        return cp.execFileSync('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-Command', script,
        ], { encoding: 'utf8', timeout: 12000 });
    } catch (err: any) {
        return (err?.stdout as Buffer | string | undefined)?.toString?.() ?? '';
    }
}

// ─── Data collection ──────────────────────────────────────────────────────────

function collectData(): MonitorData {
    const warnings: string[] = [];

    // ── Processes ─────────────────────────────────────────────────────────────
    const procScript = `
$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'claude*' }
if (-not $procs) { Write-Output '[]'; exit }
$arr = @($procs | ForEach-Object {
    $p = $_
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)" -ErrorAction SilentlyContinue
    $pName = if ($parent) { $parent.Name } else { 'unknown (parent exited)' }
    $uptimeMs = if ($p.CreationDate) { [int64]([datetime]::Now - $p.CreationDate).TotalMilliseconds } else { 0 }
    [PSCustomObject]@{
        pid        = $p.ProcessId
        name       = $p.Name
        memoryMb   = [math]::Round($p.WorkingSetSize / 1MB, 1)
        uptimeMs   = $uptimeMs
        parentPid  = $p.ParentProcessId
        parentName = $pName
        cmdLine    = if ($p.CommandLine) { $p.CommandLine.Substring(0, [math]::Min($p.CommandLine.Length, 300)) } else { '' }
    }
})
$arr | ConvertTo-Json -Depth 3
`;

    let processes: ClaudeProcess[] = [];
    try {
        const raw = runPs(procScript).trim();
        if (raw && raw !== '[]') {
            const parsed = JSON.parse(raw);
            const arr    = Array.isArray(parsed) ? parsed : [parsed];
            processes    = arr.map((p: any) => ({
                pid:        Number(p.pid)        || 0,
                name:       String(p.name        || 'Claude.exe'),
                memoryMb:   Number(p.memoryMb)   || 0,
                uptimeMs:   Number(p.uptimeMs)   || 0,
                parentPid:  Number(p.parentPid)  || 0,
                parentName: String(p.parentName  || 'unknown'),
                cmdLine:    String(p.cmdLine     || ''),
            }));
        }
    } catch (err) {
        logError('Failed to parse process data', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
    }

    // ── Port contention ───────────────────────────────────────────────────────
    const portScript = `
$ports = @(52100, 52101)
$arr = @($ports | ForEach-Object {
    $port = $_
    $lines = netstat -ano 2>$null | Select-String ":$port "
    $count = if ($lines) { @($lines).Count } else { 0 }
    [PSCustomObject]@{ port = $port; count = $count }
})
$arr | ConvertTo-Json -Depth 2
`;

    let ports: PortInfo[] = [];
    try {
        const raw = runPs(portScript).trim();
        if (raw) {
            const parsed = JSON.parse(raw);
            ports = (Array.isArray(parsed) ? parsed : [parsed]).map((p: any) => ({
                port:  Number(p.port)  || 0,
                count: Number(p.count) || 0,
            }));
        }
    } catch { /* non-fatal — port info is supplementary */ }

    // ── Root cause analysis ───────────────────────────────────────────────────
    if (processes.length > 3) {
        warnings.push(`${processes.length} Claude instances open — recommended maximum is 3. Extra instances compete for MCP connections and RAM.`);
    }
    const heavyMem = processes.filter(p => p.memoryMb > 500);
    if (heavyMem.length > 0) {
        warnings.push(`${heavyMem.length} instance(s) using over 500 MB each. Heavy memory usage causes system slowdowns and unresponsiveness.`);
    }
    const orphans = processes.filter(p => p.parentName.includes('parent exited'));
    if (orphans.length > 0) {
        warnings.push(`${orphans.length} orphaned instance(s) — parent process has exited. These are safe to kill.`);
    }
    const busyPorts = ports.filter(p => p.count > 2);
    if (busyPorts.length > 0) {
        warnings.push(`Port contention on ${busyPorts.map(p => `:${p.port}`).join(', ')} — multiple Claude instances are fighting over the same MCP server socket.`);
    }
    if (processes.length > 0 && warnings.length === 0 && processes.length > 1) {
        warnings.push(`${processes.length} instances running normally — no issues detected.`);
    }

    return { processes, ports, scannedAt: new Date().toISOString(), warnings };
}

// ─── Kill helpers ─────────────────────────────────────────────────────────────

function killPid(pid: number): boolean {
    try {
        cp.execFileSync('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-Command',
            `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`,
        ], { encoding: 'utf8', timeout: 6000 });
        return true;
    } catch {
        return false;
    }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function esc(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatUptime(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) { return `${h}h ${m}m`; }
    if (m > 0) { return `${m}m ${s}s`; }
    return `${s}s`;
}

function openerLabel(p: ClaudeProcess): string {
    const n = p.parentName.toLowerCase();
    if (n.includes('explorer'))                          { return '🖥️ Windows Explorer'; }
    if (n.includes('windowsterminal'))                   { return '🖥️ Windows Terminal'; }
    if (n.includes('code-insiders') || n.includes('code')) { return '⚡ VS Code'; }
    if (n.includes('powershell'))                        { return '🔵 PowerShell'; }
    if (n.includes('cmd'))                               { return '⬛ Command Prompt'; }
    if (n.includes('claude'))                            { return '🤖 Claude (self-spawned)'; }
    if (n.includes('parent exited'))                     { return '👻 Orphaned (parent exited)'; }
    return `📦 ${p.parentName}`;
}

function memBadge(mb: number): string {
    const cls = mb > 500 ? 'mem-high' : mb > 200 ? 'mem-mid' : 'mem-ok';
    return `<span class="mem-badge ${cls}">${mb} MB</span>`;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHtml(data: MonitorData): string {
    const { processes, ports, warnings } = data;
    const scannedAt = new Date(data.scannedAt).toLocaleTimeString();

    const processRows = processes.map(p => {
        const cmdTip = p.cmdLine ? ` title="${esc(p.cmdLine)}"` : '';
        return `<tr>
  <td class="pid-cell">${p.pid}</td>
  <td class="name-cell"${cmdTip}>${esc(p.name)}</td>
  <td class="mem-cell">${memBadge(p.memoryMb)}</td>
  <td class="uptime-cell">${esc(formatUptime(p.uptimeMs))}</td>
  <td class="opener-cell">${openerLabel(p)}<div class="parent-detail">PID ${p.parentPid} · ${esc(p.parentName)}</div></td>
  <td class="action-cell"><button class="btn-kill" data-pid="${p.pid}">☠ Kill</button></td>
</tr>`;
    }).join('');

    const hasRealWarnings = warnings.some(w =>
        w.includes('instances open') || w.includes('500 MB') || w.includes('orphan') || w.includes('contention')
    );

    const warningHtml = hasRealWarnings
        ? `<div class="warning-section"><div class="warning-title">⚠️ Root Cause Analysis</div>${warnings.map(w => `<div class="warning-row">• ${esc(w)}</div>`).join('')}</div>`
        : `<div class="ok-banner">✅ ${processes.length === 0 ? 'Claude is not running.' : processes.length === 1 ? '1 instance running — healthy.' : `${processes.length} instances running — no issues detected.`}</div>`;

    const portHtml = ports.filter(p => p.count > 0).map(p =>
        `<span class="port-pill ${p.count > 2 ? 'port-busy' : 'port-ok'}">:${p.port} (${p.count})</span>`
    ).join(' ');

    const countClass = processes.length > 3 ? 'count-warn' : 'count-ok';
    const killAllBtn = processes.length > 1
        ? `<button class="btn-toolbar btn-kill-all" id="btn-kill-all">☠ Kill All (${processes.length})</button>`
        : '';

    const emptyRow = `<tr class="empty-row"><td colspan="6">Claude Desktop is not running — no processes found.</td></tr>`;

    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
.toolbar{position:sticky;top:0;z-index:20;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.toolbar h2{font-size:1.05em;font-weight:700;flex:1}
.count-pill{display:inline-block;padding:2px 12px;border-radius:12px;font-size:11px;font-weight:700;border:1px solid}
.count-ok{border-color:#3fb950;color:#3fb950}
.count-warn{border-color:#f48771;color:#f48771}
.btn-toolbar{border:none;padding:5px 14px;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-toolbar:hover{background:var(--vscode-button-hoverBackground)}
.btn-kill-all{background:#c0392b!important;color:#fff!important}
.btn-kill-all:hover{background:#e74c3c!important}
.meta{font-size:10px;color:var(--vscode-descriptionForeground)}
.content{padding:12px 16px 60px}
.warning-section{margin:0 0 12px;border-left:3px solid #f48771;padding:10px 12px;background:rgba(244,135,113,0.07);border-radius:0 4px 4px 0}
.warning-title{font-size:10px;font-weight:700;color:#f48771;margin-bottom:5px;text-transform:uppercase;letter-spacing:0.06em}
.warning-row{font-size:12px;padding:2px 0}
.ok-banner{margin:0 0 12px;padding:8px 12px;background:rgba(63,185,80,0.07);border-left:3px solid #3fb950;font-size:12px;color:#3fb950;border-radius:0 4px 4px 0}
.port-row{margin-bottom:12px;font-size:11px;color:var(--vscode-descriptionForeground);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.port-row strong{color:var(--vscode-editor-foreground)}
.port-pill{padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid}
.port-ok{border-color:#3fb950;color:#3fb950}
.port-busy{border-color:#cca700;color:#cca700}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:7px 8px;background:var(--vscode-textCodeBlock-background);border-bottom:2px solid var(--vscode-focusBorder);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:middle}
tr:hover td{background:var(--vscode-list-hoverBackground)}
.pid-cell{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);width:60px}
.name-cell{font-weight:700;width:130px;cursor:default}
.mem-cell{width:95px}
.uptime-cell{width:75px;font-size:11px;color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family,monospace)}
.opener-cell{}
.parent-detail{font-size:10px;color:var(--vscode-descriptionForeground);margin-top:2px;font-family:var(--vscode-editor-font-family,monospace)}
.action-cell{width:80px;text-align:center}
.mem-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;font-family:var(--vscode-editor-font-family,monospace)}
.mem-ok{background:rgba(63,185,80,0.1);color:#3fb950;border:1px solid rgba(63,185,80,0.3)}
.mem-mid{background:rgba(204,167,0,0.1);color:#cca700;border:1px solid rgba(204,167,0,0.3)}
.mem-high{background:rgba(244,135,113,0.12);color:#f48771;border:1px solid rgba(244,135,113,0.3)}
.btn-kill{border:1px solid #c0392b;background:rgba(192,57,43,0.08);color:#f48771;padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:700}
.btn-kill:hover{background:rgba(192,57,43,0.22)}
.empty-row td{text-align:center;padding:36px;color:var(--vscode-descriptionForeground);font-style:italic}
#status-bar{position:fixed;bottom:0;left:0;right:0;padding:6px 16px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);border-top:1px solid var(--vscode-panel-border);display:none}
#status-bar.visible{display:block}
`;

    const JS = `
(function(){
'use strict';
var vscode = acquireVsCodeApi();
var timer = setInterval(function(){ vscode.postMessage({command:'refresh'}); }, 5000);
window.addEventListener('unload', function(){ clearInterval(timer); });

function status(msg){
  var b = document.getElementById('status-bar');
  b.textContent = msg; b.className = 'visible';
  setTimeout(function(){ b.className=''; }, 5000);
}

document.addEventListener('click', function(e){
  var btn = e.target.closest('button');
  if (!btn) { return; }

  if (btn.dataset.pid) {
    if (!confirm('Kill Claude PID ' + btn.dataset.pid + '?\\nThis cannot be undone.')) { return; }
    status('Killing PID ' + btn.dataset.pid + '...');
    vscode.postMessage({ command: 'kill', pid: parseInt(btn.dataset.pid, 10) });
    return;
  }
  if (btn.id === 'btn-kill-all') {
    var n = document.querySelectorAll('.btn-kill').length;
    if (!confirm('Kill ALL ' + n + ' Claude processes?\\nThis cannot be undone.')) { return; }
    status('Killing all Claude instances...');
    vscode.postMessage({ command: 'killAll' });
    return;
  }
  if (btn.id === 'btn-refresh') {
    status('Refreshing...');
    vscode.postMessage({ command: 'refresh' });
  }
});
})();
`;

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div class="toolbar">
  <h2>🤖 Claude Process Monitor</h2>
  <span class="count-pill ${countClass}">${processes.length} instance${processes.length !== 1 ? 's' : ''}</span>
  ${killAllBtn}
  <button class="btn-toolbar" id="btn-refresh">↺ Refresh</button>
  <span class="meta">Updated ${scannedAt} · auto-refreshes every 5s</span>
</div>
<div class="content">
  ${warningHtml}
  ${portHtml ? `<div class="port-row"><strong>MCP Ports:</strong> ${portHtml}</div>` : ''}
  <table>
    <thead><tr><th>PID</th><th>Process</th><th>Memory</th><th>Uptime</th><th>Opened By</th><th>Action</th></tr></thead>
    <tbody>${processes.length > 0 ? processRows : emptyRow}</tbody>
  </table>
</div>
<div id="status-bar"></div>
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
        'claudeProcessMonitor',
        '🤖 Claude Processes',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );

    refresh();
    _panel.onDidDispose(() => { _panel = undefined; });

    _panel.webview.onDidReceiveMessage(msg => {
        try {
            switch (msg.command) {
                case 'kill': {
                    const ok = killPid(Number(msg.pid));
                    log(FEATURE, `Kill PID ${msg.pid}: ${ok ? 'success' : 'failed'}`);
                    setTimeout(() => refresh(), 800);
                    break;
                }
                case 'killAll': {
                    const d = collectData();
                    let killed = 0;
                    for (const p of d.processes) { if (killPid(p.pid)) { killed++; } }
                    log(FEATURE, `Kill All: terminated ${killed}/${d.processes.length}`);
                    setTimeout(() => refresh(), 800);
                    break;
                }
                case 'refresh': {
                    refresh();
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
        vscode.commands.registerCommand('cvs.claude.processMonitor', () => showPanel())
    );
}

export function deactivate(): void {
    _panel?.dispose();
    _panel = undefined;
}

/** @internal */
export const _test = { formatUptime, openerLabel, esc };
