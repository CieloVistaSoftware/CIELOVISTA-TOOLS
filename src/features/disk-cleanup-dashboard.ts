// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { execFileSync, spawn } from 'child_process';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'disk-cleanup-dashboard';
const DATA_DIR = path.join(
    process.env['ProgramData'] ?? 'C:\\ProgramData',
    'DiskCleanUp'
);
const PORT_FILE       = path.join(DATA_DIR, 'dashboard-port.txt');
const WAIT_TIMEOUT_MS = 15_000;   // max time to wait for service to become ready
const POLL_INTERVAL   = 400;

let _consolePanel: vscode.WebviewPanel | undefined;
let _consoleProc:  ReturnType<typeof spawn> | undefined;

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.diskcleanup.openDashboard', openDashboard),
        vscode.commands.registerCommand('cvs.diskcleanup.consoleMode',   () => void openConsolePanel(context)),
    );
}

export function deactivate(): void {
    _consoleProc?.kill();
    _consoleProc = undefined;
}

async function openDashboard(): Promise<void> {
    // If --serve is already running and healthy, open inside VS Code.
    if (fs.existsSync(PORT_FILE)) {
        const raw  = fs.readFileSync(PORT_FILE, 'utf8').trim();
        const port = parseInt(raw, 10);
        if (!isNaN(port) && port > 0 && await isAlive(port)) {
            log(FEATURE, `Dashboard already running on port ${port} — opening in VS Code.`);
            openInSimpleBrowser(`http://localhost:${port}`);
            return;
        }
        // Stale port file — clean up and relaunch.
        log(FEATURE, `Stale port file (port ${port} not responding) — cleaning up and relaunching.`);
        try { fs.unlinkSync(PORT_FILE); } catch { /* ignore */ }
    }

    // Locate the service exe.
    const exePath = resolveExePath();
    if (!exePath) {
        const choice = await vscode.window.showErrorMessage(
            'DiskCleanUp service executable not found. Configure the path in settings.',
            'Open Settings'
        );
        if (choice === 'Open Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'cvs.diskcleanup.exePath');
        }
        return;
    }

    log(FEATURE, `Launching DiskCleanUp dashboard: ${exePath} --serve`);

    // Spawn the service detached so VS Code doesn't wait for it.
    const child = spawn(exePath, ['--serve'], {
        detached: true,
        stdio:    'ignore',
        cwd:      path.dirname(exePath),
    });
    child.unref();

    // Wait for the service to write PORT_FILE and start listening, then open inside VS Code.
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'DiskCleanUp: Starting dashboard…', cancellable: false },
        async () => {
            const url = await waitForReady();
            if (url) {
                log(FEATURE, `Dashboard ready — opening ${url} in VS Code.`);
                openInSimpleBrowser(url);
            } else {
                logError('Dashboard did not become ready in time.', '', FEATURE);
                void vscode.window.showWarningMessage(
                    'DiskCleanUp dashboard did not start within 15 seconds. Try opening it manually.'
                );
            }
        }
    );
}

/** Open a URL in VS Code's built-in Simple Browser panel. */
function openInSimpleBrowser(url: string): void {
    void vscode.commands.executeCommand('simpleBrowser.show', url);
}

/**
 * Poll until the service writes PORT_FILE and starts listening on the port,
 * or until WAIT_TIMEOUT_MS is exceeded.  Returns the base URL, or null on timeout.
 */
function waitForReady(): Promise<string | null> {
    return new Promise(resolve => {
        const deadline = Date.now() + WAIT_TIMEOUT_MS;

        const tick = async () => {
            if (Date.now() > deadline) { resolve(null); return; }

            // Try reading PORT_FILE first.
            let port = 0;
            if (fs.existsSync(PORT_FILE)) {
                const raw = fs.readFileSync(PORT_FILE, 'utf8').trim();
                port = parseInt(raw, 10);
            }

            if (port > 0 && await isAlive(port)) {
                resolve(`http://localhost:${port}`);
                return;
            }

            setTimeout(tick, POLL_INTERVAL);
        };

        void tick();
    });
}

