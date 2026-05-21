// Copyright (c) CieloVista Software. All rights reserved.
// REG-054: Home page File List click path stays wired and direct-open.
//
// Run: node tests/regression/REG-054-home-filelist-click.test.js

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HOME = path.join(ROOT, 'src', 'features', 'home-page.ts');
const FILELIST = path.join(ROOT, 'src', 'features', 'file-list-viewer.ts');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS ${name}`);
        passed += 1;
    } catch (err) {
        console.error(`  FAIL ${name}\n       ${err.message}`);
        failed += 1;
    }
}

function requireExists(p) {
    if (!fs.existsSync(p)) {
        throw new Error(`Missing file: ${p}`);
    }
}

requireExists(HOME);
requireExists(FILELIST);

const homeSrc = fs.readFileSync(HOME, 'utf8');
const fileListSrc = fs.readFileSync(FILELIST, 'utf8');

console.log('REG-054: Home click opens File List');
console.log('-'.repeat(64));

test('Quick Launch defines File List card with cvs.tools.fileList command', () => {
    if (!/label:\s*'File List'[\s\S]{0,180}cmd:\s*'cvs\.tools\.fileList'/.test(homeSrc)) {
        throw new Error('Home quickLaunch array must include File List card wired to cvs.tools.fileList');
    }
});

test('Quick Launch button click posts runCommand with button dataset command', () => {
    if (!homeSrc.includes("document.querySelectorAll('.ql-btn').forEach")) {
        throw new Error('Quick Launch click binding not found');
    }
    if (!homeSrc.includes("vsc.postMessage({ type:'runCommand', command:b.dataset.cmd });")) {
        throw new Error('Quick Launch click must post runCommand with the card command id');
    }
});

test('Host-side runCommand handler includes File List in OPEN_DIRECT', () => {
    if (!/const OPEN_DIRECT\s*=\s*\[[\s\S]{0,1200}'cvs\.tools\.fileList'/.test(homeSrc)) {
        throw new Error('OPEN_DIRECT must include cvs.tools.fileList for direct open behavior');
    }
});

test('Direct run path focuses second editor group before executing command', () => {
    const directBlock = /else if \(OPEN_DIRECT\.includes\(msg\.command\)\) \{([\s\S]{0,500})\}/.exec(homeSrc);
    if (!directBlock) {
        throw new Error('OPEN_DIRECT execution branch not found');
    }
    if (!directBlock[1].includes("workbench.action.focusSecondEditorGroup")) {
        throw new Error('OPEN_DIRECT branch must focus second editor group');
    }
    if (!directBlock[1].includes("executeCommand(msg.command)")) {
        throw new Error('OPEN_DIRECT branch must execute the requested command id');
    }
});

test('File List command is registered to openFileListPanel', () => {
    if (!fileListSrc.includes("registerCommand('cvs.tools.fileList', openFileListPanel)")) {
        throw new Error('File List command must be registered to openFileListPanel');
    }
});

console.log('-'.repeat(64));
if (failed === 0) {
    console.log(`✓ REG-054 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`✗ REG-054 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
