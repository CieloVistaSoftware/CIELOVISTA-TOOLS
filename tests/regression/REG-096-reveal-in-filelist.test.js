// REG-096 — Reveal in FileList: Explorer context menu reveals a file in the FileList panel
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '../..');
const FLSRC    = fs.readFileSync(path.join(ROOT, 'src/features/file-list-viewer.ts'), 'utf8');
const PKG      = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── file-list-viewer.ts: _pendingReveal state ────────────────────────────────

check('file-list-viewer has _pendingReveal state variable',
    FLSRC.includes('let _pendingReveal'));

check('_pendingReveal is cleared in onDidDispose',
    FLSRC.includes('_pendingReveal = undefined') && FLSRC.includes('onDidDispose'));

check('ready handler posts select message when _pendingReveal is set',
    FLSRC.includes("type: 'select', name") && FLSRC.includes('_pendingReveal'));

// ── revealFileInFileList function ────────────────────────────────────────────

check('file-list-viewer exports revealFileInFileList',
    FLSRC.includes('export function revealFileInFileList('));

check('revealFileInFileList sets _pendingReveal when panel is closed',
    FLSRC.includes('_pendingReveal = name'));

check('revealFileInFileList sets _currentDir to the file\'s parent dir',
    FLSRC.includes('_currentDir   = dir') || FLSRC.includes('_currentDir = dir'));

check('revealFileInFileList calls openFileListPanel when panel is closed',
    FLSRC.includes('_pendingReveal') && FLSRC.includes('openFileListPanel()'));

check('revealFileInFileList calls revealFileInPanel when panel is already open',
    FLSRC.includes('revealFileInPanel(filePath)'));

// ── activate: command registration ──────────────────────────────────────────

check('activate registers cvs.filelist.revealInFilelist command',
    FLSRC.includes("'cvs.filelist.revealInFilelist'"));

check('command handler calls revealFileInFileList with uri.fsPath',
    FLSRC.includes('revealFileInFileList(uri.fsPath)'));

// ── package.json: command contribution ──────────────────────────────────────

const cmds = PKG.contributes?.commands ?? [];
const cmd  = cmds.find(c => c.command === 'cvs.filelist.revealInFilelist');

check('package.json declares cvs.filelist.revealInFilelist command',
    !!cmd);

check('command title mentions FileList or Reveal',
    cmd && (cmd.title.includes('FileList') || cmd.title.includes('Reveal')));

// ── package.json: Explorer context menu ──────────────────────────────────────

const explorerCtx = PKG.contributes?.menus?.['explorer/context'] ?? [];
const menuEntry   = explorerCtx.find(e => e.command === 'cvs.filelist.revealInFilelist');

check('package.json adds cvs.filelist.revealInFilelist to explorer/context menu',
    !!menuEntry);

check('menu entry when-clause targets files (not folders)',
    menuEntry && menuEntry.when && menuEntry.when.includes('!explorerResourceIsFolder'));

check('menu entry when-clause targets file scheme',
    menuEntry && menuEntry.when && menuEntry.when.includes('resourceScheme == file'));

console.log(`\nREG-096: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
