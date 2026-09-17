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
import * as os from 'os';
import * as path from 'path';
import { log, logError } from '../shared/output-channel';
import { REGISTRY_PATH, loadRegistry, type ProjectEntry } from '../shared/registry';
// #696 -- one implementation of promotion, shared with the MCP tool. It lives
// under mcp-server/src/ because mcp-server's tsconfig rootDir is ./src and
// widening it would relocate dist/index.js, which several things name by path.
import {
    promoteFolder as promoteFolderCore,
    demoteFolder as demoteFolderCore,
    archiveFolder as archiveFolderCore,
    type PromoteResult,
} from '../../mcp-server/src/shared/registry-promote-core';

const FEATURE = 'registry-promote';
const GLOBAL_DOCS_DIR = path.join(os.homedir(), 'Downloads', 'CieloVistaStandards');

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
 * Returns a folder from the registry that the user selects.
 * Used for demote/archive operations.
 */
async function pickFolderFromRegistry(action: 'demote' | 'archive'): Promise<{ folder: ProjectEntry; original: vscode.Uri } | undefined> {
    const registry = loadRegistry();
    if (!registry || registry.projects.length === 0) {
        vscode.window.showWarningMessage('No projects in the registry');
        return undefined;
    }

    const picks = registry.projects.map(p => ({
        label: `$(folder) ${p.name}`,
        detail: `${p.path} [${p.status}]`,
        project: p,
    }));

    const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: `Select a project to ${action}`,
    });

    return pick ? { folder: pick.project, original: vscode.Uri.file(pick.project.path) } : undefined;
}

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
        '2. Read docs/status/current-status.md if it exists',
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
        `| Copilot Rules | \`${path.join(GLOBAL_DOCS_DIR, 'copilot-rules.md')}\` |`,
        `| JavaScript Standards | \`${path.join(GLOBAL_DOCS_DIR, 'javascript_standards.md')}\` |`,
        `| Git Workflow | \`${path.join(GLOBAL_DOCS_DIR, 'git_workflow.md')}\` |`,
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
 * Promotion, demotion and archiving now live in
 * mcp-server/src/shared/registry-promote-core.ts, so the MCP tool and this
 * command cannot drift apart (#696). Before that, an agent could read the
 * registry through five MCP tools and write to it through none, and
 * registering a project meant hand-editing project-registry.json and then
 * re-deriving CLAUDE.md and README.md from code that already knew how.
 *
 * Re-exported here so existing importers and the unit tests keep working.
 */
export type { PromoteResult };

export function promoteFolder(
    folderPath: string,
    name:        string,
    type:        string,
    description: string,
): PromoteResult {
    return promoteFolderCore(folderPath, name, type, description);
}

/** Change a project's status to 'workbench' (demote from product). */
export function demoteFolder(name: string): { ok: boolean; message: string } {
    return demoteFolderCore(name);
}

/** Change a project's status to 'archived' (archive). */
export function archiveFolder(name: string): { ok: boolean; message: string } {
    return archiveFolderCore(name);
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
        logError('promoteCommand failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        vscode.window.showErrorMessage(`Promote failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** Demote a project from product to workbench. */
async function demoteCommand(): Promise<void> {
    try {
        const pick = await pickFolderFromRegistry('demote');
        if (!pick) { return; }

        const confirm = await vscode.window.showWarningMessage(
            `Demote "${pick.folder.name}" to workbench? This project will be removed from the active product list.`,
            { modal: true },
            'Demote',
            'Cancel'
        );
        if (confirm !== 'Demote') { return; }

        const result = demoteFolder(pick.folder.name);
        if (result.ok) {
            log(FEATURE, result.message);
            vscode.window.showInformationMessage(result.message);
        } else {
            vscode.window.showErrorMessage(`Demote failed: ${result.message}`);
            log(FEATURE, result.message);
        }
    } catch (err) {
        logError('demoteCommand failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        vscode.window.showErrorMessage(`Demote failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** Archive a project. */
async function archiveCommand(): Promise<void> {
    try {
        const pick = await pickFolderFromRegistry('archive');
        if (!pick) { return; }

        const confirm = await vscode.window.showWarningMessage(
            `Archive "${pick.folder.name}"? This project will be marked as archived.`,
            { modal: true },
            'Archive',
            'Cancel'
        );
        if (confirm !== 'Archive') { return; }

        const result = archiveFolder(pick.folder.name);
        if (result.ok) {
            log(FEATURE, result.message);
            vscode.window.showInformationMessage(result.message);
        } else {
            vscode.window.showErrorMessage(`Archive failed: ${result.message}`);
            log(FEATURE, result.message);
        }
    } catch (err) {
        logError('archiveCommand failed', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        vscode.window.showErrorMessage(`Archive failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/* ── Feature activation ───────────────────────────────────────────────────── */

export function activate(context: vscode.ExtensionContext): void {
    log(FEATURE, 'Activating');
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.registry.promote', (uri?: vscode.Uri) => {
            void promoteCommand(uri);
        }),
        vscode.commands.registerCommand('cvs.registry.demote', () => {
            void demoteCommand();
        }),
        vscode.commands.registerCommand('cvs.registry.archive', () => {
            void archiveCommand();
        }),
    );
}

export function deactivate(): void { /* nothing to clean up */ }
