// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * quick-run.ts — cvs.commands.quickRun, "Commands: Quick Run (quick pick)".
 *
 * Shows every launcher catalog command in a VS Code quick pick (label = the
 * launcher title, description = its group, detail = its description) and runs
 * the one picked. Until #778 this command was registered with the same
 * handler as cvs.commands.showAll, so it opened the launcher panel instead of
 * the quick pick its title and description promise.
 *
 * Only commands VS Code has registered are offered, the same filter the
 * launcher panel applies (#65), so the list never offers a command that would
 * fail with "command not found".
 */
import * as vscode from 'vscode';
import type { CmdEntry } from './types';

/** One quick pick row; `id` is the command it runs. */
export interface QuickRunItem extends vscode.QuickPickItem {
    id: string;
}

/** Builds the quick pick rows: every registered catalog command, in catalog order. */
export function buildQuickRunItems(catalog: readonly CmdEntry[], registered: ReadonlySet<string>): QuickRunItem[] {
    return catalog
        .filter(c => registered.has(c.id))
        .map(c => ({ label: c.title, description: c.group, detail: c.description, id: c.id }));
}

/** cvs.commands.quickRun — pick a catalog command from a quick pick and run it. */
export async function showQuickRun(catalog: readonly CmdEntry[]): Promise<void> {
    const registered = new Set(await vscode.commands.getCommands(false));
    const items = buildQuickRunItems(catalog, registered);
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder:        `Run a CieloVista Tools command (${items.length})`,
        matchOnDescription: true,
        matchOnDetail:      true,
    });
    if (picked) { await vscode.commands.executeCommand(picked.id); }
}
