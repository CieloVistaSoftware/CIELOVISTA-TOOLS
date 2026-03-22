"use strict";
// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
/**
 * npm-command-launcher.ts
 *
 * Adds a bottom status bar button that shows all npm scripts discovered
 * from package.json files in the current workspace, then runs the selected
 * script immediately in a terminal.
 *
 * Commands registered:
 *   cvs.npm.showAndRunScripts — show npm scripts picker and run selection
 *   cvs.npm.addScriptDescription — add/edit/remove custom script descriptions
 */
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const terminal_utils_1 = require("../shared/terminal-utils");
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'npm-command-launcher';
const SHOW_AND_RUN_COMMAND = 'cvs.npm.showAndRunScripts';
const ADD_DESCRIPTION_COMMAND = 'cvs.npm.addScriptDescription';
const CFG_ROOT = 'cielovistaTools';
const CFG_DESCRIPTIONS_KEY = 'npmScriptDescriptions';
let _statusBar;
/**
 * Parses `scripts` object from package.json text safely.
 */
function parseScriptsFromPackageJson(rawText) {
    const parsed = JSON.parse(rawText);
    const scripts = parsed.scripts;
    if (!scripts || typeof scripts !== 'object') {
        return {};
    }
    const result = {};
    for (const [key, value] of Object.entries(scripts)) {
        if (typeof value === 'string') {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Builds a stable key for each script so custom descriptions can be saved
 * and later matched even after VS Code restarts.
 */
function makeDescriptionKey(entry) {
    const relativePackagePath = vscode.workspace.asRelativePath(entry.packageJsonPath);
    return `${relativePackagePath}::${entry.scriptName}`;
}
/**
 * Reads the persisted npm script description map from extension settings.
 */
function getDescriptionMap() {
    const raw = vscode.workspace.getConfiguration(CFG_ROOT).get(CFG_DESCRIPTIONS_KEY, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {};
    }
    const map = {};
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') {
            map[key] = value;
        }
    }
    return map;
}
/**
 * Writes the updated npm script description map back to workspace settings.
 */
async function saveDescriptionMap(map) {
    await vscode.workspace.getConfiguration(CFG_ROOT).update(CFG_DESCRIPTIONS_KEY, map, vscode.ConfigurationTarget.Workspace);
}
/**
 * Resolves a user-defined description for a script entry, if one exists.
 */
function getCustomDescription(entry, map) {
    const key = makeDescriptionKey(entry);
    const value = map[key]?.trim();
    return value || undefined;
}
/**
 * Discovers all package.json files in workspace excluding node_modules and
 * extracts npm scripts from each one.
 */
async function collectWorkspaceNpmScripts() {
    const packageFiles = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**');
    const entries = [];
    const seen = new Set();
    for (const file of packageFiles) {
        try {
            const doc = await vscode.workspace.openTextDocument(file);
            const scripts = parseScriptsFromPackageJson(doc.getText());
            for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
                // Deduplicate by package path + script name in case multiple scans
                // surface the same package file through overlapping workspace roots.
                const uniqueKey = `${file.fsPath}::${scriptName}`;
                if (seen.has(uniqueKey)) {
                    continue;
                }
                seen.add(uniqueKey);
                entries.push({
                    packageDir: path.dirname(file.fsPath),
                    packageJsonPath: file.fsPath,
                    scriptName,
                    scriptCommand,
                });
            }
        }
        catch (error) {
            (0, output_channel_1.logError)(FEATURE, `Failed to parse package.json: ${file.fsPath}`, error);
        }
    }
    return entries;
}
/**
 * Creates quick pick items from discovered scripts. Includes script source
 * path so users can distinguish scripts across monorepos.
 */
