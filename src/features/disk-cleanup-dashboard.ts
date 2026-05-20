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
const PORT_FILE = path.join(DATA_DIR, 'dashboard-port.txt');

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.diskcleanup.openDashboard', openDashboard)
    );
}

export function deactivate(): void { /* nothing to clean up */ }

async function openDashboard(): Promise<void> {
    // If --serve is already running and healthy, just open the existing URL.
    if (fs.existsSync(PORT_FILE)) {
        const raw = fs.readFileSync(PORT_FILE, 'utf8').trim();
        const port = parseInt(raw, 10);
        if (!isNaN(port) && port > 0 && await isAlive(port)) {
            log(FEATURE, `Dashboard already running on port ${port} — opening browser.`);
            await vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${port}`));
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

    // --serve auto-opens the browser and writes PORT_FILE. We detach so VS Code
    // doesn't wait for it and the dashboard lives beyond this extension session.
    const child = spawn(exePath, ['--serve'], {
        detached: true,
        stdio:    'ignore',
        cwd:      path.dirname(exePath),
    });
    child.unref();
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
