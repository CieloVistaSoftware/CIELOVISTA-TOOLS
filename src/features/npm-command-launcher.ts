// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * npm-command-launcher.ts
 *
 * Shows all workspace npm scripts grouped as project cards.
 * Uses the shared PROJECT_CARD_SHELL_HTML + ProjectCardData[].
 * TypeScript never generates HTML — it only sends JSON.
 *
 * Commands:
 *   cvs.npm.showAndRunScripts
 *   cvs.npm.addScriptDescription
 */

import * as vscode from 'vscode';
import * as cp     from 'child_process';
import * as path   from 'path';
import * as fs     from 'fs';
import { log, logError } from '../shared/output-channel';
import { PROJECT_CARD_SHELL_HTML } from '../shared/project-card-shell';
import { buildCardFromPackageDir  } from '../shared/project-card-builder';
import type { ProjectCardData }     from '../shared/project-card-types';
import { loadRegistry, saveRegistry, REGISTRY_PATH } from '../shared/registry';
import { sendToCopilotChat } from './terminal-copy-output';
import { getMcpServerStatus, onMcpServerStatusChange, offMcpServerStatusChange } from './mcp-server-status';

const FEATURE                 = 'npm-command-launcher';
const SHOW_AND_RUN_COMMAND    = 'cvs.npm.showAndRunScripts';
const ADD_DESCRIPTION_COMMAND = 'cvs.npm.addScriptDescription';

let _statusBar:    vscode.StatusBarItem | undefined;
let _panel:        vscode.WebviewPanel  | undefined;
let _outputPanel:  vscode.WebviewPanel  | undefined;
let _outputReady = false;
let _outputQueue: Array<Record<string, unknown>> = [];

// key = cardId::scriptName
const _running = new Map<string, cp.ChildProcess>();

function normalizeFsPath(value: string): string {
    return path.normalize(value).replace(/[\\/]+$/, '').toLowerCase();
}

function postRegistryToPanel(): void {
    if (!_panel) { return; }
    const registry = loadRegistry();
    const projects = (registry?.projects ?? []).map(project => ({
        ...project,
        exists: fs.existsSync(project.path),
    }));
    void _panel.webview.postMessage({ type: 'cfg-registry', projects });
}

async function scanFolderForRegistry(folderPath: string): Promise<Array<{ name: string; path: string; alreadyAdded: boolean; typeHint: string }>> {
    const registry = loadRegistry();
    const registeredSet = new Set((registry?.projects ?? []).map(project => project.path.toLowerCase()));
    const skipDirs = new Set(['.git', 'node_modules', 'out', 'dist', '.vscode', 'bin', 'obj']);
    const results: Array<{ name: string; path: string; alreadyAdded: boolean; typeHint: string }> = [];
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) { continue; }
        if (entry.name.startsWith('.') || skipDirs.has(entry.name)) { continue; }

        const fullPath = path.join(folderPath, entry.name);
        const alreadyAdded = registeredSet.has(fullPath.toLowerCase());
        let typeHint = 'app';

        try {
            const pkgFile = path.join(fullPath, 'package.json');
            if (fs.existsSync(pkgFile)) {
                const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { engines?: { vscode?: string } };
                typeHint = pkg.engines?.vscode ? 'vscode-extension' : 'app';
            } else {
                const subItems = fs.readdirSync(fullPath);
                if (subItems.some(item => /\.sln[x]?$/i.test(item)) || subItems.some(item => /\.csproj$/i.test(item))) {
                    typeHint = 'dotnet-service';
                }
            }
        } catch {
            // Keep default app hint.
        }

        results.push({ name: entry.name, path: fullPath, alreadyAdded, typeHint });
    }

    results.sort((left, right) => left.name.localeCompare(right.name));
    return results;
}

// ─── ANSI strip ───────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[\d;]*[a-zA-Z]|\x1b[()][AB012]|\r/g;
function stripAnsi(s: string): string { return s.replace(ANSI_RE, ''); }

// ─── Output panel ─────────────────────────────────────────────────────────────

