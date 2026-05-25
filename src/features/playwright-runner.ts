// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { log, logError } from '../shared/output-channel';
import { loadRegistry } from '../shared/registry';

const FEATURE = 'playwright-runner';
let pwProcess: ChildProcessWithoutNullStreams | null = null;
let pwOutput = '';
let _panel: vscode.WebviewPanel | undefined;

const PW_MD_PATH = path.join(__dirname, '../data/playwright-run-result.md');

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.playwright.run', runPlaywrightTests),
        vscode.commands.registerCommand('cvs.playwright.stop', stopPlaywrightTests),
        vscode.commands.registerCommand('cvs.playwright.cleanResults', cleanTestResults)
    );
}

export function deactivate(): void {
    stopPlaywrightTests();
}

/* ── Webview panel ───────────────────────────────────────────────────────── */

function ensurePanel(): vscode.WebviewPanel {
    if (_panel) {
        _panel.reveal(vscode.ViewColumn.Beside, true);
        return _panel;
    }
    _panel = vscode.window.createWebviewPanel(
        'playwrightRunner',
        '🎭 Playwright Tests',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _panel.webview.html = buildPanelHtml();
    _panel.onDidDispose(() => { _panel = undefined; });
    return _panel;
}

function postToPanel(msg: Record<string, unknown>): void {
    _panel?.webview.postMessage(msg);
}

/** Parse Playwright output lines for pass/fail/skip/total counts. */
function parseProgress(text: string): { passed: number; failed: number; skipped: number; total: number } {
    // e.g. "  12 passed (4s)"  /  "  3 failed"  /  "  1 skipped"  /  "Running 47 tests"
    let passed = 0, failed = 0, skipped = 0, total = 0;
    const runMatch = text.match(/Running\s+(\d+)\s+test/i);
    if (runMatch) { total = parseInt(runMatch[1], 10); }
    const passMatch = text.match(/(\d+)\s+passed/i);
    if (passMatch) { passed = parseInt(passMatch[1], 10); }
    const failMatch = text.match(/(\d+)\s+failed/i);
    if (failMatch) { failed = parseInt(failMatch[1], 10); }
    const skipMatch = text.match(/(\d+)\s+skipped/i);
    if (skipMatch) { skipped = parseInt(skipMatch[1], 10); }
    return { passed, failed, skipped, total };
}

function buildPanelHtml(): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);display:flex;flex-direction:column;height:100vh}
.toolbar{padding:8px 12px;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:8px;align-items:center;flex-shrink:0}
.toolbar-title{font-weight:700;font-size:13px}
.progress-wrap{flex:1;height:8px;background:var(--vscode-progressBar-background,#3c3c3c);border-radius:4px;overflow:hidden;min-width:80px;max-width:200px}
.progress-bar{height:100%;width:0%;background:var(--vscode-testing-iconPassed,#3fb950);border-radius:4px;transition:width .3s}
.progress-bar.fail{background:var(--vscode-testing-iconFailed,#f85149)}
.counter{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.status-pill{font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap}
.pill-running{background:rgba(88,166,255,.15);color:var(--vscode-textLink-foreground)}
.pill-passed{background:rgba(63,185,80,.15);color:var(--vscode-testing-iconPassed,#3fb950)}
.pill-failed{background:rgba(248,81,73,.15);color:var(--vscode-inputValidation-errorBorder,#f85149)}
.pill-idle{background:var(--vscode-textCodeBlock-background);color:var(--vscode-descriptionForeground)}
.output{flex:1;overflow-y:auto;padding:8px 12px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-all}
.line-pass{color:var(--vscode-testing-iconPassed,#3fb950)}
.line-fail{color:var(--vscode-inputValidation-errorBorder,#f85149)}
.line-skip{color:var(--vscode-inputValidation-warningBorder,#cca700)}
.line-head{color:var(--vscode-textLink-foreground);font-weight:700}
</style>
</head><body>
<div class="toolbar">
  <span class="toolbar-title">🎭 Playwright Tests</span>
  <span id="pill" class="status-pill pill-idle">Idle</span>
  <div class="progress-wrap"><div id="pbar" class="progress-bar"></div></div>
  <span id="counter" class="counter"></span>
</div>
<div id="output" class="output"><span style="color:var(--vscode-descriptionForeground)">Waiting for test run…</span></div>
<script>
(function(){
var outputEl = document.getElementById('output');
var pillEl   = document.getElementById('pill');
var pbarEl   = document.getElementById('pbar');
var counterEl = document.getElementById('counter');

function classify(line) {
    var l = line.toLowerCase();
    if (/✓|✔|passed|\\bpass\\b/.test(l)) { return 'line-pass'; }
    if (/✗|×|failed|\\bfail\\b|error/.test(l))  { return 'line-fail'; }
    if (/skipped|pending/.test(l)) { return 'line-skip'; }
    if (/running|playwright|\\btest\\b/.test(l)) { return 'line-head'; }
    return '';
}

window.addEventListener('message', function(e) {
    var msg = e.data;
    if (msg.type === 'start') {
        outputEl.textContent = '';
        pillEl.className = 'status-pill pill-running';
        pillEl.textContent = 'Running…';
        pbarEl.style.width = '0%';
        pbarEl.className = 'progress-bar';
        counterEl.textContent = '';
    }
    if (msg.type === 'line') {
        var span = document.createElement('span');
        var cls = classify(msg.text);
        if (cls) { span.className = cls; }
        span.textContent = msg.text + '\\n';
        outputEl.appendChild(span);
        outputEl.scrollTop = outputEl.scrollHeight;
    }
    if (msg.type === 'progress') {
        var total   = msg.total   || 0;
        var done    = (msg.passed || 0) + (msg.failed || 0) + (msg.skipped || 0);
        var hasFail = (msg.failed || 0) > 0;
        if (total > 0) {
            var pct = Math.min(100, Math.round(done / total * 100));
            pbarEl.style.width = pct + '%';
            pbarEl.className = 'progress-bar' + (hasFail ? ' fail' : '');
            counterEl.textContent = done + ' / ' + total + ' (' + pct + '%)';
        }
    }
    if (msg.type === 'done') {
        if (msg.failed > 0) {
            pillEl.className = 'status-pill pill-failed';
            pillEl.textContent = '❌ ' + msg.failed + ' failed';
            pbarEl.className = 'progress-bar fail';
        } else {
            pillEl.className = 'status-pill pill-passed';
            pillEl.textContent = '✅ All passed';
            pbarEl.className = 'progress-bar';
        }
        pbarEl.style.width = '100%';
        if (msg.total > 0) {
            counterEl.textContent = msg.passed + ' / ' + msg.total + ' (100%)';
        }
    }
    if (msg.type === 'stopped') {
        pillEl.className = 'status-pill pill-idle';
        pillEl.textContent = '⏹ Stopped';
    }
    if (msg.type === 'error') {
        pillEl.className = 'status-pill pill-failed';
        pillEl.textContent = '❌ Error';
        var errSpan = document.createElement('span');
        errSpan.className = 'line-fail';
        errSpan.textContent = '\\nERROR: ' + msg.text + '\\n';
        outputEl.appendChild(errSpan);
        outputEl.scrollTop = outputEl.scrollHeight;
    }
});
})();
</script>
</body></html>`;
}

/* ── Test runner ─────────────────────────────────────────────────────────── */

async function runPlaywrightTests(): Promise<void> {
    if (pwProcess) {
        vscode.window.showWarningMessage('Playwright test run is already in progress.');
        ensurePanel();
        return;
    }
    const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const testFiles = await vscode.window.showOpenDialog({
        title: 'Select Playwright test files to run (*.spec.ts / *.test.ts)',
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: true,
        openLabel: 'Run Selected Tests',
        filters: { 'Playwright Tests': ['spec.ts', 'test.ts'] },
        defaultUri: vscode.Uri.file(path.join(wsPath, 'tests'))
    });
    if (!testFiles || testFiles.length === 0) {
        vscode.window.showInformationMessage('No test files selected.');
        return;
    }

    const panel = ensurePanel();
    postToPanel({ type: 'start' });
    pwOutput = '';

    // Playwright expects relative paths (forward-slash) from the project root —
    // absolute Windows paths with backslashes are treated as regex and never match.
    const args = ['test', '--headed', ...testFiles.map(f =>
        path.relative(wsPath, f.fsPath).replace(/\\/g, '/')
    )];
    pwProcess = spawn('npx', ['playwright', ...args], { cwd: wsPath, shell: true });
    log(FEATURE, 'Started Playwright tests in headed mode.');

    let lastTotal = 0;

    function handleChunk(chunk: Buffer): void {
        const text = chunk.toString();
        pwOutput += text;
        // Stream line by line
        text.split('\n').forEach(line => {
            if (line.trim()) {
                postToPanel({ type: 'line', text: line });
            }
        });
        // Parse progress from running totals
        const prog = parseProgress(pwOutput);
        if (prog.total > 0) { lastTotal = prog.total; }
        const runTotal = lastTotal || prog.total;
        if (runTotal > 0) {
            postToPanel({ type: 'progress', ...prog, total: runTotal });
        }
    }

    pwProcess.stdout.on('data', handleChunk);
    pwProcess.stderr.on('data', handleChunk);

    pwProcess.on('close', (code) => {
        log(FEATURE, `Playwright exited with code ${code ?? -1}`);
        const final = parseProgress(pwOutput);
        postToPanel({ type: 'done', passed: final.passed, failed: final.failed, skipped: final.skipped, total: lastTotal || final.total, code });
        writePlaywrightResultMarkdown(code ?? -1);
        pwProcess = null;
    });

    pwProcess.on('error', (err) => {
        logError('Playwright process error', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        postToPanel({ type: 'error', text: String(err) });
        writePlaywrightResultMarkdown(-1);
        pwProcess = null;
    });

    // Reveal panel (in case it was behind another tab)
    panel.reveal(vscode.ViewColumn.Beside, true);
}

function stopPlaywrightTests(): void {
    if (pwProcess) {
        try {
            pwProcess.kill('SIGKILL');
            log(FEATURE, 'Playwright test process killed.');
        } catch (e) {
            logError('Failed to kill Playwright process', e instanceof Error ? e.stack || String(e) : String(e), FEATURE);
        }
        pwProcess = null;
        postToPanel({ type: 'stopped' });
        vscode.window.showInformationMessage('Playwright test run stopped.');
    }
}

function writePlaywrightResultMarkdown(code: number): void {
    const status = code === 0 ? '✅ **All tests passed**' : '❌ **Test failures or error**';
    const md = `# Playwright Test Result\n\n${status}\n\n---\n\n\`\`\`shell\n${pwOutput}\n\`\`\``;
    try {
        const dir = path.dirname(PW_MD_PATH);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(PW_MD_PATH, md, 'utf8');
    } catch { /* non-fatal */ }
}

const RESULT_DIRS = ['test-results', 'playwright-report'];

async function cleanTestResults(): Promise<void> {
    const registry = loadRegistry();
    const roots: string[] = [];
    if (registry) {
        roots.push(registry.globalDocsPath);
        registry.projects.forEach(p => roots.push(p.path));
    }
    // Also include current workspace folders not in registry
    (vscode.workspace.workspaceFolders ?? []).forEach(wf => {
        if (!roots.includes(wf.uri.fsPath)) { roots.push(wf.uri.fsPath); }
    });

    const deleted: string[] = [];
    for (const root of roots) {
        for (const dirName of RESULT_DIRS) {
            const target = path.join(root, dirName);
            if (fs.existsSync(target)) {
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.file(target), { recursive: true, useTrash: false });
                    deleted.push(target);
                    log(FEATURE, `Deleted: ${target}`);
                } catch (err) {
                    logError(`Failed to delete ${target}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                }
            }
        }
    }

    if (deleted.length === 0) {
        vscode.window.showInformationMessage('No test-results or playwright-report folders found.');
    } else {
        vscode.window.showInformationMessage(
            `Cleaned ${deleted.length} folder${deleted.length === 1 ? '' : 's'}: ${deleted.map(d => path.basename(path.dirname(d)) + '/' + path.basename(d)).join(', ')}`
        );
    }
}
