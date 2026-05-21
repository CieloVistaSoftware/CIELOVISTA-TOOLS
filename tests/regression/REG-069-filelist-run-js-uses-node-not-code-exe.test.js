// Copyright (c) CieloVista Software. All rights reserved.
// REG-069: Issue #406 — right-click Run on .js must invoke Node, not Code/Editor executable.
//
// Guards against the regression where the run-file terminal command used
// process.execPath (VS Code/Code-Insiders.exe path) instead of the 'node' binary.
//
// Run: node tests/regression/REG-069-filelist-run-js-uses-node-not-code-exe.test.js

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src/features/file-list-viewer.ts'), 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); failed++; }
}

console.log('REG-069: FileList right-click Run uses node, not Code executable (#406)');
console.log('─'.repeat(65));

test('run-file handler uses string literal "node" as default runtime', () => {
    assert(
        SRC.includes("let runtime = 'node'"),
        'run-file must set runtime to the string literal "node", not a dynamic path'
    );
});

test('run-file handler does NOT use process.execPath for the terminal command', () => {
    // process.execPath in VS Code extension context is the Code/Insiders executable.
    // It must never be used to build the node terminal command.
    const runFileIdx = SRC.indexOf("msg.command === 'run-file'");
    assert(runFileIdx !== -1, 'run-file handler must exist');

    // Find the closing of the run-file block (next top-level if or end of handler)
    const nextHandlerIdx = SRC.indexOf("msg.command === 'up'", runFileIdx);
    const block = nextHandlerIdx !== -1
        ? SRC.slice(runFileIdx, nextHandlerIdx)
        : SRC.slice(runFileIdx, runFileIdx + 2000);

    assert(
        !block.includes('process.execPath'),
        'run-file block must not use process.execPath (that is the Code/Insiders exe, not node)'
    );
});

test('run-file terminal command quotes the target path (handles spaces)', () => {
    // Command must be: `${runtime} "${target}"` — target in double-quotes.
    assert(
        SRC.includes('terminal.sendText(`${runtime} "${target}"`)'),
        'run-file must quote the target path with double-quotes to handle paths with spaces'
    );
});

test('right-click ctx-run button sends run-file, not open-file', () => {
    // The ctx-run click handler must send command: 'run-file', not 'open-file'.
    const ctxRunIdx = SRC.indexOf("'ctx-run'");
    assert(ctxRunIdx !== -1, "ctx-run element must exist in the webview HTML");

    const clickHandlerIdx = SRC.indexOf("ctx-run').addEventListener('click'");
    assert(clickHandlerIdx !== -1, "ctx-run must have a click event listener");

    const handlerSnippet = SRC.slice(clickHandlerIdx, clickHandlerIdx + 200);
    assert(
        handlerSnippet.includes("command: 'run-file'"),
        "ctx-run click handler must post command: 'run-file'"
    );
    assert(
        !handlerSnippet.includes("command: 'open-file'"),
        "ctx-run click handler must NOT post command: 'open-file'"
    );
});

test('double-click on runnable file sends run-file, not open-file', () => {
    const dblclickIdx = SRC.indexOf("addEventListener('dblclick'");
    assert(dblclickIdx !== -1, 'dblclick handler must exist');
    const dblBlock = SRC.slice(dblclickIdx, dblclickIdx + 400);
    assert(
        dblBlock.includes("command: 'run-file'"),
        'dblclick on runnable file must post command: run-file'
    );
});

console.log('─'.repeat(65));
if (failed === 0) { console.log(`✓ REG-069 passed (${passed} checks).\n`); process.exit(0); }
else { console.error(`✗ REG-069 FAILED (${failed} of ${passed + failed} checks failed).\n`); process.exit(1); }
