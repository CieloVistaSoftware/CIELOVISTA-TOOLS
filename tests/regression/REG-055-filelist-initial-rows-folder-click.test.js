// Copyright (c) CieloVista Software. All rights reserved.
// REG-055: FileList initial rows preserve folder-click behavior.
//
// Guardrails:
//  1) Server-rendered initial rows use data-is-dir so tr.dataset.isDir is populated.
//  2) Click handler branches on tr.dataset.isDir === '1'.
//  3) Folder click path posts navigate-to command.

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

(function checkInitialRowDataIsDirAttr() {
    if (SRC.includes('data-is-dir="${e.isDir ? \'1\' : \'0\'}"')) {
        pass('initial rows use data-is-dir attribute for folder/file flag');
    } else {
        fail('initial rows missing data-is-dir attribute');
    }
})();

(function checkClickHandlerReadsDatasetIsDir() {
    if (SRC.includes("const isDir = tr.dataset.isDir === '1';")) {
        pass('click handler reads tr.dataset.isDir');
    } else {
        fail('click handler does not read tr.dataset.isDir');
    }
})();

(function checkFolderClickNavigates() {
    if (SRC.includes("vsc.postMessage({ command: isDir ? 'navigate-to' : 'open-file', name: name, isDir: isDir });")) {
        pass('folder click path posts navigate-to command');
    } else {
        fail('navigate-to/open-file click command mux not found');
    }
})();

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
