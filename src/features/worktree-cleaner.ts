// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * worktree-cleaner.ts
 *
 * Lists and removes stale Claude worktrees (.claude/worktrees/*).
 * Each Claude Code session creates a git worktree; this command finds
 * them, shows their merge status, and lets the user prune the ones
 * that are no longer active.
 *
 * Command: cvs.tools.cleanWorktrees
 */

import * as vscode from 'vscode';
import { execFile }  from 'child_process';
import * as path     from 'path';
import { log }       from '../shared/output-channel';

const FEATURE = 'worktree-cleaner';

interface WorktreeInfo {
    worktreePath: string;
    branch:       string;
    commit:       string;
    isMerged:     boolean;
    isDirty:      boolean; // uncommitted changes in working tree
    isActive:     boolean; // current working worktree
}

const RUN_TIMEOUT_MS = 10_000;

function run(cmd: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = execFile(cmd, args, { cwd, shell: true, encoding: 'utf8' }, (err, stdout, stderr) => {
            if (err) { reject(new Error(stderr || err.message)); return; }
            resolve(stdout.trim());
        });
        setTimeout(() => {
            proc.kill();
            reject(new Error(`Command timed out after ${RUN_TIMEOUT_MS}ms: ${cmd} ${args.join(' ')}`));
        }, RUN_TIMEOUT_MS);
    });
}

async function listClaudeWorktrees(root: string): Promise<WorktreeInfo[]> {
    const raw = await run('git', ['worktree', 'list', '--porcelain'], root);
    const blocks = raw.split('\n\n').filter(Boolean);

    const results: WorktreeInfo[] = [];
    for (const block of blocks) {
        const lines = block.split('\n');
        const wtPath  = (lines.find(l => l.startsWith('worktree '))  ?? '').replace('worktree ', '');
        const branch  = (lines.find(l => l.startsWith('branch '))    ?? '').replace('branch refs/heads/', '');
        const commit  = (lines.find(l => l.startsWith('HEAD '))      ?? '').replace('HEAD ', '').slice(0, 8);

        if (!branch.startsWith('claude/')) { continue; }

        // Check if branch is merged into main
        let isMerged = false;
        try {
            const merged = await run('git', ['branch', '--merged', 'main', branch], root);
            isMerged = merged.split('\n').some(b => b.trim().replace(/^\*\s*/, '') === branch);
        } catch { /* branch may not exist locally */ }

        // Check for uncommitted changes in the worktree
        let isDirty = false;
        try {
            const status = await run('git', ['status', '--porcelain'], wtPath);
            isDirty = status.length > 0;
        } catch { /* worktree may be gone */ }

        results.push({ worktreePath: wtPath, branch, commit, isMerged, isDirty, isActive: false });
    }
    return results;
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tools.cleanWorktrees', () => cleanWorktrees(context))
    );
}

export function deactivate(): void { /* nothing */ }

async function cleanWorktrees(_context: vscode.ExtensionContext): Promise<void> {
    // Use workspace root — extension install path is not a git repo
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
        void vscode.window.showWarningMessage('Clean Worktrees: no workspace folder open.');
        return;
    }
    log(FEATURE, `Listing Claude worktrees in: ${root}`);

    let worktrees: WorktreeInfo[];
    try {
        worktrees = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Scanning Claude worktrees…',
            cancellable: false,
        }, () => listClaudeWorktrees(root));
    } catch (err: unknown) {
        void vscode.window.showErrorMessage(`Failed to list worktrees: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }

    if (worktrees.length === 0) {
        void vscode.window.showInformationMessage('No Claude worktrees found.');
        return;
    }

    const items = worktrees.map(w => {
        const flags = [
            w.isMerged ? '✓ merged' : '⚠ unmerged',
            w.isDirty  ? '🔴 uncommitted changes' : '',
        ].filter(Boolean).join('  ');
        return {
            label:       `$(git-branch) ${w.branch}`,
            description: `${w.commit}  ${flags}`,
            detail:      w.worktreePath,
            // Only pre-select if merged AND no uncommitted changes
            picked:      w.isMerged && !w.isDirty,
            worktree:    w,
        };
    });

    const picked = await vscode.window.showQuickPick(items, {
        title:        'Remove Claude Worktrees',
        placeHolder:  'Select worktrees to remove (safe ones are pre-checked)',
        canPickMany:  true,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!picked || picked.length === 0) { return; }

    // Warn about dirty worktrees first — these have uncommitted work
    const dirty = picked.filter(p => p.worktree.isDirty);
    if (dirty.length > 0) {
        const names = dirty.map(p => p.worktree.branch).join(', ');
        const confirm = await vscode.window.showWarningMessage(
            `${dirty.length} selected worktree(s) have UNCOMMITTED CHANGES: ${names}.\n\nRemoving will permanently lose that work.`,
            { modal: true }, 'Remove Anyway', 'Skip These'
        );
        if (!confirm) { return; }
        if (confirm === 'Skip These') {
            picked.splice(0, picked.length, ...picked.filter(p => !p.worktree.isDirty));
            if (picked.length === 0) { return; }
        }
    }

    const unmerged = picked.filter(p => !p.worktree.isMerged && !p.worktree.isDirty);
    if (unmerged.length > 0) {
        const names = unmerged.map(p => p.worktree.branch).join(', ');
        const confirm = await vscode.window.showWarningMessage(
            `${unmerged.length} selected worktree(s) are NOT merged into main: ${names}. Remove anyway?`,
            { modal: true }, 'Remove All Selected', 'Skip Unmerged'
        );
        if (!confirm) { return; }
        if (confirm === 'Skip Unmerged') {
            picked.splice(0, picked.length, ...picked.filter(p => p.worktree.isMerged));
            if (picked.length === 0) { return; }
        }
    }

    let removed = 0;
    let failed  = 0;
    for (const item of picked) {
        const wt = item.worktree;
        try {
            await run('git', ['worktree', 'remove', '--force', wt.worktreePath], root);
            log(FEATURE, `Removed worktree: ${wt.branch}`);
            // Delete the local branch too (best-effort)
            try { await run('git', ['branch', '-D', wt.branch], root); } catch { /* ignore */ }
            removed++;
        } catch (err: unknown) {
            log(FEATURE, `Failed to remove ${wt.branch}: ${err instanceof Error ? err.message : String(err)}`);
            failed++;
        }
    }

    const msg = `Removed ${removed} worktree${removed !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed — check Output panel)` : ''}.`;
    if (failed > 0) {
        void vscode.window.showWarningMessage(msg);
    } else {
        void vscode.window.showInformationMessage(msg);
    }
    log(FEATURE, msg);
}