function buildOutputShellHtml(): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:var(--vscode-editor-font-family,monospace);font-size:12px;background:var(--vscode-terminal-background,#1e1e1e);color:var(--vscode-terminal-foreground,#d4d4d4);display:flex;flex-direction:column}
#log{flex:1;overflow-y:auto;padding:8px 12px;position:relative}
#empty-state{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;color:#858585;pointer-events:none}
#empty-state .ico{font-size:32px;margin-bottom:12px;opacity:.4}
#empty-state .msg{font-size:13px;font-weight:600;color:#d4d4d4;margin-bottom:6px}
#empty-state .sub{font-size:11px;line-height:1.5;max-width:360px}
#log.has-jobs #empty-state{display:none}
#cvt-header{display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;font-size:11px}
#cvt-header .title{font-weight:700;color:#9cdcfe;letter-spacing:.02em}
#cvt-header .sep{color:#404040}
#cvt-header .hint{color:#858585;flex:1}
#cvt-header .clear-btn{background:transparent;color:#858585;border:1px solid rgba(255,255,255,.12);border-radius:3px;padding:2px 10px;cursor:pointer;font-size:11px;font-family:inherit}
#cvt-header .clear-btn:hover{background:rgba(255,255,255,.06);color:#d4d4d4}
#cvt-header .clear-btn:disabled{opacity:.4;cursor:not-allowed}
.job{border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:8px;padding-bottom:8px}
.job-hd{display:flex;align-items:baseline;gap:10px;padding:5px 0;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,.06)}
.job-name{font-weight:700;font-size:12px;color:#9cdcfe}
.job-folder{font-size:10px;color:#858585}
.job-time{font-size:10px;color:#858585;margin-left:auto}
.job-cmd{font-size:10px;color:#569cd6;margin-bottom:4px;word-break:break-all}
.job-out{white-space:pre-wrap;word-break:break-all;line-height:1.5;font-size:11px}
.job-out.empty::before{content:'(no output yet)';color:#606060;font-style:italic}
.job-footer{display:flex;align-items:center;gap:8px;margin-top:4px}
.job-rc{font-size:11px;font-weight:700}
.job-rc.ok{color:#3fb950}.job-rc.fail{color:#f85149}.job-rc.killed{color:#cca700}
.job-rc.running{color:#858585;animation:blink 1.2s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
.btn-chat{display:none;background:rgba(99,102,241,.18);color:#818cf8;border:1px solid rgba(99,102,241,.35);border-radius:3px;padding:2px 8px;cursor:pointer;font-size:10px;font-weight:600;transition:background .12s}
.btn-chat:hover{background:rgba(99,102,241,.38);color:#fff}
.btn-chat.show{display:inline-block}
.btn-chat.done{color:#3fb950;border-color:#3fb950;background:rgba(63,185,80,.12);cursor:default}
#stopbar{display:none;align-items:center;gap:8px;padding:6px 12px;background:rgba(248,81,73,.08);border-top:1px solid rgba(248,81,73,.25);flex-shrink:0}
#stopbar.show{display:flex}
#stopbar span{font-size:11px;color:#f85149;font-weight:600;flex:1}
#btn-stop-cur{background:#f85149;color:#fff;border:none;border-radius:3px;padding:4px 14px;cursor:pointer;font-size:12px;font-weight:700}
#btn-stop-cur:hover{background:#e03e36}
</style></head><body>
<div id="cvt-header">
  <span class="title">&#9654; NPM Output</span>
  <span class="sep">|</span>
  <span class="hint" id="cvt-header-hint">Reflects every npm script run from the NPM Scripts panel</span>
  <button class="clear-btn" id="btn-clear" title="Clear output history" disabled>Clear</button>
</div>
<div id="log">
  <div id="empty-state">
    <div class="ico">&#9654;</div>
    <div class="msg">No npm scripts have run yet</div>
    <div class="sub">Open the NPM Scripts panel and click <strong>Run</strong> on any script. The command, live output, and exit status will appear here.</div>
  </div>
</div>
<div id="stopbar"><span id="stop-label"></span><button id="btn-stop-cur">&#9632; Stop</button></div>
<script>(function(){
var vsc=acquireVsCodeApi();
var logEl=document.getElementById('log');
var stopbar=document.getElementById('stopbar');
var stopLabel=document.getElementById('stop-label');
var clearBtn=document.getElementById('btn-clear');
var headerHint=document.getElementById('cvt-header-hint');
var jobCount=0;
function refreshClearBtn(){clearBtn.disabled=(jobCount===0);}
clearBtn.addEventListener('click',function(){
  var jobs=logEl.querySelectorAll('.job');
  jobs.forEach(function(j){j.remove();});
  jobCount=0;
  logEl.classList.remove('has-jobs');
  headerHint.textContent='Reflects every npm script run from the NPM Scripts panel';
  refreshClearBtn();
});
document.getElementById('btn-stop-cur').addEventListener('click',function(){
  vsc.postMessage({command:'stop-current'});
});
// Copy to Chat — delegate on log container so dynamically-added buttons are covered
logEl.addEventListener('click',function(e){
  var btn=e.target.closest('.btn-chat');
  if(!btn||btn.classList.contains('done')){return;}
  var key=btn.dataset.jobkey;
  var outEl=document.getElementById('out-'+key);
  var rcEl =document.getElementById('rc-' +key);
  var job  =btn.closest('.job');
  var name =job?job.querySelector('.job-name').textContent:key;
  var output=outEl?outEl.textContent.trim():'';
  var status=rcEl ?rcEl.textContent.trim():'';
  var text='npm run '+name+'\n\n'+output+(status?'\n\n'+status:'');
  btn.textContent='Sending...';
  vsc.postMessage({command:'copy-to-chat',text:text,jobKey:key});
});
window.addEventListener('message',function(ev){
  var m=ev.data;
  if(m.type==='job-start'){
    logEl.classList.add('has-jobs');
    jobCount++;
    refreshClearBtn();
    headerHint.textContent='Last started: '+m.script+' ('+m.folder+')';
    var div=document.createElement('div');
    div.className='job';
    div.id='job-'+m.jobKey;
    div.innerHTML=
      '<div class="job-hd">'
        +'<span class="job-name">'+esc(m.script)+'</span>'
        +'<span class="job-folder">'+esc(m.folder)+'</span>'
        +'<span class="job-time">'+esc(m.time)+'</span>'
      +'</div>'
      +'<div class="job-cmd">npm run '+esc(m.script)+'</div>'
      +'<div class="job-out empty" id="out-'+esc(m.jobKey)+'"></div>'
      +'<div class="job-footer">'
        +'<span class="job-rc running" id="rc-'+esc(m.jobKey)+'">● Running…</span>'
        +'<button class="btn-chat" data-jobkey="'+esc(m.jobKey)+'">📤 Copy to Chat</button>'
      +'</div>';
    logEl.appendChild(div);
    logEl.scrollTop=logEl.scrollHeight;
    stopbar.classList.add('show');
    stopLabel.textContent='Running: '+m.script;
  } else if(m.type==='output'){
    var out=document.getElementById('out-'+m.jobKey);
    if(out){out.classList.remove('empty');out.textContent+=m.text;logEl.scrollTop=logEl.scrollHeight;}
  } else if(m.type==='done'){
    var rc=document.getElementById('rc-'+m.jobKey);
    if(rc){
      rc.classList.remove('running');
      if(m.killed){rc.textContent='■ Stopped';rc.className='job-rc killed';}
      else if(m.code===0){rc.textContent='✓ Exit 0';rc.className='job-rc ok';}
      else{rc.textContent='✗ Exit '+m.code;rc.className='job-rc fail';}
    }
    // If the job produced no output, swap placeholder to final '(no output)'
    var outDone=document.getElementById('out-'+m.jobKey);
    if(outDone&&outDone.classList.contains('empty')){outDone.classList.remove('empty');outDone.textContent='(no output)';}
    // Reveal the Copy to Chat button
    var job2=document.getElementById('job-'+m.jobKey);
    if(job2){var cb=job2.querySelector('.btn-chat');if(cb){cb.classList.add('show');}}
    stopbar.classList.remove('show');
  } else if(m.type==='chat-sent'){
    var job3=document.getElementById('job-'+m.jobKey);
    if(job3){
      var cb2=job3.querySelector('.btn-chat');
      if(cb2){
        cb2.textContent=m.ok?'✓ Sent to Chat':'✓ On Clipboard';
        cb2.classList.add('done');
      }
    }
  }
});
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
vsc.postMessage({command:'output-ready'});
// Retry in case the first ready was missed (race between HTML load and handler registration)
setTimeout(function(){vsc.postMessage({command:'output-ready'});},1000);
})();</script></body></html>`;
}

function postToOutput(payload: Record<string, unknown>): void {
    if (_outputReady) {
        void _outputPanel?.webview.postMessage(payload);
        return;
    }
    _outputQueue.push(payload);
}

function flushOutputQueue(): void {
    if (!_outputPanel || !_outputReady || _outputQueue.length === 0) { return; }
    for (const message of _outputQueue) {
        void _outputPanel.webview.postMessage(message);
    }
    _outputQueue = [];
}

function setupOutputPanel(): void {
    if (_outputPanel) { _outputPanel.reveal(vscode.ViewColumn.Beside, true); return; }
    _outputReady = false;
    _outputQueue = [];
    const panel = vscode.window.createWebviewPanel(
        'npmOutput', '\u25b6 NPM Output',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _outputPanel = panel;
    panel.onDidDispose(() => {
        _outputPanel = undefined;
        _outputReady = false;
        _outputQueue = [];
    });
    // Safety-net: if output-ready handshake hasn't arrived in 2s, force-flush the queue
    setTimeout(function() { _outputReady = true; flushOutputQueue(); }, 2000);
    // Register handler BEFORE setting HTML so output-ready is never missed
    panel.webview.onDidReceiveMessage(async msg => {
        if (msg.command === 'output-ready') {
            _outputReady = true;
            flushOutputQueue();
            return;
        }
        if (msg.command === 'stop-current') {
            _running.forEach(proc => { try { proc.kill(); } catch { /**/ } });
        }
        if (msg.command === 'copy-to-chat') {
            const text   = (msg.text as string) || '';
            const jobKey = (msg.jobKey as string) || '';
            try {
                const sent = await sendToCopilotChat(text);
                // Tell the webview: update the button state
                postToOutput({ type: 'chat-sent', jobKey, ok: sent });
                if (!sent) {
                    vscode.window.showInformationMessage('Output on clipboard — press Ctrl+V in Copilot Chat.');
                }
            } catch (err) {
                postToOutput({ type: 'chat-sent', jobKey, ok: false });
                logError('copy-to-chat failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
            }
        }
    });
    // Safety-net: if output-ready handshake never arrives (retainContextWhenHidden race),
    // force-flush after 2s so queued messages are not lost.
    setTimeout(() => { if (!_outputReady) { _outputReady = true; flushOutputQueue(); } }, 2000);
    // Set HTML after handler is registered so output-ready is never missed
    panel.webview.html = buildOutputShellHtml();
}

// ─── Collect scripts ──────────────────────────────────────────────────────────

async function collectCards(): Promise<ProjectCardData[]> {
    const byDir = new Map<string, Record<string, string>>();
    const seen  = new Set<string>();

    // Always check the root package.json of every open workspace folder first.
    // vscode.workspace.findFiles can miss the root-level package.json in some
    // workspace configurations (e.g. multi-root, no folder open, extension host).
    for (const wsFolder of vscode.workspace.workspaceFolders ?? []) {
        const pkgPath = path.join(wsFolder.uri.fsPath, 'package.json');
        if (!fs.existsSync(pkgPath)) { continue; }
        const dir = wsFolder.uri.fsPath;
        if (seen.has(dir)) { continue; }
        seen.add(dir);
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
            const scr = pkg.scripts ?? {};
            if (Object.keys(scr).length > 0) { byDir.set(dir, scr); }
        } catch (err) {
            logError(`Failed to parse root package.json: ${pkgPath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    }

    // Also scan deeper via glob to pick up nested packages (monorepos etc)
    const files = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');

    for (const file of files) {
        const dir = path.dirname(file.fsPath);
        if (seen.has(dir)) { continue; }
        seen.add(dir);
        try {
            const doc  = await vscode.workspace.openTextDocument(file);
            const pkg  = JSON.parse(doc.getText()) as { scripts?: Record<string, string> };
            const scr  = pkg.scripts ?? {};
            if (Object.keys(scr).length > 0) { byDir.set(dir, scr); }
        } catch (err) {
            logError(`Failed to parse: ${file.fsPath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        }
    }

    // Fallback: if the workspace has no npm scripts, scan all registered projects instead.
    // This happens when the current workspace (e.g. DrAlex) has no package.json.
    if (byDir.size === 0) {
        const registry = loadRegistry();
        if (registry?.projects) {
            for (const project of registry.projects) {
                if (!fs.existsSync(project.path)) { continue; }
                const pkgPath = path.join(project.path, 'package.json');
                if (!fs.existsSync(pkgPath)) { continue; }
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
                    const scr = pkg.scripts ?? {};
                    if (Object.keys(scr).length > 0) { byDir.set(project.path, scr); }
                } catch (err) {
                    logError(`Failed to parse: ${pkgPath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                }
            }
        }
    }

    // Final fallback: include known local roots even when no workspace folders are open.
    if (byDir.size === 0) {
        const fallbackDirs = [path.resolve(__dirname, '../../'), process.cwd()];
        for (const dir of fallbackDirs) {
            if (!dir || byDir.has(dir)) { continue; }
            const pkgPath = path.join(dir, 'package.json');
            if (!fs.existsSync(pkgPath)) { continue; }
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
                const scr = pkg.scripts ?? {};
                if (Object.keys(scr).length > 0) { byDir.set(dir, scr); }
            } catch (err) {
                logError(`Failed to parse: ${pkgPath}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
            }
        }
    }

    let idx = 0;
    const cards: ProjectCardData[] = [];
    for (const [dir, scripts] of byDir) {
        idx++;
        const card = buildCardFromPackageDir(path.basename(dir), dir, scripts, idx * 100);
        if (card.name === 'mcp-server') {
            card.mcpStatusDot = getMcpServerStatus();
        }
        cards.push(card);
    }
    return cards;
}

// ─── Panel ────────────────────────────────────────────────────────────────────

async function openPanel(): Promise<void> {
    const cards = await collectCards();
    if (!cards.length) {
        vscode.window.showWarningMessage('No npm scripts found in workspace.');
        return;
    }

    let latestCards = cards;
    const sendInit = () => {
        const folderSuffix = cards.length === 1 ? '  \u00b7  ' + cards[0].name : '';
        _panel?.webview.postMessage({ type: 'init', title: 'package.json Scripts' + folderSuffix, cards });
    };

    if (_panel) {
        latestCards = cards;
        sendInit();
        _panel.reveal(vscode.ViewColumn.One, false);
        return;
    }

    _panel = vscode.window.createWebviewPanel(
        'npmScripts', 'package.json',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true }
    );
    _panel.webview.html = PROJECT_CARD_SHELL_HTML;

    // Live MCP status dot — push updates to the webview whenever status changes
    const mcpStatusListener = (status: 'up' | 'down') => {
        _panel?.webview.postMessage({ type: 'mcp-dot', name: 'mcp-server', status });
    };
    onMcpServerStatusChange(mcpStatusListener);

    _panel.onDidDispose(() => {
        offMcpServerStatusChange(mcpStatusListener);
        _running.forEach(proc => { try { proc.kill(); } catch { /**/ } });
        _running.clear();
        _panel = undefined;
    });

    // Send data once the webview is ready — 800ms gives Electron enough time
    // to load and run the shell HTML before the init message fires.
    setTimeout(sendInit, 800);

    _panel.webview.onDidReceiveMessage(async msg => {
        switch (msg.command) {
            case 'run': {
                const { id, script, dir, folder } = msg as { id:string; script:string; dir:string; folder:string };
                const jobKey = `${id}::${script}`;
                setupOutputPanel();

                const sendOut  = (type: string, payload: object) => postToOutput({ jobKey, type, ...payload });
                const sendCard = (type: string, payload: object) => _panel?.webview.postMessage({ type, id, script, ...payload });

                sendOut('job-start', { script, folder, time: new Date().toLocaleTimeString() });
                sendOut('output', { text: `[CVT] Launching: npm run ${script}\n` });
                sendCard('status', { state: 'running' });

                const proc = cp.spawn('npm', ['run', script], { cwd: dir, shell: true, env: { ...process.env } });
                _running.set(jobKey, proc);

                // For server scripts (start/dev/serve), watch stdout for a
                // localhost URL and open it in VS Code's Simple Browser so
                // the user never has to leave VS Code.  Only fires once per
                // run; stale-server duplicates are avoided by the flag.
                const SERVER_SCRIPTS = /^(start|dev|serve|preview)$/;
                const LOCALHOST_URL  = /(https?:\/\/localhost:\d+[^\s'"]*)/;
                let   _browserOpened = false;

                function maybeOpenBrowser(text: string): void {
                    if (_browserOpened || !SERVER_SCRIPTS.test(script)) { return; }
                    const m = text.match(LOCALHOST_URL);
                    if (!m) { return; }
                    _browserOpened = true;
                    const url = m[1];
                    log(FEATURE, `Detected server URL: ${url} — opening Simple Browser`);
                    sendOut('output', { text: `\n[CVT] Server ready → opening ${url} in VS Code Simple Browser\n` });
                    void vscode.commands.executeCommand('simpleBrowser.show', url);
                }

                proc.stdout?.on('data', (chunk: Buffer) => {
                    const text = stripAnsi(chunk.toString());
                    sendOut('output', { text });
                    maybeOpenBrowser(text);
                });
                proc.stderr?.on('data', (chunk: Buffer) => {
                    const text = stripAnsi(chunk.toString());
                    sendOut('output', { text });
                    maybeOpenBrowser(text);  // many dev servers write their URL to stderr
                });

                let killed = false;
                proc.on('close', (code, signal) => {
                    _running.delete(jobKey);
                    killed = signal === 'SIGTERM' || signal === 'SIGKILL';
                    const state = killed ? 'stopped' : code === 0 ? 'ok' : 'error';
                    sendOut('done', { code: code ?? 1, killed });
                    sendCard('status', { state, code: code ?? 1 });
                    log(FEATURE, `${script} exited ${code ?? 1}${killed ? ' (killed)' : ''}`);
                });
                proc.on('error', err => {
                    _running.delete(jobKey);
                    sendOut('output', { text: `\nError: ${err.message}\n` });
                    sendOut('done', { code: 1, killed: false });
                    sendCard('status', { state: 'error', code: 1 });
                    logError(`Failed to spawn: ${script}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
                });
                break;
            }
            case 'stop': {
                const jobKey = `${msg.id}::${msg.script}`;
                const proc = _running.get(jobKey);
                if (proc) { try { proc.kill(); } catch { /**/ } }
                break;
            }
            case 'stop-current': {
                _running.forEach(proc => { try { proc.kill(); } catch { /**/ } });
                break;
            }
            case 'open-folder': {
                if (msg.path) {
                    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path), { forceNewWindow: true });
                }
                break;
            }
            case 'open-claude': {
                if (msg.path && fs.existsSync(msg.path)) {
                    vscode.workspace.openTextDocument(msg.path).then(doc =>
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside)
                    );
                }
                break;
            }
            case 'create-claude': {
                if (msg.path) {
                    const dest    = path.join(msg.path, 'CLAUDE.md');
                    const name    = path.basename(msg.path);
                    const today   = new Date().toISOString().slice(0, 10);
                    const content = `# CLAUDE.md \u2014 ${name}\n\n> Created: ${today}\n\n## Project Overview\n\n**Path:** ${msg.path}\n\n## Session Start Checklist\n\n- [ ] Read CLAUDE.md\n- [ ] Check CURRENT-STATUS.md\n- [ ] Review last session via recent_chats\n`;
                    fs.writeFileSync(dest, content, 'utf8');
                    vscode.workspace.openTextDocument(dest).then(doc =>
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside)
                    );
                }
                break;
            }
            case 'create-tests': {
                const projectPath = msg.path as string | undefined;
                const projectName = msg.name as string | undefined;
                if (!projectPath) { break; }
                vscode.commands.executeCommand('cvs.audit.testCoverage').then(() => {
                    void vscode.window.showInformationMessage(`Opening Test Coverage Dashboard for ${projectName || path.basename(projectPath)}.`);
                }, () => {
                    void vscode.window.showInformationMessage(`Run "Audit: Test Coverage Dashboard" to generate tests for ${projectName || path.basename(projectPath)}.`);
                });
                break;
            }
            case 'get-registry':
                postRegistryToPanel();
                break;
            case 'ready': {
                latestCards = cards;
                const folderSuffix2 = latestCards.length === 1 ? '  \u00b7  ' + latestCards[0].name : '';
                void _panel?.webview.postMessage({ type: 'init', title: 'package.json Scripts' + folderSuffix2, cards: latestCards });
                break;
            }
            case 'browse-for-scan': {
                const current = msg.current as string | undefined;
                vscode.window.showOpenDialog({
                    canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
                    openLabel: 'Select folder to scan for projects',
                    defaultUri: current ? vscode.Uri.file(current) : undefined,
                }).then(result => {
                    if (result?.[0]) { void _panel?.webview.postMessage({ command: 'set-scan-path', value: result[0].fsPath }); }
                });
                break;
            }
            case 'cfg-scan-folder': {
                const folderPath = msg.path as string | undefined;
                if (!folderPath || !fs.existsSync(folderPath)) {
                    void _panel?.webview.postMessage({ type: 'cfg-scan-results', error: `Path not found: ${folderPath || ''}`, results: [] });
                    break;
                }
                scanFolderForRegistry(folderPath).then(results => {
                    void _panel?.webview.postMessage({ type: 'cfg-scan-results', results, error: null });
                }).catch(error => {
                    void _panel?.webview.postMessage({ type: 'cfg-scan-results', error: String(error), results: [] });
                });
                break;
            }
            case 'cfg-remove-project': {
                const removePath = msg.path as string | undefined;
                if (!removePath) { break; }
                const registry = loadRegistry();
                if (!registry) { break; }
                const targetPath = normalizeFsPath(removePath);
                const beforeCount = registry.projects.length;
                registry.projects = registry.projects.filter(project => normalizeFsPath(project.path) !== targetPath);
                const removed = registry.projects.length < beforeCount;
                if (removed) {
                    saveRegistry(registry);
                }
                void _panel?.webview.postMessage({ type: 'cfg-remove-result', path: removePath, removed });
                postRegistryToPanel();
                break;
            }
            case 'cfg-add-project': {
                const addPath = msg.path as string | undefined;
                const name = msg.name as string | undefined;
                const type = msg.type as string | undefined;
                if (!addPath || !name) { break; }
                const registry = loadRegistry();
                if (!registry) { break; }
                const normalizedAddPath = normalizeFsPath(addPath);
                if (!registry.projects.some(project => normalizeFsPath(project.path) === normalizedAddPath)) {
                    registry.projects.push({ name, path: addPath, type: type || 'app', description: '' });
                    saveRegistry(registry);
                }
                postRegistryToPanel();
                break;
            }
        }
    });

    log(FEATURE, `Opened with ${cards.length} project cards`);
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    _statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    _statusBar.text    = '$(package) package.json';
    _statusBar.tooltip = 'package.json Scripts: Show and Run';
    _statusBar.command = SHOW_AND_RUN_COMMAND;
    _statusBar.show();
    context.subscriptions.push(_statusBar);
    context.subscriptions.push(
        vscode.commands.registerCommand(SHOW_AND_RUN_COMMAND, openPanel),
        vscode.commands.registerCommand(ADD_DESCRIPTION_COMMAND, openPanel),
    );
    log(FEATURE, 'activated');
}

export function deactivate(): void {
    _running.forEach(proc => { try { proc.kill(); } catch { /**/ } });
    _running.clear();
    if (_panel)       { _panel.dispose();       _panel = undefined; }
    if (_outputPanel) { _outputPanel.dispose(); _outputPanel = undefined; }
    if (_statusBar)   { _statusBar.dispose();   _statusBar = undefined; }
}
