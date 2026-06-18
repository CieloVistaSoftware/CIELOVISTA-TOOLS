// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * corequisite-checker.ts
 *
 * Verifies that every peer extension declared in this extension's
 * `cieloRequires` block (in package.json) is installed at the required
 * minimum version. If something is missing or out of date, surfaces a
 * one-click install action that runs `code-insiders --install-extension`
 * against the configured local VSIX path.
 *
 * Schema in package.json:
 *   "cieloRequires": {
 *     "<publisher>.<extensionName>": {
 *       "minVersion":   "1.0.0",
 *       "displayName":  "Human-Readable Name",
 *       "vsixPath":     "C:\\path\\to\\extension.vsix"   // optional but recommended
 *     }
 *   }
 *
 * Commands:
 *   cvs.corequisites.check    — re-run the check on demand, showing every state
 *   cvs.corequisites.install  — auto-install/upgrade any missing/outdated peers
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { log, logError } from '../shared/output-channel';
import {
    decideStatus,
    installedVersionFromDirNames,
    type CorequisiteSpec,
    type Status,
} from '../shared/corequisite-logic';
import { buildInstallCommand } from '../shared/install-command';

const FEATURE = 'corequisite-checker';

interface CheckResult {
    id: string;
    spec: CorequisiteSpec;
    status: Status;
    installedVersion?: string;
    message: string;
}

/** A corequisite needs user action only when it is missing or outdated. */
function isProblem(status: Status): boolean {
    return status === 'missing' || status === 'outdated';
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Read the cieloRequires block from this extension's package.json. */
function readCieloRequires(extensionPath: string): Record<string, CorequisiteSpec> {
    const pkgPath = path.join(extensionPath, 'package.json');
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const block = pkg.cieloRequires;
        if (!block || typeof block !== 'object') return {};
        return block as Record<string, CorequisiteSpec>;
    } catch (err: any) {
        logError('Failed to read cieloRequires from package.json', err instanceof Error ? err.stack || String(err) : String(err), FEATURE, false);
        return {};
    }
}

/** Scan the extensions folder for an installed-on-disk version of `id`. */
function installedVersionOnDisk(id: string, extensionsDir: string): string | undefined {
    try {
        const names = fs.readdirSync(extensionsDir, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name);
        return installedVersionFromDirNames(id, names);
    } catch {
        return undefined;
    }
}

/** Human-readable status message for a checked corequisite. */
function messageFor(id: string, spec: CorequisiteSpec, status: Status, installedVersion?: string): string {
    const name = spec.displayName || id;
    switch (status) {
        case 'ok':              return `${name} v${installedVersion} OK`;
        case 'pending-reload':  return `${name} v${installedVersion} installed — reload window to activate`;
        case 'outdated':        return `${name} v${installedVersion} is below required v${spec.minVersion}`;
        case 'unknown-version': return `${id} is installed but version is unreadable`;
        case 'missing':         return `${name} is not installed`;
    }
}

/**
 * Check one declared peer. The live registry is authoritative, but a freshly
 * installed extension is not visible there until the window reloads (#602), so
 * fall back to an on-disk scan and report `pending-reload` instead of `missing`.
 */
function checkOne(id: string, spec: CorequisiteSpec, extensionsDir: string): CheckResult {
    const ext = vscode.extensions.getExtension(id);
    const registryPresent = !!ext;
    const registryVersion: string | undefined = ext?.packageJSON?.version;
    const diskVersion = registryPresent ? undefined : installedVersionOnDisk(id, extensionsDir);

    const { status, installedVersion } = decideStatus({ spec, registryPresent, registryVersion, diskVersion });
    return { id, spec, status, installedVersion, message: messageFor(id, spec, status, installedVersion) };
}

/** Locate code-insiders.cmd on disk; falls back to PATH lookup. */
function findCodeInsidersBin(): string {
    const candidates = [
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'),
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'),
    ].filter(Boolean) as string[];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return 'code-insiders';
}

function installViaCli(bin: string, vsix: string): string {
    // A .cmd/.bat shim must run through a shell, but shell:true does NOT
    // auto-quote — an unquoted binary path with spaces (the real
    // code-insiders.cmd lives under "Microsoft VS Code Insiders") is split by
    // cmd.exe and fails with "'...\Microsoft' is not recognized" (#592).
    // buildInstallCommand emits a fully-quoted command line in that case.
    const { command, args, shell } = buildInstallCommand(bin, vsix);
    const result = cp.spawnSync(command, args, {
            encoding: 'utf8',
            windowsHide: true,
            shell,
        });

    if (result.error) {
        throw result.error;
    }
    if (typeof result.status === 'number' && result.status !== 0) {
        const detail = (result.stderr || result.stdout || `exit ${result.status}`).trim();
        throw new Error(detail || `code-insiders returned exit code ${result.status}`);
    }
    return (result.stdout || '').trim();
}

