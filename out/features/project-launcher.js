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
 * project-launcher.ts
 *
 * Launch, build, and stop any registered CieloVista project directly from
 * the CVS Cmds button — no terminal navigation required.
 *
 * Each project gets its own named commands derived from the scripts defined
 * in its package.json (or well-known dotnet commands). Commands are built
 * dynamically from the project registry so new projects appear automatically.
 *
 * Commands registered:
 *   cvs.launch.snapit.start    — start SnapIt service
 *   cvs.launch.snapit.tray     — launch SnapIt tray
 *   cvs.launch.snapit.build    — build SnapIt
 *   cvs.launch.snapit.stop     — kill SnapIt service (port 5200)
 *
 *   cvs.launch.diskcleanup.start  — start DiskCleanUp service
 *   cvs.launch.diskcleanup.build  — build DiskCleanUp
 *   cvs.launch.diskcleanup.stop   — kill DiskCleanUp (port 5100)
 *
 *   cvs.launch.pick  — quick-pick any project + action
 */
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../shared/output-channel");
const FEATURE = 'project-launcher';
const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';
// ─── Registry ─────────────────────────────────────────────────────────────────
function loadRegistry() {
    try {
        if (!fs.existsSync(REGISTRY_PATH)) {
            return undefined;
        }
        return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    }
    catch {
        return undefined;
    }
}
// ─── Action discovery ─────────────────────────────────────────────────────────
/**
 * Well-known port map — if a project uses one of these ports we offer a Stop action.
 */
const KNOWN_PORTS = {
    snapit: 5200,
    diskcleanup: 5100,
    'vscode-claude': 52100,
};
/**
 * Reads package.json scripts for a project and converts them to LaunchActions.
 * Also adds dotnet build/run for .NET projects that have no package.json.
 */