function isAlive(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const req = http.get(`http://localhost:${port}/api/service/info`, res => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.setTimeout(1500, () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

// ── Console Mode ─────────────────────────────────────────────────────────────

const ERROR_RE   = /error\s+(?:MSB|CS|NU|NETSDK)\d*|^\s*Exception|unhandled exception|build failed|error\s*:/i;
const WARNING_RE = /(?:warning\s+(?:MSB|CS|NU)\d*|warning\s*:)/i;

async function openConsolePanel(context: vscode.ExtensionContext): Promise<void> {
    if (_consolePanel) {
        _consolePanel.reveal(vscode.ViewColumn.Beside);
        return;
    }

    _consolePanel = vscode.window.createWebviewPanel(
        'dcConsole',
        '🖥 DiskCleanUp Console',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true }
    );

    let lines: Array<{ text: string; kind: 'error' | 'warn' | 'info' }> = [];
    let errorCount = 0;
    let warnCount  = 0;

    const addLine = (raw: string, kind: 'error' | 'warn' | 'info') => {
        lines.push({ text: raw, kind });
        if (kind === 'error') { errorCount++; }
        if (kind === 'warn')  { warnCount++;  }
        updateTitle();
        _consolePanel?.webview.postMessage({ type: 'line', text: raw, kind });
    };

    const updateTitle = () => {
        if (!_consolePanel) { return; }
        try {
            if (errorCount > 0) {
                _consolePanel.title = `❌ DiskCleanUp Console — ${errorCount} error${errorCount > 1 ? 's' : ''}`;
            } else if (warnCount > 0) {
                _consolePanel.title = `⚠ DiskCleanUp Console — ${warnCount} warning${warnCount > 1 ? 's' : ''}`;
            } else {
                _consolePanel.title = '🖥 DiskCleanUp Console';
            }
        } catch { /* disposed */ }
    };

    _consolePanel.webview.html = buildConsoleHtml();

    // Wire up webview messages
    _consolePanel.webview.onDidReceiveMessage(async (msg: { command: string; text?: string }) => {
        if (msg.command === 'copy') {
            await vscode.env.clipboard.writeText(lines.map(l => l.text).join('\n'));
            void vscode.window.showInformationMessage('Console output copied to clipboard.');
        }
        if (msg.command === 'chat') {
            const text = lines.map(l => l.text).join('\n');
            await vscode.env.clipboard.writeText(text);
            void vscode.window.showInformationMessage('Console output on clipboard — paste into Copilot Chat.');
        }
        if (msg.command === 'file-issue') {
            const errors = lines.filter(l => l.kind === 'error').map(l => l.text).join('\n');
            const title  = encodeURIComponent('DiskCleanUp console error');
            const body   = encodeURIComponent(`## Console Errors\n\`\`\`\n${errors.slice(0, 2000)}\n\`\`\``);
            void vscode.env.openExternal(vscode.Uri.parse(
                `https://github.com/CieloVistaSoftware/cielovista-tools/issues/new?title=${title}&body=${body}&labels=type:bug,project:cielovista-tools`
            ));
        }
        if (msg.command === 'restart') {
            _consoleProc?.kill();
            lines = [];
            errorCount = 0;
            warnCount  = 0;
            _consolePanel?.webview.postMessage({ type: 'clear' });
            void spawnConsole(addLine);
        }
    }, null, context.subscriptions);

    _consolePanel.onDidDispose(() => {
        _consoleProc?.kill();
        _consoleProc = undefined;
        _consolePanel = undefined;
    }, null, context.subscriptions);

    // Start the process
    void spawnConsole(addLine);
}

async function spawnConsole(
    addLine: (raw: string, kind: 'error' | 'warn' | 'info') => void
): Promise<void> {
    // Resolve the DiskCleanUp.Service project dir for `dotnet run`
    const exePath = resolveExePath();
    let cwd: string | undefined;

    if (exePath) {
        // exe is at …/bin/Debug/net8.0/DiskCleanUp.Service.exe → go up 3 dirs
        cwd = path.resolve(path.dirname(exePath), '..', '..', '..');
        if (!fs.existsSync(cwd)) { cwd = undefined; }
    }

    // Fallback: known developer path
    if (!cwd) {
        const fallback = path.join(
            process.env['USERPROFILE'] ?? '',
            'source', 'repos', 'DiskCleanUp', 'DiskCleanUp.Service'
        );
        if (fs.existsSync(fallback)) { cwd = fallback; }
    }

    if (!cwd) {
        addLine('ERROR: Could not find DiskCleanUp.Service project directory.', 'error');
        addLine('Configure cvs.diskcleanup.exePath in settings.', 'error');
        return;
    }

    // Kill any running DiskCleanUp.Service so dotnet can rebuild without MSB3026 DLL locks.
    try {
        addLine('→ Stopping any running DiskCleanUp.Service instance…', 'info');
        execFileSync('powershell.exe', [
            '-NonInteractive', '-NoProfile', '-Command',
            'Stop-Process -Name DiskCleanUp.Service -Force -ErrorAction SilentlyContinue',
        ], { timeout: 5000 });
    } catch { /* process not running — ignore */ }

    addLine(`> dotnet run --environment Console  (${cwd})`, 'info');

    const proc = spawn('dotnet', ['run', '--environment', 'Console'], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
    });
    _consoleProc = proc;

    const onLine = (raw: string) => {
        const line = raw.trimEnd();
        if (!line) { return; }
        const kind = ERROR_RE.test(line)   ? 'error'
                   : WARNING_RE.test(line) ? 'warn'
                   : 'info';
        addLine(line, kind);
    };

    let stdoutBuf = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString();
        const parts = stdoutBuf.split(/\r?\n/);
        stdoutBuf = parts.pop() ?? '';
        parts.forEach(onLine);
    });

    let stderrBuf = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString();
        const parts = stderrBuf.split(/\r?\n/);
        stderrBuf = parts.pop() ?? '';
        parts.forEach(l => onLine(l));
    });

    proc.on('close', (code) => {
        if (stdoutBuf) { onLine(stdoutBuf); }
        if (stderrBuf) { onLine(stderrBuf); }
        addLine(`— Process exited with code ${code ?? '?'} —`, code === 0 ? 'info' : 'error');
        _consoleProc = undefined;
    });

    proc.on('error', (err) => {
        addLine(`ERROR spawning dotnet: ${err.message}`, 'error');
        _consoleProc = undefined;
    });
}