/** Show the user a notification offering to install/upgrade a peer. */
async function offerInstall(result: CheckResult): Promise<void> {
    const verb = result.status === 'missing' ? 'Install' : 'Upgrade';
    const display = result.spec.displayName || result.id;
    const action = await vscode.window.showWarningMessage(
        `Cielo corequisite — ${result.message}.`,
        verb,
        'Skip'
    );
    if (action === verb) {
        await runInstall(result, /*silent*/ false);
    }
}

/** Run code-insiders --install-extension against the configured VSIX path. */
async function runInstall(result: CheckResult, silent: boolean): Promise<void> {
    const display = result.spec.displayName || result.id;
    const vsix = result.spec.vsixPath;
    if (!vsix) {
        const msg = `No vsixPath set for ${display} — install manually via Marketplace or the VS Code "Install from VSIX..." command.`;
        if (!silent) vscode.window.showErrorMessage(msg);
        log(FEATURE, msg);
        return;
    }
    if (!fs.existsSync(vsix)) {
        const msg = `VSIX not found at ${vsix} — build it first or update cieloRequires.vsixPath.`;
        if (!silent) vscode.window.showErrorMessage(msg);
        log(FEATURE, msg);
        return;
    }
    try {
        log(FEATURE, `Installing ${display} from ${vsix} via VS Code command`);
        await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(vsix));
        log(FEATURE, `Install completed for ${display} via VS Code command`);

        const reload = await vscode.window.showInformationMessage(
            `Installed ${display}. Reload window to activate?`,
            'Reload', 'Later'
        );
        if (reload === 'Reload') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    } catch (err: any) {
        log(FEATURE, `VS Code command install failed for ${display}; falling back to CLI. ${err instanceof Error ? err.message : String(err)}`);

        const bin = findCodeInsidersBin();
        log(FEATURE, `Installing ${display} from ${vsix} via ${bin}`);
        try {
            const out = installViaCli(bin, vsix);
            if (out) {
                log(FEATURE, `Install output: ${out}`);
            }

            const reload = await vscode.window.showInformationMessage(
                `Installed ${display}. Reload window to activate?`,
                'Reload', 'Later'
            );
            if (reload === 'Reload') {
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        } catch (fallbackErr: any) {
            logError(
                `Failed to install ${display}`,
                fallbackErr instanceof Error ? fallbackErr.stack || String(fallbackErr) : String(fallbackErr),
                FEATURE,
                true
            );
        }
    }
}

/** Check every declared peer and (optionally) prompt to fix problems. */
async function runCheck(
    extensionPath: string,
    options: { autoInstall?: boolean; silentIfClean?: boolean }
): Promise<CheckResult[]> {
    const requires = readCieloRequires(extensionPath);
    const ids = Object.keys(requires);
    if (ids.length === 0) {
        log(FEATURE, 'No cieloRequires entries — nothing to check.');
        return [];
    }
    // The extensions folder is this extension's own parent directory — robust
    // across stable/insiders without hardcoding a profile path.
    const extensionsDir = path.dirname(extensionPath);
    const results = ids.map(id => checkOne(id, requires[id], extensionsDir));
    for (const r of results) {
        log(FEATURE, `[${r.status.toUpperCase()}] ${r.message}`);
    }
    const problems = results.filter(r => isProblem(r.status));
    if (problems.length === 0 && options.silentIfClean) return results;

    if (options.autoInstall) {
        for (const r of problems) await runInstall(r, /*silent*/ false);
    } else {
        // Stagger toasts so they don't stack invisibly
        for (const r of problems) await offerInstall(r);
    }
    return results;
}

// ─── Activate / Deactivate ───────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Corequisite checker activated');

    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.corequisites.check', async () => {
            const results = await runCheck(context.extensionPath, { autoInstall: false, silentIfClean: false });
            if (results.length === 0) {
                vscode.window.showInformationMessage('No corequisites declared in package.json.');
                return;
            }
            const fine = results.filter(r => r.status === 'ok' || r.status === 'pending-reload');
            const problems = results.filter(r => isProblem(r.status));
            if (problems.length === 0) {
                const summary = fine.map(r => `${r.spec.displayName || r.id} v${r.installedVersion}${r.status === 'pending-reload' ? ' (reload to activate)' : ''}`).join(', ');
                vscode.window.showInformationMessage(`All ${fine.length} corequisite extension(s) OK: ${summary}`);
            }
        }),
        vscode.commands.registerCommand('cvs.corequisites.install', async () => {
            await runCheck(context.extensionPath, { autoInstall: true, silentIfClean: false });
        })
    );

    // Background check on startup so a missing peer surfaces once per session.
    // 3-second delay keeps the activation phase clean.
    setTimeout(() => {
        runCheck(context.extensionPath, { autoInstall: false, silentIfClean: true })
            .catch(err => {
                // VS Code fires Canceled when the window reloads or shuts down while
                // this check is in-flight. That is normal lifecycle noise, not an error.
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('Canceled') || msg.includes('cancelled')) { return; }
                logError('Startup corequisite check failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE, false);
            });
    }, 3000);
}

export function deactivate(): void {
    /* nothing to clean up */
}
