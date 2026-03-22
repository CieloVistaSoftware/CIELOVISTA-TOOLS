"use strict";
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
exports.runScan = runScan;
exports.fixAll = fixAll;
exports.fixOneByName = fixOneByName;
exports.fixOneInteractive = fixOneInteractive;
// Copyright (c) 2025 CieloVista Software. All rights reserved.
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const output_channel_1 = require("../../shared/output-channel");
const registry_1 = require("./registry");
const checker_1 = require("./checker");
const fixer_1 = require("./fixer");
const html_1 = require("./html");
const FEATURE = 'marketplace-compliance';
let _panel;
let _lastResults = [];
function showFixSummary(lines, totalFiles, totalProjects) {
    if (!lines.length) {
        vscode.window.showInformationMessage('No files were changed.');
        return;
    }
    const html = (0, html_1.buildSummaryHtml)(lines, totalFiles, totalProjects);
    const summaryPanel = vscode.window.createWebviewPanel('marketplaceSummary', '✅ Fix Summary', vscode.ViewColumn.Beside, { enableScripts: false });
    summaryPanel.webview.html = html;
}
async function runScan() {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    const results = registry.projects.filter(p => fs.existsSync(p.path)).map(p => (0, checker_1.checkProject)(p));
    _lastResults = results;
    const html = (0, html_1.buildComplianceHtml)(results);
    if (_panel) {
        _panel.webview.html = html;
        _panel.reveal();
    }
    else {
        _panel = vscode.window.createWebviewPanel('marketplaceCompliance', '🛒 Marketplace Compliance', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        _panel.webview.html = html;
        _panel.onDidDispose(() => { _panel = undefined; });
    }
    _panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.command) {
            case 'fixAll':
                await fixAll();
                break;
            case 'fixOne':
                await fixOneByName(msg.project);
                break;
            case 'openFolder':
                if (msg.path && fs.existsSync(msg.path)) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(msg.path), { forceNewWindow: false });
                }
                break;
            case 'rescan':
                await runScan();
                break;
        }
    });
    const issues = results.reduce((n, r) => n + r.issues.length, 0);
    if (issues === 0) {
        vscode.window.showInformationMessage('All projects are marketplace-compliant. ✅');
    }
    else {
        const fixable = results.filter(r => r.issues.some(i => i.fixable)).length;
        vscode.window.showInformationMessage(`${issues} issue(s) found — ${fixable} have auto-fixes.`, 'Fix All')
            .then(c => { if (c === 'Fix All') {
            fixAll();
        } });
    }
    (0, output_channel_1.log)(FEATURE, `Scan complete — ${results.length} projects, ${issues} issues`);
}
async function fixAll() {
    const toFix = _lastResults.filter(r => r.issues.some(i => i.fixable));
    if (!toFix.length) {
        vscode.window.showInformationMessage('Nothing to auto-fix.');
        return;
    }
    const summaryLines = [];
    let totalFixed = 0;
    for (const result of toFix) {
        const fixed = (0, fixer_1.fixProject)(result);
        if (fixed.length) {
            totalFixed += fixed.length;
            summaryLines.push(`${result.project.name}: ${fixed.join(', ')}`);
        }
    }
    showFixSummary(summaryLines, totalFixed, toFix.length);
    _panel?.webview.postMessage({ type: 'done', text: `Fixed ${totalFixed} file(s) across ${toFix.length} project(s).` });
    await runScan();
}
async function fixOneByName(projectName) {
    const result = _lastResults.find(r => r.project.name === projectName);
    if (!result) {
        return;
    }
    const fixed = (0, fixer_1.fixProject)(result);
    if (!fixed.length) {
        _panel?.webview.postMessage({ type: 'done', text: `No auto-fixable issues in ${projectName}.` });
        return;
    }
    showFixSummary([`${projectName}: ${fixed.join(', ')}`], fixed.length, 1);
    _panel?.webview.postMessage({ type: 'done', text: `Fixed in ${projectName}: ${fixed.join(', ')}.` });
    await runScan();
}
async function fixOneInteractive() {
    const registry = (0, registry_1.loadRegistry)();
    if (!registry) {
        return;
    }
    const results = registry.projects.filter(p => fs.existsSync(p.path)).map(p => (0, checker_1.checkProject)(p)).filter(r => r.issues.some(i => i.fixable));
    if (!results.length) {
        vscode.window.showInformationMessage('No auto-fixable issues found. ✅');
        return;
    }
    const picked = await vscode.window.showQuickPick(results.map(r => ({ label: `$(tools) ${r.project.name}`, description: `${r.score}/100 · ${r.issues.filter(i => i.fixable).length} fixable`, result: r })), { placeHolder: 'Pick a project to auto-fix' });
    if (!picked) {
        return;
    }
    const fixed = (0, fixer_1.fixProject)(picked.result);
    if (fixed.length) {
        vscode.window.showInformationMessage(`Fixed in ${picked.result.project.name}: ${fixed.join(', ')}`);
    }
}
//# sourceMappingURL=commands.js.map