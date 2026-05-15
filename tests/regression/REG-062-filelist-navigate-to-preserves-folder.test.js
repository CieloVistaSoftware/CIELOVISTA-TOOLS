/**
 * tests/regression/REG-062-filelist-navigate-to-preserves-folder.test.js
 *
 * Guards issue #388: when cvs.tools.fileList.navigateTo sets _currentDir before
 * calling openFileListPanel(), openFileListPanel must NOT overwrite it with the
 * workspace root.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/features/file-list-viewer.ts');
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

console.log('\nREG-062: FileList navigateTo preserves pre-set folder\n' + '─'.repeat(60));

// The guard must use `if (!_currentDir)` — NOT an unconditional assignment.
check('openFileListPanel only sets _currentDir when not already set',
    src.includes('if (!_currentDir) { _currentDir = root') ||
    src.includes('if (!_currentDir) { _currentDir = root!'));

check('openFileListPanel does NOT unconditionally overwrite _currentDir with root',
    !/_currentDir\s*=\s*root(?!!)/.test(src.replace(/if\s*\(!_currentDir\)\s*\{[^}]*\}/g, '')));

// navigateFileListToFolder must set _currentDir before calling openFileListPanel
check('navigateFileListToFolder sets _currentDir before calling openFileListPanel',
    /navigateFileListToFolder[\s\S]{0,300}_currentDir\s*=\s*folderPath[\s\S]{0,200}openFileListPanel/.test(src));

// navigateFileListToFolder must call navigateTo when panel is already open
check('navigateFileListToFolder calls navigateTo when panel is open',
    src.includes('navigateTo(folderPath)'));

// The navigateTo function must call pushUpdate to refresh the view
check('navigateTo calls pushUpdate to refresh the webview',
    src.includes('pushUpdate()'));

console.log('');
if (failed > 0) {
    console.log(`FAILED ${failed} / ${passed + failed}`);
    process.exit(1);
}
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