function toQuickPickItems(entries) {
    const descriptionMap = getDescriptionMap();
    // Determine the active local folder — open editor file's folder,
    // falling back to the first workspace folder root.
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const localRoot = activeFile
        ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(activeFile))?.uri.fsPath
        : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const mapped = entries
        .map(entry => {
        const relativePath = vscode.workspace.asRelativePath(entry.packageJsonPath);
        const customDesc = getCustomDescription(entry, descriptionMap);
        const isLocal = !!localRoot && entry.packageDir.toLowerCase().startsWith(localRoot.toLowerCase());
        // Label: just the script name — bold, no repetitive "npm run" prefix
        // Description: custom description if set, otherwise the raw command (truncated)
        const rawCmd = entry.scriptCommand.length > 80
            ? entry.scriptCommand.slice(0, 77) + '…'
            : entry.scriptCommand;
        const description = customDesc ?? rawCmd;
        // Detail: only shown for non-local entries so user knows which project
        const detail = isLocal ? undefined : `$(folder) ${relativePath}`;
        const folderPrefix = path.basename(entry.packageDir);
        return {
            label: `$(play) ${folderPrefix}.${entry.scriptName}`,
            description,
            detail,
            data: entry,
            _isLocal: isLocal,
        };
    })
        .sort((a, b) => {
        if (a._isLocal !== b._isLocal) {
            return a._isLocal ? -1 : 1;
        }
        return a.label.localeCompare(b.label);
    });
    // Build final list with section separators
    const result = [];
    let addedLocalSep = false;
    let addedOtherSep = false;
    for (const item of mapped) {
        if (item._isLocal && !addedLocalSep) {
            const folderName = localRoot ? path.basename(localRoot) : 'Current Folder';
            result.push({ label: `$(folder-active) ${folderName}`, kind: vscode.QuickPickItemKind.Separator, data: undefined });
            addedLocalSep = true;
        }
        else if (!item._isLocal && !addedOtherSep) {
            result.push({ label: '$(files) Other Projects', kind: vscode.QuickPickItemKind.Separator, data: undefined });
            addedOtherSep = true;
        }
        result.push(item);
    }
    return result;
}
/**
 * Converts scripts to picker items specifically for description editing.
 */
function toDescriptionEditItems(entries) {
    const descriptionMap = getDescriptionMap();
    return entries
        .map(entry => {
        const relativePath = vscode.workspace.asRelativePath(entry.packageJsonPath);
        const customDescription = getCustomDescription(entry, descriptionMap) ?? 'No description set';
        return {
            label: `$(edit) ${entry.scriptName}`,
            description: customDescription,
            detail: relativePath,
            data: entry,
        };
    })
        .sort((a, b) => a.label.localeCompare(b.label));
}
/**
 * Runs a selected npm script in terminal and ensures the command executes
 * from the package's own folder.
 */
