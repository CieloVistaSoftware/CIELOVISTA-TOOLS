// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import * as fs   from 'fs';
import * as path from 'path';
import { log, logError, getChannel } from '../../shared/output-channel';
import { loadLastReport }      from '../daily-audit/runner';
import { CATALOG }             from './catalog';
import { buildLauncherHtml }   from './html';
import { openHelpPanel, _helpPanel } from './help';
import { startMcpServer, stopMcpServer, getMcpServerStatus, onMcpServerStatusChange } from '../mcp-server-status';
import { fileHealthBugAsIssue } from '../../shared/github-issue-filer';
import { initHistory, recordRun, getHistory } from './command-history';
import { initRecentProjects, touchCurrentProject, getRecentProjects } from './recent-projects';
import { sendToCopilotChat } from '../terminal-copy-output';
import { loadRegistry } from '../../shared/registry';

function escHtml(s: string): string {
    return String(s ?? '').replace(/[<>&"]/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'} as Record<string,string>)[c] ?? c);
}

const FEATURE             = 'cvs-command-launcher';
const LAUNCHER_COMMAND_ID = 'cvs.commands.showAll';
const QUICKRUN_COMMAND_ID = 'cvs.commands.quickRun';

function isCancellationError(err: unknown): boolean {
    const text = err instanceof Error
        ? `${err.name} ${err.message} ${err.stack ?? ''}`
        : String(err ?? '');
    return /\bCanceled\b|\bCancellation\b/i.test(text);
}

function isCommandNotFoundError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return /command .* not found/i.test(msg);
}

let _statusBar: vscode.StatusBarItem | undefined;
let _panel:     vscode.WebviewPanel  | undefined;
let _resultPanel: vscode.WebviewPanel | undefined; // single reused result panel
let _panelMessageSubscription: vscode.Disposable | undefined;
let _context: vscode.ExtensionContext | undefined;

function detectWorkspaceType(wsPath: string): string {
    if (!wsPath) { return 'generic'; }
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(wsPath, 'package.json'), 'utf8'));
        if (pkg?.engines?.vscode) { return 'vscode-extension'; }
    } catch {}
    try {
        const files = fs.readdirSync(wsPath);
        if (files.some((f: string) => f.endsWith('.sln') || f.endsWith('.csproj'))) { return 'dotnet'; }
    } catch {}
    const lower = wsPath.toLowerCase().replace(/\\/g, '/');
    if (lower.includes('diskcleanup')) { return 'diskcleanup'; }
    if (lower.includes('cielovista-tools')) { return 'tools'; }
    return 'generic';
}

function getPinnedIds(wsPath: string): string[] {
    if (!_context) { return []; }
    const key = `cvs.pinnedCommands.${wsPath || 'global'}`;
    return _context.globalState.get<string[]>(key) ?? [];
}

async function setPinnedIds(wsPath: string, ids: string[]): Promise<void> {
    if (!_context) { return; }
    const key = `cvs.pinnedCommands.${wsPath || 'global'}`;
    await _context.globalState.update(key, ids);
}

function safePostToWebview(panel: vscode.WebviewPanel, payload: unknown): boolean {
    try {
        void panel.webview.postMessage(payload);
        return true;
    } catch (err) {
        const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
        if (/Webview is disposed/i.test(text)) {
            return false;
        }
        throw err;
    }
}

// ─── Shared async channel interception ───────────────────────────────────────

type StreamFn = (line: string) => void;
const _activeStreams = new Map<string, StreamFn>();
let   _origChannelAppend: ((line: string) => void) | undefined;
let   _channelIntercepted = false;

function startInterception(): void {
    if (_channelIntercepted) { return; }
    const ch = getChannel();
    const orig = (ch as any).appendLine?.bind(ch);
    if (!orig) { return; }
    _origChannelAppend = orig;
    (ch as any).appendLine = (line: string) => {
        orig(line);
        // Don't forward background-health-runner noise into command result panels
        if (line.includes('[bg-health-runner]')) { return; }
        _activeStreams.forEach(fn => fn(line));
    };
    _channelIntercepted = true;
}

