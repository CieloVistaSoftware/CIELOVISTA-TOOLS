// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * registry-promote.ts
 *
 * CVT feature: register a folder as a CieloVista product.
 *
 * Command: `cvs.registry.promote` — right-click any folder in Explorer, or
 * run from the command palette against the current workspace root. Prompts
 * for name, type, and description, scaffolds CLAUDE.md + README.md if they
 * are missing, and appends an entry to project-registry.json with
 * status="product".
 *
 * Why this exists:
 *   Promotion from generated/workbench to product should be a deliberate,
 *   one-click action rather than a hand-edit of JSON. JesusFamilyTree was
 *   the motivating example — it started as createWebsite output, became a
 *   real product, and needed to land in the registry cleanly.
 *
 * This feature only writes the "product" status. Workbench/archive/demote
 * commands are not implemented yet — add them when there's a second user.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';
import { REGISTRY_PATH, loadRegistry, saveRegistry, ProjectEntry } from '../shared/registry';

const FEATURE = 'registry-promote';

const PROJECT_TYPES: readonly string[] = [
    'vscode-extension',
    'dotnet-service',
    'component-library',
    'website',
    'app',
    'library',
    'other',
];

/**
 * Returns the folder the user wants to promote.
 * Priority: explicit Explorer context URI → active workspace folder → open dialog.
 */
async function pickFolder(explicit?: vscode.Uri): Promise<vscode.Uri | undefined> {
    if (explicit) {
        try {
            const stat = await vscode.workspace.fs.stat(explicit);
            if (stat.type === vscode.FileType.Directory) { return explicit; }
        } catch { /* fall through */ }
    }

    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders && wsFolders.length === 1) {
        const pick = await vscode.window.showQuickPick(
            [
                { label: `$(folder) Use workspace root`, detail: wsFolders[0].uri.fsPath, uri: wsFolders[0].uri },
                { label: `$(folder-opened) Pick a different folder…`, detail: 'Open a folder chooser', uri: undefined as vscode.Uri | undefined },
            ],
            { placeHolder: 'Promote which folder to product?' }
        );
        if (!pick) { return undefined; }
        if (pick.uri) { return pick.uri; }
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectFiles:   false,
        canSelectFolders: true,
        canSelectMany:    false,
        openLabel:        'Promote This Folder to Product',
    });
    return picked?.[0];
}

/** Builds a minimal CLAUDE.md tailored to the new project. */
function buildClaudeMd(projectName: string, projectPath: string): string {
    return [
        `# CLAUDE.md — ${projectName}`,
        '',
        '## Session Start',
        '',
        '1. Read this file',
        '2. Read docs/_today/CURRENT-STATUS.md if it exists',
        '3. Start working — no questions',
        '',
        '## Project',
        '',
        `**Name:** ${projectName}`,
        `**Location:** ${projectPath}`,
        `**Status:** product`,
        '',
        '## Build',
        '',
        '```powershell',
        '# TODO: add build command',
        '```',
        '',
        '## Global Standards',
        '',
        'These apply to ALL CieloVista projects:',
        '',
        '| Document | Location |',
        '|---|---|',
        '| Copilot Rules | `C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\copilot-rules.md` |',
        '| JavaScript Standards | `C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\javascript_standards.md` |',
        '| Git Workflow | `C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\git_workflow.md` |',
        `| Project Registry | \`${REGISTRY_PATH}\` |`,
        '',
    ].join('\n');
}

/** Builds a minimal README.md tailored to the new project. */
function buildReadmeMd(projectName: string, type: string, description: string): string {
    const desc = description.trim() || '_Short description pending._';
    return [
        `# ${projectName}`,
        '',
        desc,
        '',
        '## Type',
        '',
        `\`${type}\``,
        '',
        '## Status',
        '',
        'Product — registered in the CieloVista project registry.',
        '',
        '## Getting Started',
        '',
        '_TODO: describe install / build / run._',
        '',
        '## License',
        '',
        'Copyright (c) 2026 CieloVista Software. All rights reserved.',
        '',
    ].join('\n');
}

/**
 * Core promotion logic. Pure enough to unit-test without vscode —
 * callers pass the folder, name, type, description, and get back a status
 * report describing what was written.
 */
