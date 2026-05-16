// Copyright (c) CieloVista Software. All rights reserved.
// REG-056: FileList uses type-based default viewers.
//
// Guardrails:
//  1) markdown files open in preview-to-side.
//  2) non-markdown files use vscode.open (editor associations/default viewers).
//  3) fallback path still exists for resilient text open.

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

(function checkMarkdownSetExists() {
    if (SRC.includes('const MARKDOWN_EXTENSIONS = new Set([') && SRC.includes("'.md'")) {
        pass('markdown extension set exists');
    } else {
        fail('missing markdown extension set');
    }
})();

(function checkMarkdownPreviewToSide() {
    if (SRC.includes("'markdown.showPreviewToSide'")) {
        pass('markdown opens with preview-to-side');
    } else {
        fail('markdown preview command not found');
    }
})();

(function checkVscodeOpenDefaultViewer() {
    if (SRC.includes("'vscode.open'") && SRC.includes('ViewColumn.Beside')) {
        pass('non-markdown open path uses vscode.open default viewer');
    } else {
        fail('vscode.open default viewer path missing');
    }
})();

(function checkTextFallbackPresent() {
    if (SRC.includes('openTextDocument(uri)') && SRC.includes('openFile default viewer failed')) {
        pass('text-editor fallback path exists if default viewer fails');
    } else {
        fail('fallback openTextDocument path missing');
    }
})();

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
