// REG-115: "Reveal in FileList" must be available from BOTH the explorer file
// context menu AND the editor tab (editor/title/context) context menu (#599).
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const pkg  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let passed = 0; let failed = 0;
function check(desc, ok) {
    if (ok) { console.log(`  PASS ${desc}`); passed++; }
    else     { console.error(`  FAIL ${desc}`); failed++; }
}

const CMD = 'cvs.filelist.revealInFilelist';
const menus = pkg.contributes?.menus ?? {};

function menuHas(menuId, command) {
    return (menus[menuId] ?? []).some(m => m.command === command);
}

// Command itself is declared
check('revealInFilelist command is declared in contributes.commands',
    (pkg.contributes?.commands ?? []).some(c => c.command === CMD));

// Explorer file context menu (existing behavior — guard against re-regression)
check('revealInFilelist is on explorer/context for files',
    menuHas('explorer/context', CMD));

// Editor tab context menu (the part that was missing — #599)
check('revealInFilelist is on editor/title/context (right-click editor tab)',
    menuHas('editor/title/context', CMD));

// The editor/title/context entry must be file-scoped, not folders
const editorTabEntry = (menus['editor/title/context'] ?? []).find(m => m.command === CMD);
check('editor/title/context entry targets file resources',
    !!editorTabEntry && typeof editorTabEntry.when === 'string' &&
    editorTabEntry.when.includes('resourceScheme == file'));

console.log(`\nREG-115: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
