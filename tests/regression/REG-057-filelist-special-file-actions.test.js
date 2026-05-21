// Copyright (c) CieloVista Software. All rights reserved.
// REG-057: FileList special actions by file type.
//
// Requirements:
//  1) .vsix files trigger extension install command.
//  2) .md files open in markdown preview mode.
//  3) runnable extension set includes js/ts/ps1/html variants.
//  4) run-file routes .html to local server and .ps1 to PowerShell.
//  5) opening the FileList panel prewarms the HTML server.

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'features', 'file-list-viewer.ts'),
    'utf8'
);

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`PASS: ${msg}`); passed += 1; }
function fail(msg) { console.error(`FAIL: ${msg}`); failed += 1; }

(function checkVsixInstall() {
    const hasVsixBranch = SRC.includes("if (ext === '.vsix')");
    const hasInstallCommand = SRC.includes("'workbench.extensions.installExtension'");
    if (hasVsixBranch && hasInstallCommand) {
        pass('.vsix branch installs extension via workbench command');
    } else {
        fail(`missing vsix install behavior: branch=${hasVsixBranch} command=${hasInstallCommand}`);
    }
})();

(function checkMarkdownPreview() {
    if (SRC.includes("'markdown.showPreviewToSide'")) {
        pass('.md path uses markdown preview to side');
    } else {
        fail('markdown preview command not found');
    }
})();

(function checkRunnableExtensionSet() {
    const hasRunnableSet = SRC.includes('const RUNNABLE_EXTENSIONS = new Set([');
    const hasJs = SRC.includes("'.js'");
    const hasTs = SRC.includes("'.ts'");
    const hasPs1 = SRC.includes("'.ps1'");
    const hasHtml = SRC.includes("'.html'");

    if (hasRunnableSet && hasJs && hasTs && hasPs1 && hasHtml) {
        pass('runnable extension set includes .js/.ts/.ps1/.html');
    } else {
        fail(`runnable extension set incomplete: set=${hasRunnableSet} js=${hasJs} ts=${hasTs} ps1=${hasPs1} html=${hasHtml}`);
    }
})();

(function checkRunFileRouting() {
    const hasRunFileMessage = SRC.includes("msg.command === 'run-file'");
    const hasHtmlRoute = SRC.includes("if (ext === '.html')") && SRC.includes('openHtmlViaServer(target)');
    const hasPs1Route = SRC.includes("if (ext === '.ps1')") && SRC.includes('ExecutionPolicy Bypass -File');
    const hasNodeDefault = SRC.includes("let runtime = 'node'");

    if (hasRunFileMessage && hasHtmlRoute && hasPs1Route && hasNodeDefault) {
        pass('run-file routes .html via server, .ps1 to PowerShell, and defaults to node');
    } else {
        fail(`run-file routing incomplete: msg=${hasRunFileMessage} html=${hasHtmlRoute} ps1=${hasPs1Route} node=${hasNodeDefault}`);
    }
})();

(function checkHtmlServerPrewarmOnPanelOpen() {
    const hasServerEnsure = SRC.includes('async function ensureHtmlServer(targetPath?: string): Promise<number | undefined>');
    const hasOpenPanelPrewarm = SRC.includes('void ensureHtmlServer(_currentDir);');
    const hasHtmlOpen = SRC.includes('async function openHtmlViaServer(targetPath: string): Promise<void>');

    if (hasServerEnsure && hasOpenPanelPrewarm && hasHtmlOpen) {
        pass('FileList startup prewarms HTML server and HTML run action uses it');
    } else {
        fail(`HTML server startup wiring incomplete: ensure=${hasServerEnsure} prewarm=${hasOpenPanelPrewarm} openHtml=${hasHtmlOpen}`);
    }
})();

(function checkTypescriptRunsViaTsx() {
    const hasTsRoute = SRC.includes("ext === '.ts' || ext === '.mts' || ext === '.cts'") &&
                       SRC.includes("runtime = 'npx tsx'");
    if (hasTsRoute) {
        pass('.ts/.mts/.cts run-file routes to npx tsx');
    } else {
        fail('.ts/.mts/.cts run-file must use npx tsx, not node');
    }
})();

(function checkNoDuplicateOpenGuard() {
    const hasFocusHelper = SRC.includes('async function focusExistingEditor(uri: vscode.Uri): Promise<boolean>');
    const hasGuardCall = SRC.includes('if (await focusExistingEditor(uri)) {');
    const guardIndex = SRC.indexOf('if (await focusExistingEditor(uri)) {');
    const openIndex = SRC.indexOf("await vscode.commands.executeCommand('vscode.open', uri, vscode.ViewColumn.Beside);");
    const guardBeforeOpen = guardIndex >= 0 && openIndex >= 0 && guardIndex < openIndex;

    if (hasFocusHelper && hasGuardCall && guardBeforeOpen) {
        pass('open flow checks for already-open editors before vscode.open to avoid duplicates');
    } else {
        fail(`no-duplicate-open guard missing/in wrong order: helper=${hasFocusHelper} call=${hasGuardCall} guardBeforeOpen=${guardBeforeOpen}`);
    }
})();

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
