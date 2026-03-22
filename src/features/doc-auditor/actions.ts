// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import { log, logError } from '../../shared/output-channel';
import { loadRegistry }  from '../../shared/registry';

const FEATURE = 'doc-auditor';

export async function mergeFiles(filePaths: string[]): Promise<void> {
    if (!filePaths?.length || filePaths.length < 2) {
        vscode.window.showWarningMessage('Select at least two files to merge.');
        return;
    }
    const names = filePaths.map(p => path.basename(p)).join(', ');
    const confirm = await vscode.window.showWarningMessage(
        `Merge ${filePaths.length} files into one?\n${names}`, { modal: true }, 'Merge', 'Cancel'
    );
    if (confirm !== 'Merge') { return; }

    const outputName = await vscode.window.showInputBox({ prompt: 'Output filename', value: path.basename(filePaths[0]) });
    if (!outputName?.trim()) { return; }

    const destPick = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Save merged file here' });
    if (!destPick?.[0]) { return; }

    try {
        let merged = `# Merged Document\n\n> Merged from: ${filePaths.map(p => path.basename(p)).join(', ')}\n> Date: ${new Date().toISOString().slice(0,10)}\n\n---\n\n`;
        for (const fp of filePaths) {
            merged += `## From: ${path.basename(fp, '.md')}\n\n${fs.readFileSync(fp,'utf8').trim()}\n\n---\n\n`;
        }
        const outputPath = path.join(destPick[0].fsPath, outputName.trim());
        fs.writeFileSync(outputPath, merged, 'utf8');
        log(FEATURE, `Merged → ${outputPath}`);

        const openIt = await vscode.window.showInformationMessage(`Merged into ${outputName}. Open it?`, 'Open', 'No');
        if (openIt === 'Open') {
            const doc = await vscode.workspace.openTextDocument(outputPath);
            await vscode.window.showTextDocument(doc);
        }

        const del = await vscode.window.showWarningMessage(`Delete the ${filePaths.length} source files now?`, { modal: true }, 'Delete Sources', 'Keep Sources');
        if (del === 'Delete Sources') {
            for (const fp of filePaths) {
                try { fs.unlinkSync(fp); } catch (err) { logError(FEATURE, `Failed to delete ${fp}`, err); }
            }
            vscode.window.showInformationMessage('Source files deleted.');
        }
    } catch (err) {
        logError(FEATURE, 'Merge failed', err);
        vscode.window.showErrorMessage(`Merge failed: ${err}`);
    }
}

export async function moveToGlobal(filePath: string): Promise<void> {
    const registry = loadRegistry();
    if (!registry) { return; }
    const fileName = path.basename(filePath);
    const destPath = path.join(registry.globalDocsPath, fileName);
    if (fs.existsSync(destPath)) {
        const ow = await vscode.window.showWarningMessage(`${fileName} already exists in CieloVistaStandards. Overwrite?`, { modal: true }, 'Overwrite', 'Cancel');
        if (ow !== 'Overwrite') { return; }
    }
    const confirm = await vscode.window.showWarningMessage(`Move ${fileName} to CieloVistaStandards and delete the original?`, { modal: true }, 'Move', 'Cancel');
    if (confirm !== 'Move') { return; }
    try {
        fs.copyFileSync(filePath, destPath);
        fs.unlinkSync(filePath);
        log(FEATURE, `Moved ${filePath} → ${destPath}`);
        vscode.window.showInformationMessage(`Moved to CieloVistaStandards: ${fileName}`);
        const open = await vscode.window.showInformationMessage('Open the moved file?', 'Open', 'No');
        if (open === 'Open') { const doc = await vscode.workspace.openTextDocument(destPath); await vscode.window.showTextDocument(doc); }
    } catch (err) {
        logError(FEATURE, 'Move to global failed', err);
        vscode.window.showErrorMessage(`Move failed: ${err}`);
    }
}

export async function deleteDoc(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    const confirm = await vscode.window.showWarningMessage(`Permanently delete ${fileName}?\n${filePath}`, { modal: true }, 'Delete', 'Cancel');
    if (confirm !== 'Delete') { return; }
    try {
        fs.unlinkSync(filePath);
        log(FEATURE, `Deleted: ${filePath}`);
        vscode.window.showInformationMessage(`Deleted: ${fileName}`);
    } catch (err) {
        logError(FEATURE, 'Delete failed', err);
        vscode.window.showErrorMessage(`Delete failed: ${err}`);
    }
}

export async function diffFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length < 2) { return; }
    const [a, b] = filePaths;
    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(a), vscode.Uri.file(b), `Diff: ${path.basename(a)} ↔ ${path.basename(b)}`);
}
