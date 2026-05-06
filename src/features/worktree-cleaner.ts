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
    isActive:     boolean; // current working worktree
}

function run(cmd: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(cmd, args, { cwd, shell: true, encoding: 'utf8' }, (err, stdout, stderr) => {
            if (err) { reject(new Error(stderr || err.message)); return; }
            resolve(stdout.trim());
        });
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

        results.push({ worktreePath: wtPath, branch, commit, isMerged, isActive: false });
    }
    return results;
}

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.tools.cleanWorktrees', () => cleanWorktrees(context))
    );
}

export function deactivate(): void { /* nothing */ }

async function cleanWorktrees(context: vscode.ExtensionContext): Promise<void> {
    const root = context.extensionPath;
    log(FEATURE, 'Listing Claude worktrees…');

    let worktrees: WorktreeInfo[];
    try {
        worktrees = await listClaudeWorktrees(root);
    } catch (err: unknown) {
        void vscode.window.showErrorMessage(`Failed to list worktrees: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }

    if (worktrees.length === 0) {
        void vscode.window.showInformationMessage('No Claude worktrees found.');
        return;
    }

    const items = worktrees.map(w => ({
        label:       `$(git-branch) ${w.branch}`,
        description: `${w.commit}${w.isMerged ? '  ✓ merged' : '  ⚠ unmerged'}`,
        detail:      w.worktreePath,
        picked:      w.isMerged,
        worktree:    w,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title:        'Remove Claude Worktrees',
        placeHolder:  'Select worktrees to remove (merged ones are pre-checked)',
        canPickMany:  true,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!picked || picked.length === 0) { return; }

    const unmerged = picked.filter(p => !p.worktree.isMerged);
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