function runNpmScript(entry) {
    const terminal = (0, terminal_utils_1.getActiveOrCreateTerminal)('CieloVista NPM');
    terminal.show();
    // Change into the package directory first so npm resolves local scripts correctly.
    terminal.sendText(`cd "${entry.packageDir}"`);
    terminal.sendText(`npm run ${entry.scriptName}`);
    (0, output_channel_1.log)(FEATURE, `Executed npm script: ${entry.scriptName} @ ${entry.packageDir}`);
}
// ── Webview panel (replaces quick pick) ──────────────────────────────────
let _panel;
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function buildNpmWebviewHtml(entries, localRoot) {
    const descriptionMap = getDescriptionMap();
    // Group entries by folder
    const byFolder = new Map();
    for (const entry of entries) {
        const folder = path.basename(entry.packageDir);
        if (!byFolder.has(folder)) {
            byFolder.set(folder, []);
        }
        byFolder.get(folder).push(entry);
    }
    // Sort folders: local first, then alphabetical
    const localFolderName = localRoot ? path.basename(localRoot) : '';
    const sortedFolders = [...byFolder.keys()].sort((a, b) => {
        if (a === localFolderName) {
            return -1;
        }
        if (b === localFolderName) {
            return 1;
        }
        return a.localeCompare(b);
    });
    // Build JSON payload for the webview JS
    const allScripts = entries.map(e => ({
        id: `${e.packageDir}::${e.scriptName}`,
        folder: path.basename(e.packageDir),
        scriptName: e.scriptName,
        command: e.scriptCommand,
        description: getCustomDescription(e, descriptionMap) ?? '',
        isLocal: !!localRoot && e.packageDir.toLowerCase().startsWith(localRoot.toLowerCase()),
    }));
    const sectionsHtml = sortedFolders.map(folder => {
        const folderEntries = byFolder.get(folder).sort((a, b) => a.scriptName.localeCompare(b.scriptName));
        const isLocal = folder === localFolderName;
        const cards = folderEntries.map(e => {
            const desc = getCustomDescription(e, descriptionMap);
            const rawCmd = e.scriptCommand.length > 120 ? e.scriptCommand.slice(0, 117) + '\u2026' : e.scriptCommand;
            const id = `${esc(e.packageDir)}::${esc(e.scriptName)}`;
            return `<div class="script-card" data-id="${esc(e.packageDir + '::' + e.scriptName)}" data-folder="${esc(folder)}" data-name="${esc(e.scriptName)}" data-cmd="${esc(e.scriptCommand)}">
  <div class="card-name">${esc(folder)}<span class="card-sep">.</span>${esc(e.scriptName)}</div>
  <div class="card-cmd">${esc(rawCmd)}</div>
  ${desc ? `<div class="card-desc">${esc(desc)}</div>` : ''}
  <button class="run-btn" data-action="run" data-id="${esc(e.packageDir + '::' + e.scriptName)}">&#9654; Run</button>
</div>`;
        }).join('');
        return `<section class="folder-section" data-folder="${esc(folder)}">
  <h2 class="folder-heading">${isLocal ? '&#128193;' : '&#128194;'} ${esc(folder)} <span class="folder-count">${folderEntries.length}</span></h2>
  <div class="card-grid">${cards}</div>
</section>`;
    }).join('');
    const totalScripts = entries.length;
    const scriptsJson = JSON.stringify(allScripts);
    const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#toolbar{position:sticky;top:0;z-index:50;background:var(--vscode-editor-background);border-bottom:1px solid var(--vscode-panel-border);padding:10px 16px;display:flex;align-items:center;gap:8px}
#toolbar h1{font-size:1.05em;font-weight:700;white-space:nowrap;flex-shrink:0}
#search{flex:1;padding:6px 10px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;font-size:13px}
#search:focus{outline:1px solid var(--vscode-focusBorder)}
#stat{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
#content{padding:12px 16px 40px}
.folder-section{margin-bottom:22px}
.folder-section.hidden{display:none}
.folder-heading{font-size:0.9em;font-weight:700;border-bottom:2px solid var(--vscode-focusBorder);padding-bottom:5px;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.folder-count{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:10px;padding:1px 7px;font-size:0.8em;font-weight:400}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:7px}
.script-card{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:9px 11px;display:flex;flex-direction:column;gap:5px;transition:border-color 0.1s}
.script-card:hover{border-color:var(--vscode-focusBorder)}
.script-card.hidden{display:none}
.card-name{font-weight:700;font-size:0.88em}.card-sep{color:var(--vscode-descriptionForeground);margin:0 1px}
.card-cmd{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;color:var(--vscode-descriptionForeground);word-break:break-all;line-height:1.4}
.card-desc{font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.4}
.run-btn{align-self:flex-start;margin-top:2px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:4px 12px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600}
.run-btn:hover{background:var(--vscode-button-hoverBackground)}
#empty{padding:40px;text-align:center;color:var(--vscode-descriptionForeground);display:none}
#empty.visible{display:block}
#status{position:fixed;bottom:0;left:0;right:0;padding:6px 16px;font-size:12px;background:var(--vscode-statusBar-background);color:var(--vscode-statusBar-foreground);display:none;align-items:center;gap:8px;border-top:1px solid var(--vscode-panel-border);z-index:100}
#status.visible{display:flex}
.spin{display:inline-block;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}`;
    const JS = `
(function(){
'use strict';
const vscode  = acquireVsCodeApi();
const SCRIPTS = ${scriptsJson};
const TOTAL   = ${totalScripts};
const searchEl = document.getElementById('search');
const statEl   = document.getElementById('stat');
const emptyEl  = document.getElementById('empty');
const statusEl = document.getElementById('status');
const statusTx = document.getElementById('status-text');

searchEl.addEventListener('input', applyFilter);
searchEl.focus();

function applyFilter() {
  var q = searchEl.value.toLowerCase().trim();
  var visible = 0;
  document.querySelectorAll('.script-card').forEach(function(card) {
    var name = (card.dataset.name || '').toLowerCase();
    var cmd  = (card.dataset.cmd  || '').toLowerCase();
    var fld  = (card.dataset.folder || '').toLowerCase();
    var show = !q || name.includes(q) || cmd.includes(q) || fld.includes(q);
    card.classList.toggle('hidden', !show);
    if (show) visible++;
  });
  document.querySelectorAll('.folder-section').forEach(function(sec) {
    sec.classList.toggle('hidden', !sec.querySelector('.script-card:not(.hidden)'));
  });
  emptyEl.classList.toggle('visible', visible === 0);
  statEl.textContent = visible === TOTAL ? TOTAL + ' scripts' : visible + ' of ' + TOTAL;
}

document.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action="run"]');
  if (!btn) return;
  var id = btn.dataset.id;
  var script = SCRIPTS.find(function(s) { return s.folder + '::' + s.scriptName === id.split('::').slice(-2).join('::') || (s.folder + '::' + s.scriptName) === id.replace(/^.*[\\/]([^\\/]+)::/, '$1::'); });
  // Find by full id match
  var found = SCRIPTS.find(function(s) { return s.id === id; });
  var label = found ? found.folder + '.' + found.scriptName : id;
  btn.textContent = '\u23f3';
  btn.disabled = true;
  statusTx.textContent = '\u25b6 Running: npm run ' + (found ? found.scriptName : id);
  statusEl.classList.add('visible');
  setTimeout(function() { statusEl.classList.remove('visible'); btn.textContent = '\u25b6 Run'; btn.disabled = false; }, 15000);
  vscode.postMessage({ command: 'run', id: id });
});