function discoverActions(project) {
    const actions = [];
    const projectKey = project.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const port = KNOWN_PORTS[projectKey];
    // Try package.json scripts first
    const pkgPath = path.join(project.path, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const scripts = pkg.scripts ?? {};
            // Priority order for display
            const priority = ['start', 'dev', 'build', 'rebuild', 'tray', 'tray:rebuild', 'test'];
            const ordered = [
                ...priority.filter(s => s in scripts),
                ...Object.keys(scripts).filter(s => !priority.includes(s)),
            ];
            for (const scriptName of ordered) {
                // Skip noisy/internal scripts
                if (/vscode:prepublish|lint|format/.test(scriptName)) {
                    continue;
                }
                const isStop = /stop|kill|down/.test(scriptName);
                const label = `${project.name}: ${scriptName}`;
                actions.push({
                    action: scriptName,
                    label,
                    command: `npm run ${scriptName}`,
                    cwd: project.path,
                    killPort: isStop ? port : undefined,
                });
            }
        }
        catch { /* skip */ }
    }
    // .NET projects — add build if no package.json actions found
    const slnFiles = fs.readdirSync(project.path).filter(f => /\.(sln|slnx)$/i.test(f));
    if (slnFiles.length && actions.length === 0) {
        const sln = slnFiles[0];
        actions.push({ action: 'build', label: `${project.name}: build`, command: `dotnet build "${sln}"`, cwd: project.path }, { action: 'rebuild', label: `${project.name}: rebuild`, command: `dotnet build "${sln}" --no-incremental`, cwd: project.path });
    }
    // Always add a Stop action if we know the port and none exists yet
    if (port && !actions.some(a => /stop|kill/.test(a.action))) {
        actions.push({
            action: 'stop',
            label: `${project.name}: stop (kill port ${port})`,
            command: `npx kill-port ${port}`,
            cwd: project.path,
            killPort: port,
        });
    }
    return actions;
}
// ─── Terminal runner ──────────────────────────────────────────────────────────
/** Runs a command in a named VS Code terminal, reusing it if already open. */
function runInTerminal(name, command, cwd) {
    // Reuse existing terminal with this name
    let terminal = vscode.window.terminals.find(t => t.name === name);
    if (!terminal) {
        terminal = vscode.window.createTerminal({ name, cwd });
    }
    else {
        // PowerShell-safe directory change (no /d flag — that's cmd.exe only)
        terminal.sendText(`cd "${cwd}"`);
    }
    terminal.show(true);
    terminal.sendText(command);
    (0, output_channel_1.log)(FEATURE, `Launched in terminal "${name}": ${command} (cwd: ${cwd})`);
}
// ─── Commands ─────────────────────────────────────────────────────────────────
/** Quick-pick any registered project then pick an action. */
async function pickAndLaunch() {
    const registry = loadRegistry();
    if (!registry?.projects.length) {
        vscode.window.showWarningMessage('No projects found in registry.');
        return;
    }
    // Build flat list: project name → actions
    const allItems = [];
    for (const project of registry.projects) {
        if (!fs.existsSync(project.path)) {
            continue;
        }
        const actions = discoverActions(project);
        for (const a of actions) {
            allItems.push({
                label: `$(play) ${a.label}`,
                description: a.cwd,
                detail: a.command,
                action: a,
            });
        }
        // Separator between projects
        allItems.push({ label: '', kind: vscode.QuickPickItemKind.Separator, action: null });
    }
    const filtered = allItems.filter(i => i.action);
    const picked = await vscode.window.showQuickPick(filtered, {
        placeHolder: 'Pick a project action to run',
        matchOnDescription: true,
        matchOnDetail: true,
    });
    if (!picked) {
        return;
    }
    runInTerminal(picked.action.label, picked.action.command, picked.action.cwd);
}
/** Register a fixed command for a specific project+action. */
function registerFixed(context, commandId, terminalName, command, cwd) {
    context.subscriptions.push(vscode.commands.registerCommand(commandId, () => {
        if (!fs.existsSync(cwd)) {
            vscode.window.showErrorMessage(`Project folder not found: ${cwd}`);
            return;
        }
        runInTerminal(terminalName, command, cwd);
    }));
}
// ─── Activate / Deactivate ────────────────────────────────────────────────────
function activate(context) {
    (0, output_channel_1.log)(FEATURE, 'Activating');
    const SNAPIT = 'C:\\Users\\jwpmi\\source\\repos\\SnapIt';
    const DISKCLEAN = 'C:\\Users\\jwpmi\\source\\repos\\DiskCleanUp';
    // ── SnapIt ────────────────────────────────────────────────────────────────
    registerFixed(context, 'cvs.launch.snapit.start', 'SnapIt Service', 'npm start', SNAPIT);
    registerFixed(context, 'cvs.launch.snapit.tray', 'SnapIt Tray', 'npm run tray', SNAPIT);
    registerFixed(context, 'cvs.launch.snapit.rebuild', 'SnapIt Tray', 'npm run tray:rebuild', SNAPIT);
    registerFixed(context, 'cvs.launch.snapit.build', 'SnapIt Build', 'npm run tray:rebuild', SNAPIT);
    registerFixed(context, 'cvs.launch.snapit.stop', 'SnapIt Stop', 'npx kill-port 5200', SNAPIT);
    // ── DiskCleanUp ───────────────────────────────────────────────────────────
    registerFixed(context, 'cvs.launch.diskcleanup.start', 'DiskCleanUp Service', 'npm start', DISKCLEAN);
    registerFixed(context, 'cvs.launch.diskcleanup.console', 'DiskCleanUp Console', 'npm run start', DISKCLEAN);
    registerFixed(context, 'cvs.launch.diskcleanup.build', 'DiskCleanUp Build', 'dotnet build DiskCleanUp.sln', DISKCLEAN);
    registerFixed(context, 'cvs.launch.diskcleanup.stop', 'DiskCleanUp Stop', 'npx kill-port 5100', DISKCLEAN);
    // ── Universal picker ──────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('cvs.launch.pick', pickAndLaunch));
}
function deactivate() { }
//# sourceMappingURL=project-launcher.js.map