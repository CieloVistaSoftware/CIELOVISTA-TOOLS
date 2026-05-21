/**
 * tests/regression/REG-061-open-folder-as-root-uri-fallback.test.js
 *
 * Guards issue #389: cvs.explorer.openFolderAsRoot must fall back to a folder
 * picker dialog when the Explorer context menu does not pass a URI, rather than
 * showing "No folder was selected."
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/features/open-folder-as-root.ts');
const src = fs.readFileSync(SRC, 'utf8');

let passed = 0;
let failed = 0;

function check(label, condition) {
    if (condition) {
        console.log(`  PASS - ${label}`);
        passed++;
    } else {
        console.log(`  FAIL - ${label}`);
        failed++;
    }
}

console.log('\nREG-061: open-folder-as-root URI fallback\n' + '─'.repeat(60));

check('command handler is async (required for await showOpenDialog)',
    src.includes('async (uri?'));

check('falls back to showOpenDialog when uri is missing',
    src.includes('showOpenDialog'));

check('showOpenDialog configured for folders only (canSelectFolders: true)',
    src.includes('canSelectFolders: true') || src.includes("canSelectFolders:true"));

check('showOpenDialog disallows file selection (canSelectFiles: false)',
    src.includes('canSelectFiles:   false') || src.includes('canSelectFiles: false') || src.includes("canSelectFiles:false"));

check('returns early (no-op) when picker is dismissed',
    src.includes('if (!picked || picked.length === 0) { return; }') ||
    src.includes("picked.length === 0"));

check('uses picked[0] as the folder URI',
    src.includes('folderUri = picked[0]'));

check('no longer shows the "No folder was selected" error webview',
    !src.includes('No folder was selected'));

check('still calls vscode.openFolder with forceNewWindow: false',
    src.includes("'vscode.openFolder'") && src.includes('forceNewWindow: false'));

console.log('');
if (failed > 0) {
    console.log(`FAILED ${failed} / ${passed + failed}`);
    process.exit(1);
}
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
