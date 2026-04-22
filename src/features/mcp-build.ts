// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

import * as vscode from 'vscode';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { log, logError } from '../shared/output-channel';

const FEATURE = 'mcp-build';
let buildProcess: ChildProcessWithoutNullStreams | null = null;
let buildOutput = '';
const BUILD_MD_PATH = path.join(__dirname, '../../data/mcp-build-result.md');

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('cvs.mcp.build', runMcpBuild),
        vscode.commands.registerCommand('cvs.mcp.build.stop', stopMcpBuild)
    );
}

export function deactivate() {
    stopMcpBuild();
}

export function runMcpBuild() {
    if (buildProcess) {
        vscode.window.showWarningMessage('MCP build is already running.');
        return;
    }
    const mcpPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'mcp-server');
    buildOutput = '';
    buildProcess = spawn('npm', ['run', 'build'], {
        cwd: mcpPath,
        shell: true
    });
    log(FEATURE, 'Started MCP build process.');
    buildProcess.stdout.on('data', (data) => {
        buildOutput += data.toString();
    });
    buildProcess.stderr.on('data', (data) => {
        buildOutput += data.toString();
    });
    buildProcess.on('close', (code) => {
        log(FEATURE, `MCP build exited with code ${code ?? -1}`);
        writeBuildResultMarkdown(code ?? -1);
        showBuildResultMarkdown();
        buildProcess = null;
    });
    buildProcess.on('error', (err) => {
        logError('MCP build process error', err instanceof Error ? err.stack || String(err) : String(err), FEATURE);
        buildOutput += `\nERROR: ${err}`;
        writeBuildResultMarkdown(-1);
        showBuildResultMarkdown();
        buildProcess = null;
    });
}

export function stopMcpBuild() {
    if (buildProcess) {
        try {
            buildProcess.kill('SIGKILL');
            log(FEATURE, 'MCP build process killed.');
        } catch (e) {
            logError('Failed to kill MCP build process', e instanceof Error ? e.stack || String(e) : String(e), FEATURE);
        }
        buildProcess = null;
        vscode.window.showInformationMessage('MCP build stopped.');
        // Optionally trigger UI refresh here if needed
    }
}

function writeBuildResultMarkdown(code: number) {
    const status = code === 0 ? '✅ **Build Succeeded**' : '❌ **Build Failed**';
    const md = `# MCP Build Result\n\n${status}\n\n---\n\n\`\`\`shell\n${buildOutput}\n\`\`\``;
    fs.writeFileSync(BUILD_MD_PATH, md, 'utf8');
}

function showBuildResultMarkdown() {
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(BUILD_MD_PATH));
}