window.addEventListener('message', function(e) {
  var m = e.data;
  if (m.type === 'done')  { statusTx.textContent = '\u2705 Done: npm run ' + (m.script||''); setTimeout(function(){ statusEl.classList.remove('visible'); }, 3000); }
  if (m.type === 'error') { statusTx.textContent = '\u274c Failed: ' + (m.error||''); setTimeout(function(){ statusEl.classList.remove('visible'); }, 5000); }
  if (m.type === 'reset-btn') {
    var b = document.querySelector('[data-action="run"][data-id="' + m.id + '"]');
    if (b) { b.textContent = '\u25b6 Run'; b.disabled = false; }
  }
});

})();`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
<div id="toolbar">
  <h1>&#128230; NPM Scripts</h1>
  <input id="search" type="text" placeholder="Search scripts, commands, folders\u2026" autocomplete="off">
  <span id="stat">${totalScripts} scripts</span>
</div>
<div id="content">
  ${sectionsHtml}
  <div id="empty">No scripts match your search.</div>
</div>
<div id="status"><span class="spin">&#9696;</span><span id="status-text"></span></div>
<script>${JS}</script>
</body></html>`;
}
/**
 * Opens a webview panel showing all npm scripts grouped by folder.
 * Clicking Run executes the script in a terminal.
 */
