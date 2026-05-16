// Copyright (c) CieloVista Software. All rights reserved.
// REG-057: FileList special actions by file type.
//
// Requirements:
//  1) .vsix files trigger extension install command.
//  2) .md files open in markdown preview mode.
//  3) .js files offer Run or View options.

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

(function checkJavaScriptRunOrView() {
    const hasExtSet = SRC.includes('const JAVASCRIPT_EXTENSIONS = new Set([') && SRC.includes("'.js'");
    const hasQuickPick = SRC.includes('showQuickPick(');
    const hasRunLabel = SRC.includes("{ label: 'Run'");
    const hasViewLabel = SRC.includes("{ label: 'View'");
    const hasTerminalRun = SRC.includes('createTerminal({') && SRC.includes('terminal.sendText(');

    if (hasExtSet && hasQuickPick && hasRunLabel && hasViewLabel && hasTerminalRun) {
        pass('.js path offers Run or View and Run executes in terminal');
    } else {
        fail(`javascript run/view behavior incomplete: extSet=${hasExtSet} quickPick=${hasQuickPick} run=${hasRunLabel} view=${hasViewLabel} terminal=${hasTerminalRun}`);
    }
})();

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