function stopInterceptionIfIdle(): void {
    if (_activeStreams.size > 0) { return; }
    if (!_channelIntercepted || !_origChannelAppend) { return; }
    const ch = getChannel();
    (ch as any).appendLine = _origChannelAppend;
    _origChannelAppend  = undefined;
    _channelIntercepted = false;
}

// ─── Streaming result panel HTML ─────────────────────────────────────────────

function buildResultPanelHtml(title: string): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:var(--vscode-font-family);font-size:13px;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);display:flex;flex-direction:column}
#hd{padding:12px 16px 8px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;display:flex;flex-direction:column;gap:4px}
#hd-top{display:flex;align-items:center;gap:8px}
#status-icon{font-size:1.1em;flex-shrink:0}
#title-text{font-size:1em;font-weight:700;flex:1}
#elapsed{font-size:11px;color:var(--vscode-descriptionForeground)}
#actions{display:none;gap:6px;margin-top:4px}
#actions.show{display:flex}
.act-btn{border:none;border-radius:3px;padding:4px 12px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit}
#btn-copy{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
#btn-copy:hover{background:var(--vscode-button-secondaryHoverBackground)}
#btn-chat{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
#btn-chat:hover{background:var(--vscode-button-hoverBackground)}
#out{flex:1;overflow-y:auto;padding:10px 16px;font-family:var(--vscode-editor-font-family,monospace);font-size:12px;white-space:pre-wrap;word-break:break-all;line-height:1.6}
.line-err{color:#f85149}.line-warn{color:#cca700}
#spinner{display:inline-block;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#copy-toast{position:fixed;bottom:12px;right:12px;background:var(--vscode-editor-background);border:1px solid var(--vscode-focusBorder);border-radius:4px;padding:6px 12px;font-size:11px;opacity:0;transition:opacity .2s;pointer-events:none}
#copy-toast.show{opacity:1}
</style></head><body>
<div id="hd">
  <div id="hd-top">
    <span id="status-icon"><span id="spinner">&#9696;</span></span>
    <span id="title-text">${escHtml(title)}</span>
  </div>
  <div id="elapsed">Starting\u2026</div>
  <div id="actions">
    <button class="act-btn" id="btn-copy">&#128203; Copy Output</button>
    <button class="act-btn" id="btn-chat">&#128172; Copy to Chat</button>
  </div>
</div>
<div id="out"></div>
<div id="copy-toast">Copied to clipboard</div>
<script>(function(){
var vsc   = acquireVsCodeApi();
var out   = document.getElementById('out');
var elapsed   = document.getElementById('elapsed');
var statusIcon= document.getElementById('status-icon');
var spinner   = document.getElementById('spinner');
var actions   = document.getElementById('actions');
var toast     = document.getElementById('copy-toast');
var _lines    = [];
function getOutputText() { return _lines.join('\\n'); }
function showToast() { toast.className='show'; setTimeout(function(){ toast.className=''; }, 1800); }
function copyText(text) {
  try { navigator.clipboard.writeText(text).then(showToast).catch(function(){ showToast(); }); }
  catch(e){ showToast(); }
}
document.getElementById('btn-copy').addEventListener('click', function(){ copyText(getOutputText()); });
document.getElementById('btn-chat').addEventListener('click', function(){
  var text = '**' + ${JSON.stringify(title)} + '**\\n\\n\`\`\`\\n' + getOutputText() + '\\n\`\`\`';
  vsc.postMessage({ command: 'copy-to-chat', text: text });
});
window.addEventListener('message', function(ev){
  var m = ev.data;
  if (m.type === 'line') {
    _lines.push(m.text);
    var line = document.createElement('div');
    line.textContent = m.text;
    if (/error|fail|exception/i.test(m.text)) line.className = 'line-err';
    else if (/warn/i.test(m.text)) line.className = 'line-warn';
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  } else if (m.type === 'done') {
    spinner.style.display = 'none';
    statusIcon.textContent = m.ok ? '\\u2705' : '\\u274c';
    elapsed.textContent = m.ok ? 'Completed in '+m.elapsed+'ms' : 'Failed after '+m.elapsed+'ms';
    actions.className = 'show';
    if (!m.ok && m.stack) {
      _lines.push(m.stack);
      var err = document.createElement('div');
      err.className = 'line-err'; err.textContent = m.stack;
      out.appendChild(err); out.scrollTop = out.scrollHeight;
    }
    if (out.children.length === 0) {
      var empty = document.createElement('div');
      empty.style.color = 'var(--vscode-descriptionForeground)';
      empty.textContent = m.ok ? '(no log output)' : '(no output before failure)';
      out.appendChild(empty);
    }
  } else if (m.type === 'terminal') {
    spinner.style.display = 'none';
    statusIcon.textContent = '\\uD83D\\uDCBB';
    elapsed.textContent = 'Running in terminal: ' + m.name;
    var note = document.createElement('div');
    note.style.cssText = 'color:var(--vscode-descriptionForeground);font-style:italic';
    note.textContent = '\\u25b6 Output is in the Terminal panel';
    out.appendChild(note);
    actions.className = 'show';
  }
});
})();</script>
</body></html>`;
}

// ─── Core run engine ─────────────────────────────────────────────────────────

async function _executeWithOutput(
    commandId: string,
    notifyPanel?: vscode.WebviewPanel
): Promise<void> {
    const entry   = CATALOG.find(c => c.id === commandId);
    const title   = entry?.title ?? commandId;
    const startMs = Date.now();
    const runId   = `${commandId}::${startMs}`;

    if (commandId === 'cvs.mcp.startServer') {
        if (getMcpServerStatus() === 'up') { stopMcpServer(); } else { startMcpServer(); }
        return;
    }

    // Read-only commands should execute directly so they can open in the
    // immediate adjacent editor group without an intermediate result panel.
    if (entry?.action === 'read') {
        if (notifyPanel) {
            notifyPanel.webview.postMessage({ type: 'run-state', id: commandId, state: 'running' });
        }
        log(FEATURE, `Executing: ${commandId}`);
        try {
            await vscode.commands.executeCommand(commandId);
            const elapsed = Date.now() - startMs;
            recordRun({ id: commandId, title, ok: true, elapsed });
            if (notifyPanel) {
                notifyPanel.webview.postMessage({ type: 'run-state', id: commandId, state: 'ok' });
                notifyPanel.webview.postMessage({ type: 'history-update', history: getHistory() });
            }
            if (_panel) { _panel.webview.postMessage({ type: 'history-update', history: getHistory() }); }
        } catch (err) {
            const elapsed = Date.now() - startMs;
            const msg = err instanceof Error ? (err.message || String(err)) : String(err);
            const canceled = isCancellationError(err);
            const notFound = isCommandNotFoundError(err);
            if (canceled) {
                log(FEATURE, `Canceled: ${commandId}`);
                recordRun({ id: commandId, title, ok: true, elapsed });
            } else if (notFound) {
                log(FEATURE, `Command not found (feature may be disabled): ${commandId}`);
                vscode.window.showInformationMessage(`"${title}" is not available — the feature may be disabled in settings (cielovistaTools.features).`);
                recordRun({ id: commandId, title, ok: false, elapsed });
            } else {
                logError(`Failed: ${commandId}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                recordRun({ id: commandId, title, ok: false, elapsed });
            }
            if (notifyPanel) {
                if (!canceled && !notFound) {
                    notifyPanel.webview.postMessage({ type: 'error', title, message: msg });
                }
                notifyPanel.webview.postMessage({ type: 'run-state', id: commandId, state: (canceled || notFound) ? 'ok' : 'error' });
                notifyPanel.webview.postMessage({ type: 'history-update', history: getHistory() });
            }
            if (_panel) { _panel.webview.postMessage({ type: 'history-update', history: getHistory() }); }
        }
        return;
    }

    const rp = (() => {
        if (_resultPanel) {
            // Reuse the existing panel — reset its content for the new run
            _resultPanel.title = `\u23f3 ${title}`;
            _resultPanel.webview.html = buildResultPanelHtml(title);
            _resultPanel.reveal(vscode.ViewColumn.Beside, true);
            return _resultPanel;
        }
        const p = vscode.window.createWebviewPanel(
            'cvsJobResult',
            `\u23f3 ${title}`,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        p.webview.html = buildResultPanelHtml(title);
        p.onDidDispose(() => { _resultPanel = undefined; });
        _resultPanel = p;
        return p;
    })();

    rp.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'copy-to-chat' && msg.text) {
            const sentDirectly = await sendToCopilotChat(msg.text);
            if (sentDirectly) {
                vscode.window.showInformationMessage('Output sent to Copilot Chat.');
            } else {
                vscode.window.showInformationMessage('Could not send directly to chat. Content is on clipboard for paste.');
            }
        }
    });

    if (notifyPanel) {
        notifyPanel.webview.postMessage({ type: 'run-state', id: commandId, state: 'running' });
    }

    const stream: StreamFn = (line: string) => {
        for (const l of line.split(/\r?\n/)) {
            if (l.trim() && !safePostToWebview(rp, { type: 'line', text: l })) {
                return;
            }
        }
    };

    const finish = (ok: boolean, elapsed: number, stack?: string) => {
        rp.title = ok ? `\u2705 ${title}` : `\u274c ${title}`;
        safePostToWebview(rp, { type: 'done', ok, elapsed, stack });
        recordRun({ id: commandId, title, ok, elapsed });
        if (notifyPanel) {
            notifyPanel.webview.postMessage({ type: 'run-state', id: commandId, state: ok ? 'ok' : 'error' });
            notifyPanel.webview.postMessage({ type: 'history-update', history: getHistory() });
            if (entry?.action !== 'read') { notifyPanel.reveal(vscode.ViewColumn.One, true); }
        }
        if (_panel) { _panel.webview.postMessage({ type: 'history-update', history: getHistory() }); }
    };

    log(FEATURE, `Executing: ${commandId}`);
    _activeStreams.set(runId, stream);
    startInterception();

    // Snapshot terminals BEFORE — detect terminal-based commands by new terminal creation,
    // not by elapsed time (elapsed heuristic fails for fast synchronous commands like audit).
    const termIdsBefore = new Set(vscode.window.terminals.map(t => t.processId));

    try {
        await vscode.commands.executeCommand(commandId);
        const elapsed = Date.now() - startMs;

        // A new terminal appeared = this was a terminal-launch command (project launcher etc.)
        const newTerm = vscode.window.terminals.find(
            t => !termIdsBefore.has(t.processId) &&
                 !t.name.includes('node') &&
                 !t.name.includes('Extension Host')
        );

        if (newTerm) {
            rp.webview.postMessage({ type: 'terminal', name: newTerm.name });
            rp.title = `\ud83d\udcbb ${title}`;
            recordRun({ id: commandId, title, ok: true, elapsed });
            if (notifyPanel) {
                notifyPanel.webview.postMessage({ type: 'run-state', id: commandId, state: 'ok' });
                notifyPanel.webview.postMessage({ type: 'history-update', history: getHistory() });
            }
        } else {
            finish(true, elapsed);
        }
    } catch (err) {
        const elapsed = Date.now() - startMs;
        const stack   = err instanceof Error ? err.stack ?? String(err) : String(err);
        if (isCancellationError(err)) {
            log(FEATURE, `Canceled: ${commandId}`);
            finish(true, elapsed);
        } else if (isCommandNotFoundError(err)) {
            log(FEATURE, `Command not found (feature may be disabled): ${commandId}`);
            vscode.window.showInformationMessage(`"${title}" is not available — the feature may be disabled in settings (cielovistaTools.features).`);
            finish(false, elapsed);
        } else {
            logError(`Failed: ${commandId}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
            finish(false, elapsed, stack);
        }
    } finally {
        _activeStreams.delete(runId);
        stopInterceptionIfIdle();
    }
}

// ─── Message handler ──────────────────────────────────────────────────────────

function attachMessageHandler(panel: vscode.WebviewPanel): void {
    _panelMessageSubscription?.dispose();
    _panelMessageSubscription = panel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'help' && msg.doc)  { openHelpPanel(msg.doc, panel); return; }
        if (msg.command === 'back')              { panel.reveal(); return; }
        if (msg.command === 'openFolder' && msg.path) {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path), true);
            return;
        }
        if (msg.command === 'open-recent' && msg.path) {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path), false);
            return;
        }
        if (msg.command === 'run' && msg.id) {
            void _executeWithOutput(msg.id, panel);
        }
        if (msg.command === 'toggle-audit-output') {
            // Show the shared output channel — this surfaces the "Run Daily Health Check" window.
            // VS Code output channels have no hide() API so the button always brings it forward;
            // a second click re-focuses the launcher panel so the user can toggle between the two.
            const ch = getChannel();
            ch.show(true); // preserveFocus so launcher stays primary
        }
        if (msg.command === 'toggle-pin' && msg.id) {
            const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
            const pins = getPinnedIds(wsPath);
            const idx = pins.indexOf(msg.id as string);
            if (idx >= 0) { pins.splice(idx, 1); } else { pins.push(msg.id as string); }
            await setPinnedIds(wsPath, pins);
            if (_panel) { _panel.webview.html = await buildPanelHtml(wsPath); }
            return;
        }
        if (msg.command === 'file-audit-issue') {
            const checkId: string = msg.checkId ?? '';
            const summary: string = msg.summary ?? 'Audit check failed.';
            const status: string  = msg.status  ?? 'red';
            const now             = new Date().toISOString();
            try {
                const result = await fileHealthBugAsIssue({
                    id:             `audit-${checkId}-${Date.now()}`,
                    title:          `[Audit] ${checkId || 'Health check'} — ${status === 'red' ? 'Red' : 'Warning'}`,
                    detail:         summary,
                    category:       'audit',
                    priority:       status === 'red' ? 'high' : 'medium',
                    checkId,
                    detectedAt:     now,
                    recommendation: 'Run Daily Health Check and address flagged items.',
                });
                const issueUrl = result.issueUrl ?? '';
                const choice = await vscode.window.showInformationMessage(
                    `Filed issue #${result.issueNumber}: ${issueUrl}`,
                    'Open in Browser'
                );
                if (choice === 'Open in Browser' && issueUrl) {
                    await vscode.env.openExternal(vscode.Uri.parse(issueUrl));
                }
            } catch (err) {
                const body = `## Audit Diagnostic\n\n**Check:** ${checkId}\n**Status:** ${status}\n**Detected:** ${now}\n\n${summary}`;
                const action = await vscode.window.showErrorMessage(
                    `Failed to file GitHub issue: ${err instanceof Error ? err.message : String(err)}`,
                    'Copy Markdown'
                );
                if (action === 'Copy Markdown') {
                    await vscode.env.clipboard.writeText(body);
                }
                logError('Failed to file audit issue', err instanceof Error ? err.stack ?? String(err) : String(err), 'cvs-command-launcher');
            }
        }
    });
}