async function showAndRunNpmScripts() {
    if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showWarningMessage('Open a workspace folder first to run npm scripts.');
        return;
    }
    const entries = await collectWorkspaceNpmScripts();
    if (!entries.length) {
        vscode.window.showWarningMessage('No npm scripts found in workspace package.json files.');
        return;
    }
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const localRoot = activeFile
        ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(activeFile))?.uri.fsPath
        : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const html = buildNpmWebviewHtml(entries, localRoot);
    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal(vscode.ViewColumn.One, true);
    }
    else {
        _panel = vscode.window.createWebviewPanel('npmScripts', '\u{1F4E6} NPM Scripts', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }
    _panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command !== 'run') {
            return;
        }
        // msg.id = "<packageDir>::<scriptName>"
        const parts = msg.id.split('::');
        const scriptName = parts[parts.length - 1];
        const packageDir = parts.slice(0, -1).join('::');
        const entry = entries.find(e => e.packageDir === packageDir && e.scriptName === scriptName);
        if (!entry) {
            _panel?.webview.postMessage({ type: 'error', error: `Script not found: ${msg.id}` });
            return;
        }
        try {
            runNpmScript(entry);
            _panel?.webview.postMessage({ type: 'done', script: `${path.basename(entry.packageDir)}.${entry.scriptName}` });
        }
        catch (err) {
            (0, output_channel_1.logError)(FEATURE, `Failed to run ${entry.scriptName}`, err);
            _panel?.webview.postMessage({ type: 'error', error: String(err) });
        }
        _panel?.webview.postMessage({ type: 'reset-btn', id: msg.id });
    });
    (0, output_channel_1.log)(FEATURE, `NPM Scripts panel opened — ${entries.length} scripts`);
}
/**
 * Opens a picker for scripts, then prompts for a custom description.
 *
 * Behavior:
 * - Non-empty input saves or updates description
 * - Empty input removes existing description
 */
async function addOrEditScriptDescription() {
    if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showWarningMessage('Open a workspace folder first to manage npm script descriptions.');
        return;
    }
    const entries = await collectWorkspaceNpmScripts();
    if (!entries.length) {
        vscode.window.showWarningMessage('No npm scripts found in workspace package.json files.');
        return;
    }
    const picked = await vscode.window.showQuickPick(toDescriptionEditItems(entries), {
        placeHolder: 'Select npm script to add/edit description',
        matchOnDescription: true,
        matchOnDetail: true,
    });
    if (!picked) {
        return;
    }
    const descriptionMap = getDescriptionMap();
    const key = makeDescriptionKey(picked.data);
    const currentDescription = descriptionMap[key] ?? '';
    const input = await vscode.window.showInputBox({
        prompt: `Description for "npm run ${picked.data.scriptName}" (leave empty to remove)`,
        value: currentDescription,
        placeHolder: 'Example: Builds production bundles and type-checks',
    });
    if (input === undefined) {
        return;
    }
    const trimmed = input.trim();
    if (!trimmed) {
        delete descriptionMap[key];
        await saveDescriptionMap(descriptionMap);
        require('../shared/show-result-webview').showResultWebview('NPM Script Description Removed', `Remove Description: npm run ${picked.data.scriptName}`, 0, `Removed description for <b>npm run ${picked.data.scriptName}</b>`);
        (0, output_channel_1.log)(FEATURE, `Removed description: ${key}`);
        return;
    }
    descriptionMap[key] = trimmed;
    await saveDescriptionMap(descriptionMap);
    require('../shared/show-result-webview').showResultWebview('NPM Script Description Saved', `Save Description: npm run ${picked.data.scriptName}`, 0, `Saved description for <b>npm run ${picked.data.scriptName}</b>`);
    (0, output_channel_1.log)(FEATURE, `Saved description: ${key}`);
}
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    // Defensively dispose any previously created status bar item before creating
    // a new one. This avoids duplicate right-click entries if activation runs
    // more than once in the same extension host lifecycle.
    _statusBar?.dispose();
    _statusBar = undefined;
    context.subscriptions.push(vscode.commands.registerCommand(SHOW_AND_RUN_COMMAND, showAndRunNpmScripts), vscode.commands.registerCommand(ADD_DESCRIPTION_COMMAND, addOrEditScriptDescription));
    // Provide a stable id so VS Code can track this item consistently in UI
    // surfaces (including right-click visibility controls).
    _statusBar = vscode.window.createStatusBarItem('cielovista.npmCmds', vscode.StatusBarAlignment.Left, 101);
    _statusBar.name = 'CieloVista NPM Commands';
    _statusBar.text = '$(package) NPM Cmds';
    _statusBar.tooltip = 'Show all npm scripts in workspace and run selected script';
    _statusBar.command = SHOW_AND_RUN_COMMAND;
    _statusBar.show();
    context.subscriptions.push(_statusBar);
}
function deactivate() {
    _statusBar?.dispose();
    _statusBar = undefined;
}
//# sourceMappingURL=npm-command-launcher.js.map