function buildConsoleHtml(): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-editor-font-family,monospace);font-size:12px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);display:flex;flex-direction:column;height:100vh;overflow:hidden}
#toolbar{display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--vscode-sideBar-background);border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;flex-wrap:wrap}
#toolbar span{font-size:11px;font-weight:700;flex:1;color:var(--vscode-editor-foreground)}
.tb-btn{padding:3px 10px;border:1px solid var(--vscode-button-border,#444);border-radius:3px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;font-size:11px;white-space:nowrap}
.tb-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.tb-btn-issue{border-color:#f85149;color:#f85149}
#output{flex:1;overflow-y:auto;padding:8px 12px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;line-height:1.5}
.line-info{color:var(--vscode-editor-foreground);opacity:.85}
.line-warn{color:#cca700}
.line-error{color:#f85149;font-weight:600}
#status{font-size:10px;color:var(--vscode-descriptionForeground);padding:3px 12px;border-top:1px solid var(--vscode-panel-border);flex-shrink:0}
</style>
</head><body>
<div id="toolbar">
  <span>🖥 DiskCleanUp Console</span>
  <button class="tb-btn" id="btn-restart">↺ Restart</button>
  <button class="tb-btn" id="btn-copy">Copy Output</button>
  <button class="tb-btn" id="btn-chat">Copy to Chat</button>
  <button class="tb-btn tb-btn-issue" id="btn-issue" style="display:none">📋 File Issue</button>
</div>
<div id="output"></div>
<div id="status">Waiting for output…</div>
<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();
const out  = document.getElementById('output');
const stat = document.getElementById('status');
const issueBtn = document.getElementById('btn-issue');
let lineCount = 0, errCount = 0;

function appendLine(text, kind) {
    const d = document.createElement('div');
    d.className = 'line-' + kind;
    d.textContent = text;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
    lineCount++;
    if (kind === 'error') {
        errCount++;
        issueBtn.style.display = '';
    }
    stat.textContent = lineCount + ' lines' + (errCount > 0 ? '  |  ' + errCount + ' error(s)' : '');
}

window.addEventListener('message', function(e) {
    const m = e.data;
    if (m.type === 'line')  { appendLine(m.text, m.kind); }
    if (m.type === 'clear') { out.innerHTML = ''; lineCount = 0; errCount = 0; issueBtn.style.display = 'none'; stat.textContent = 'Waiting for output…'; }
});

document.getElementById('btn-copy').addEventListener('click', function() { vscode.postMessage({ command: 'copy' }); });
document.getElementById('btn-chat').addEventListener('click', function() { vscode.postMessage({ command: 'chat' }); });
document.getElementById('btn-issue').addEventListener('click', function() { vscode.postMessage({ command: 'file-issue' }); });
document.getElementById('btn-restart').addEventListener('click', function() { vscode.postMessage({ command: 'restart' }); });
})();
</script>
</body></html>`;
}

function resolveExePath(): string | null {
    // 1. User-configured setting
    const cfg = vscode.workspace.getConfiguration('cvs.diskcleanup');
    const fromSetting: string = cfg.get('exePath') ?? '';
    if (fromSetting && fs.existsSync(fromSetting)) {
        return fromSetting;
    }

    // 2. Windows Service registry entry (strips the --scan arg that sc.exe appended)
    try {
        const out = execFileSync('reg', [
            'query',
            'HKLM\\SYSTEM\\CurrentControlSet\\Services\\DiskCleanUp',
            '/v', 'ImagePath',
        ], { encoding: 'utf8', timeout: 3000 });
        const match = out.match(/ImagePath\s+REG_EXPAND_SZ\s+"?([^"\r\n]+?)(?:\s+--\w+)?"?\s*$/im);
        if (match) {
            const exePath = match[1].trim();
            if (fs.existsSync(exePath)) return exePath;
        }
    } catch { /* service not installed — fall through */ }

    // 3. Known debug-build path (developer machine)
    const debugPath = path.join(
        process.env['USERPROFILE'] ?? '',
        'source', 'repos', 'DiskCleanUp',
        'DiskCleanUp.Service', 'bin', 'Debug', 'net8.0',
        'DiskCleanUp.Service.exe'
    );
    if (fs.existsSync(debugPath)) return debugPath;

    return null;
}
