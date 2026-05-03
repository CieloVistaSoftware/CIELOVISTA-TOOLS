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

const FEATURE = 'corequisite-checker';

interface CorequisiteSpec {
    minVersion?: string;
    displayName?: string;
    vsixPath?: string;
}

type Status = 'ok' | 'missing' | 'outdated' | 'unknown-version';

interface CheckResult {
    id: string;
    spec: CorequisiteSpec;
    status: Status;
    installedVersion?: string;
    message: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Numeric compare of two semver-shaped strings (no pre-release handling). */
function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(n => parseInt(n, 10) || 0);
    const pb = b.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] || 0;
        const db = pb[i] || 0;
        if (da !== db) return da - db;
    }
    return 0;
}

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

/** Check one declared peer against the live VS Code extension registry. */
function checkOne(id: string, spec: CorequisiteSpec): CheckResult {
    const ext = vscode.extensions.getExtension(id);
    if (!ext) {
        return { id, spec, status: 'missing', message: `${spec.displayName || id} is not installed` };
    }
    const installedVersion: string | undefined = ext.packageJSON?.version;
    if (!installedVersion) {
        return { id, spec, status: 'unknown-version', message: `${id} is installed but version is unreadable` };
    }
    if (spec.minVersion && compareVersions(installedVersion, spec.minVersion) < 0) {
        return {
            id, spec, status: 'outdated', installedVersion,
            message: `${spec.displayName || id} v${installedVersion} is below required v${spec.minVersion}`
        };
    }
    return {
        id, spec, status: 'ok', installedVersion,
        message: `${spec.displayName || id} v${installedVersion} OK`
    };
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
    const bin = findCodeInsidersBin();
    log(FEATURE, `Installing ${display} from ${vsix} via ${bin}`);
    try {
        const out = cp.execFileSync(bin, ['--install-extension', vsix], { stdio: 'pipe' }).toString();
        log(FEATURE, `Install output: ${out.trim()}`);
        const reload = await vscode.window.showInformationMessage(
            `Installed ${display}. Reload window to activate?`,
            'Reload', 'Later'
        );
        if (reload === 'Reload') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    } catch (err: any) {
        const msg = (err?.stderr?.toString && err.stderr.toString()) || err?.message || String(err);
        logError(`Failed to install ${display}`, err instanceof Error ? err.stack || String(err) : String(err), FEATURE, true);
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
    const results = ids.map(id => checkOne(id, requires[id]));
    for (const r of results) {
        log(FEATURE, `[${r.status.toUpperCase()}] ${r.message}`);
    }
    const problems = results.filter(r => r.status === 'missing' || r.status === 'outdated');
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
            const ok = results.filter(r => r.status === 'ok');
            const problems = results.filter(r => r.status !== 'ok');
            if (problems.length === 0) {
                const summary = ok.map(r => `${r.spec.displayName || r.id} v${r.installedVersion}`).join(', ');
                vscode.window.showInformationMessage(`All ${ok.length} corequisite extension(s) OK: ${summary}`);
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
            .catch(err => logError('Startup corequisite check failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE, false));
    }, 3000);
}

export function deactivate(): void {
    /* nothing to clean up */
}
