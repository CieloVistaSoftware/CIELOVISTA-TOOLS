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
exports.mergeFiles = mergeFiles;
exports.moveToGlobal = moveToGlobal;
exports.deleteDoc = deleteDoc;
exports.diffFiles = diffFiles;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const output_channel_1 = require("../../shared/output-channel");
const registry_1 = require("../../shared/registry");
const FEATURE = 'doc-auditor';
async function mergeFiles(filePaths) {
    if (!filePaths?.length || filePaths.length < 2) {
        vscode.window.showWarningMessage('Select at least two files to merge.');
        return;
    }
    const names = filePaths.map(p => path.basename(p)).join(', ');
    const confirm = await vscode.window.showWarningMessage(`Merge ${filePaths.length} files into one?\n${names}`, { modal: true }, 'Merge', 'Cancel');
    if (confirm !== 'Merge') {
        return;
    }
    const outputName = await vscode.window.showInputBox({ prompt: 'Output filename', value: path.basename(filePaths[0]) });
    if (!outputName?.trim()) {
        return;
    }
    const destPick = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Save merged file here' });
    if (!destPick?.[0]) {
        return;
    }
    try {
        let merged = `# Merged Document\n\n> Merged from: ${filePaths.map(p => path.basename(p)).join(', ')}\n> Date: ${new Date().toISOString().slice(0, 10)}\n\n---\n\n`;
        for (const fp of filePaths) {
            merged += `## From: ${path.basename(fp, '.md')}\n\n${fs.readFileSync(fp, 'utf8').trim()}\n\n---\n\n`;
        }
        const outputPath = path.join(destPick[0].fsPath, outputName.trim());
        fs.writeFileSync(outputPath, merged, 'utf8');
        (0, output_channel_1.log)(FEATURE, `Merged → ${outputPath}`);
        const openIt = await vscode.window.showInformationMessage(`Merged into ${outputName}. Open it?`, 'Open', 'No');
        if (openIt === 'Open') {
            const doc = await vscode.workspace.openTextDocument(outputPath);
            await vscode.window.showTextDocument(doc);
        }
        const del = await vscode.window.showWarningMessage(`Delete the ${filePaths.length} source files now?`, { modal: true }, 'Delete Sources', 'Keep Sources');
        if (del === 'Delete Sources') {
            for (const fp of filePaths) {
                try {
                    fs.unlinkSync(fp);
                }
                catch (err) {
                    (0, output_channel_1.logError)(FEATURE, `Failed to delete ${fp}`, err);
                }
            }
            vscode.window.showInformationMessage('Source files deleted.');
        }
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Merge failed', err);
        vscode.window.showErrorMessage(`Merge failed: ${err}`);
    }
}
async function moveToGlobal(filePath) {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    const fileName = path.basename(filePath);
    const destPath = path.join(registry.globalDocsPath, fileName);
    if (fs.existsSync(destPath)) {
        const ow = await vscode.window.showWarningMessage(`${fileName} already exists in CieloVistaStandards. Overwrite?`, { modal: true }, 'Overwrite', 'Cancel');
        if (ow !== 'Overwrite') {
            return;
        }
    }
    const confirm = await vscode.window.showWarningMessage(`Move ${fileName} to CieloVistaStandards and delete the original?`, { modal: true }, 'Move', 'Cancel');
    if (confirm !== 'Move') {
        return;
    }
    try {
        fs.copyFileSync(filePath, destPath);
        fs.unlinkSync(filePath);
        (0, output_channel_1.log)(FEATURE, `Moved ${filePath} → ${destPath}`);
        vscode.window.showInformationMessage(`Moved to CieloVistaStandards: ${fileName}`);
        const open = await vscode.window.showInformationMessage('Open the moved file?', 'Open', 'No');
        if (open === 'Open') {
            const doc = await vscode.workspace.openTextDocument(destPath);
            await vscode.window.showTextDocument(doc);
        }
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Move to global failed', err);
        vscode.window.showErrorMessage(`Move failed: ${err}`);
    }
}
async function deleteDoc(filePath) {
    const fileName = path.basename(filePath);
    const confirm = await vscode.window.showWarningMessage(`Permanently delete ${fileName}?\n${filePath}`, { modal: true }, 'Delete', 'Cancel');
    if (confirm !== 'Delete') {
        return;
    }
    try {
        fs.unlinkSync(filePath);
        (0, output_channel_1.log)(FEATURE, `Deleted: ${filePath}`);
        vscode.window.showInformationMessage(`Deleted: ${fileName}`);
    }
    catch (err) {
        (0, output_channel_1.logError)(FEATURE, 'Delete failed', err);
        vscode.window.showErrorMessage(`Delete failed: ${err}`);
    }
}
async function diffFiles(filePaths) {
    if (filePaths.length < 2) {
        return;
    }
    const [a, b] = filePaths;
    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(a), vscode.Uri.file(b), `Diff: ${path.basename(a)} ↔ ${path.basename(b)}`);
}
//# sourceMappingURL=actions.js.map