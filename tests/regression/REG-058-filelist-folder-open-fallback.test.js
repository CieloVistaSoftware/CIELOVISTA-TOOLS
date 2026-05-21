// Copyright (c) CieloVista Software. All rights reserved.
// REG-058: FileList folder open is resilient even if click classification drifts.

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

(function checkClickMessageIncludesIsDir() {
    const hasClickMux = SRC.includes("vsc.postMessage({ command: isDir ? 'navigate-to' : 'open-file', name: name, isDir: isDir });");
    if (hasClickMux) {
        pass('webview click posts isDir alongside command');
    } else {
        fail('webview click message missing isDir payload');
    }
})();

(function checkOpenEntryFallbackExists() {
    const hasHelper = SRC.includes("async function openEntryFromCurrentDir(name: string, mode: 'navigate' | 'open'): Promise<void>");
    const checksDirectory = SRC.includes('if (st.isDirectory()) {') && SRC.includes('navigateTo(entryPath);');
    const openBranchUsesHelper = SRC.includes("if (msg.command === 'open-file') {") && SRC.includes("await openEntryFromCurrentDir(String(msg.name), 'open');");
    if (hasHelper && checksDirectory && openBranchUsesHelper) {
        pass('host open-file path routes directory targets to navigateTo');
    } else {
        fail(`folder-open fallback incomplete: helper=${hasHelper} dirCheck=${checksDirectory} openBranch=${openBranchUsesHelper}`);
    }
})();

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