export async function runWithOutput(commandId: string): Promise<void> {
    return _executeWithOutput(commandId, undefined);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * Builds a Set of every command ID currently registered with VS Code.
 * Used by the launcher (issue #65) to filter the catalog so unregistered
 * commands never get rendered as clickable cards. Mirrors the same filter
 * the home page applies for its quick-launch buttons.
 */
async function getRegisteredCommandSet(): Promise<Set<string>> {
    return new Set(await vscode.commands.getCommands(false));
}

async function buildPanelHtml(wsPath: string): Promise<string> {
    const cvtPaths = new Set((loadRegistry()?.projects ?? []).map(p => p.path.toLowerCase().replace(/\\/g, '/')));
    return buildLauncherHtml(
        loadLastReport(), wsPath, getHistory(), getRecentProjects(),
        await getRegisteredCommandSet(), cvtPaths,
        detectWorkspaceType(wsPath), getPinnedIds(wsPath)
    );
}

async function showLauncherPanel(): Promise<void> {
    const wsPath  = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const wsName  = vscode.workspace.workspaceFolders?.[0]?.name ?? 'CieloVista Tools';
    touchCurrentProject();
    const html = await buildPanelHtml(wsPath);
    if (_panel) { _panel.webview.html = html; _panel.reveal(vscode.ViewColumn.One, true); return; }
    _panel = vscode.window.createWebviewPanel(
        'cvsLauncher', `\u26a1 ${wsName}`, vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _panel.webview.html = html;
    _panel.onDidDispose(() => {
        _panelMessageSubscription?.dispose();
        _panelMessageSubscription = undefined;
        _panel = undefined;
    });
    attachMessageHandler(_panel);
}

async function refreshLauncherPanel(): Promise<void> {
    if (!_panel) { return; }
    const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    _panel.webview.html = await buildPanelHtml(wsPath);
}

// ─── Activate / Deactivate ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    _context = context;
    initHistory(context);
    initRecentProjects(context);
    onMcpServerStatusChange((status) => {
        if (_panel) { _panel.webview.postMessage({ type: 'mcp-status', status }); }
    });
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand(LAUNCHER_COMMAND_ID,          showLauncherPanel),
        vscode.commands.registerCommand(QUICKRUN_COMMAND_ID,          showLauncherPanel),
        vscode.commands.registerCommand('cvs.launcher.refresh',       refreshLauncherPanel),
        vscode.commands.registerCommand('cvs.launcher.runWithOutput', (id: string) => runWithOutput(id)),
        vscode.commands.registerCommand('cvs.mcp.startServer', async () => {
            if (getMcpServerStatus() === 'up') { stopMcpServer(); } else { startMcpServer(); }
        }),
    );
    _statusBar = vscode.window.createStatusBarItem('cielovista.cvsCmds', vscode.StatusBarAlignment.Left, 100);
    _statusBar.name    = 'CieloVista CVS Commands';
    _statusBar.text    = '$(list-selection) CVS Cmds';
    _statusBar.tooltip = 'Open CieloVista Tools \u2014 guided search & launcher';
    _statusBar.command = LAUNCHER_COMMAND_ID;
    _statusBar.show();
    context.subscriptions.push(_statusBar);
    vscode.window.registerWebviewPanelSerializer('cvsLauncher', {
        async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
            _panel = panel;
            _panel.webview.options = { enableScripts: true };
            const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
            const wsName = vscode.workspace.workspaceFolders?.[0]?.name ?? 'CieloVista Tools';
            _panel.title = `\u26a1 ${wsName}`;
            _panel.webview.html = buildLauncherHtml(loadLastReport(), wsPath, [], [], await getRegisteredCommandSet());
            _panel.onDidDispose(() => {
                _panelMessageSubscription?.dispose();
                _panelMessageSubscription = undefined;
                _panel = undefined;
            });
            attachMessageHandler(_panel);
            log(FEATURE, 'Panel restored after reload');
        }
    });
}

export function deactivate(): void {
    _panelMessageSubscription?.dispose();
    _panelMessageSubscription = undefined;
    _helpPanel?.dispose();
    _panel?.dispose();
    _panel     = undefined;
    _statusBar?.dispose();
    _statusBar = undefined;
}