export interface PromoteResult {
    ok:            boolean;
    registryEntry: ProjectEntry;
    claudeWritten: boolean;
    readmeWritten: boolean;
    alreadyInRegistry: boolean;
    message:       string;
}

export function promoteFolder(
    folderPath: string,
    name:        string,
    type:        string,
    description: string,
): PromoteResult {
    const registry = loadRegistry();
    if (!registry) {
        return {
            ok: false, claudeWritten: false, readmeWritten: false, alreadyInRegistry: false,
            registryEntry: { name, path: folderPath, type, description, status: 'product' },
            message: 'Could not load registry.',
        };
    }

    const existing = registry.projects.find(
        p => p.name.toLowerCase() === name.toLowerCase()
          || p.path.toLowerCase() === folderPath.toLowerCase()
    );
    const alreadyInRegistry = !!existing;

    const entry: ProjectEntry = existing ?? {
        name, path: folderPath, type, description, status: 'product',
    };

    if (!existing) {
        registry.projects.push(entry);
        saveRegistry(registry);
    } else if (existing.status !== 'product') {
        /* Promote an existing entry that was workbench/generated/archived. */
        existing.status = 'product';
        saveRegistry(registry);
    }

    const claudePath = path.join(folderPath, 'CLAUDE.md');
    const readmePath = path.join(folderPath, 'README.md');

    let claudeWritten = false;
    if (!fs.existsSync(claudePath)) {
        fs.writeFileSync(claudePath, buildClaudeMd(name, folderPath), 'utf8');
        claudeWritten = true;
    }

    let readmeWritten = false;
    if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(readmePath, buildReadmeMd(name, type, description), 'utf8');
        readmeWritten = true;
    }

    const bits: string[] = [];
    bits.push(alreadyInRegistry ? `Updated "${name}" to status=product` : `Registered "${name}" as product`);
    if (claudeWritten) { bits.push('created CLAUDE.md'); }
    if (readmeWritten) { bits.push('created README.md'); }
    if (!claudeWritten && !readmeWritten) { bits.push('CLAUDE.md and README.md already present'); }

    return {
        ok: true, registryEntry: entry, claudeWritten, readmeWritten, alreadyInRegistry,
        message: bits.join('; ') + '.',
    };
}

/** Explorer-context-menu / command-palette handler. */
async function promoteCommand(explicitUri?: vscode.Uri): Promise<void> {
    try {
        const folderUri = await pickFolder(explicitUri);
        if (!folderUri) { return; }
        const folderPath = folderUri.fsPath;

        const defaultName = path.basename(folderPath);
        const name = await vscode.window.showInputBox({
            prompt:       'Project name as it will appear in the registry',
            value:        defaultName,
            placeHolder:  'e.g. JesusFamilyTree, wb-starter',
            validateInput: v => v.trim() ? undefined : 'Name is required',
        });
        if (!name?.trim()) { return; }

        const typePick = await vscode.window.showQuickPick(PROJECT_TYPES as string[], {
            placeHolder: 'Project type',
        });
        if (!typePick) { return; }

        const description = await vscode.window.showInputBox({
            prompt:      'Short description (optional)',
            placeHolder: 'What does this project do?',
        });

        const result = promoteFolder(folderPath, name.trim(), typePick, description?.trim() ?? '');

        if (!result.ok) {
            vscode.window.showErrorMessage(`Promote failed: ${result.message}`);
            log(FEATURE, `Promote failed for ${folderPath}: ${result.message}`);
            return;
        }

        log(FEATURE, `Promoted ${folderPath}: ${result.message}`);
        const action = await vscode.window.showInformationMessage(
            result.message,
            'Open Registry',
            'Open Folder',
        );
        if (action === 'Open Registry') {
            const doc = await vscode.workspace.openTextDocument(REGISTRY_PATH);
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        } else if (action === 'Open Folder') {
            await vscode.commands.executeCommand('revealFileInOS', folderUri);
        }
    } catch (err) {
        const stack = err instanceof Error ? err.stack || String(err) : String(err);
        logError('promoteCommand failed', stack, FEATURE);
        vscode.window.showErrorMessage(`Promote failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/* ── Feature activation ───────────────────────────────────────────────────── */

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.registry.promote', (uri?: vscode.Uri) => {
            void promoteCommand(uri);
        }),
    );
}

export function deactivate(): void { /* nothing to clean up */ }
