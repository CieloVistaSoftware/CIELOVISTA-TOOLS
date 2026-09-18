// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Code block pairing and language tag detection in code-highlight-audit.ts.
//
// Run: node scripts/run-unit-tests.js code-highlight-audit
//
// This test loads the real scanFile from the per-module test build
// (out-test/features/code-highlight-audit.js, built by
// scripts/build-test-modules.mjs). Until #819 it tested a copy of the scanner
// written inside this file, so when #814 rewrote the real scanner onto
// src/shared/md-fence.ts the test never saw the change. REG-179 keeps every
// unit test named after a module loading that module.

'use strict';
const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out-test/features/code-highlight-audit.js');
if (!fs.existsSync(OUT)) {
    console.error('FAIL: out-test/features/code-highlight-audit.js not built. Run through node scripts/run-unit-tests.js, which builds it.');
    process.exit(1);
}

// The module imports 'vscode' at load; scanFile itself never touches it.
const origLoad = Module._load;
Module._load = function (req) {
    if (req === 'vscode') {
        return {
            commands:  { registerCommand() { return { dispose() {} }; } },
            window:    { createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
            workspace: { getConfiguration: () => ({ get: () => undefined }) },
        };
    }
    return origLoad.apply(this, arguments);
};
const { scanFile } = require(OUT);
Module._load = origLoad;

// ── Minimal test harness ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
function it(label, fn) {
    try { fn(); console.log('  PASS  ' + label); passed++; }
    catch (e) { console.error('  FAIL  ' + label + '\n         -> ' + e.message); failed++; }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-code-highlight-pairing-'));
let n = 0;
/** Write `lines` to a fresh temp .md file (joined with `eol`) and scan it. */
function scan(lines, eol = '\n') {
    const file = path.join(TMP, `case-${++n}.md`);
    fs.writeFileSync(file, lines.join(eol), 'utf8');
    return scanFile(file, 'test');
}
const F = '```';

console.log('\nscanFile code block pairing (real module)\n' + '-'.repeat(50));

it('scanFile is exported by the real module', () => {
    assert.strictEqual(typeof scanFile, 'function');
});

it('flags only untagged code blocks', () => {
    const results = scan(['# Test', F, 'console.log(1);', F, F + 'js', 'console.log(2);', F,
                          F + 'python', 'print(3)', F, F, 'no tag', F]);
    assert.strictEqual(results.length, 2, 'Should flag only untagged blocks');
    assert.strictEqual(results[0].lineNumber, 2);
    assert.strictEqual(results[1].lineNumber, 11);
    assert.strictEqual(results[0].preview, 'console.log(1);');
    assert.strictEqual(results[1].preview, 'no tag');
    assert.strictEqual(results[0].project, 'test');
});

it('does not flag blocks with language tags', () => {
    assert.strictEqual(scan([F + 'js', 'console.log(1);', F, F + 'python', 'print(2)', F]).length, 0);
});

it('flags unclosed untagged blocks', () => {
    const results = scan([F, 'open block']);
    assert.strictEqual(results.length, 1, 'Should flag unclosed untagged block');
    assert.strictEqual(results[0].lineNumber, 1);
    assert.strictEqual(results[0].preview, 'open block');
});

it('does not flag closed tagged blocks even if file ends', () => {
    assert.strictEqual(scan([F + 'js', 'console.log(1);', F]).length, 0);
});

it('a tagged fence line inside a block is content, not a new opener (#495)', () => {
    const results = scan([F, 'text', F + 'typescript', 'still inside', F, F + 'js', 'x', F]);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].lineNumber, 1);
});

it('a shorter or different closer does not close the block', () => {
    const results = scan(['````', F, '~~~', 'still inside', '````', F + 'js', 'x', F]);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].fenceOpen, '````');
});

it('tilde fences pair like backtick fences', () => {
    const results = scan(['~~~', 'plain', '~~~', '~~~bash', 'ls', '~~~']);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].fenceOpen, '~~~');
});

it('CRLF files pair the same as LF files (#610)', () => {
    const results = scan([F, 'a', F, F + 'js', 'b', F], '\r\n');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].lineNumber, 1);
});

// ── Indented fences (#799): 0 to 3 spaces open and close ────────────────────
it('an untagged fence indented 1 to 3 spaces is flagged', () => {
    for (const pad of [' ', '  ', '   ']) {
        const results = scan(['- item', pad + F, pad + 'code', pad + F]);
        assert.strictEqual(results.length, 1, `indent ${pad.length}: one untagged block`);
        assert.strictEqual(results[0].lineNumber, 2, `indent ${pad.length}: opens on line 2`);
        assert.strictEqual(results[0].preview, 'code');
    }
});

it('a tagged fence indented 1 to 3 spaces is not flagged', () => {
    for (const pad of [' ', '  ', '   ']) {
        assert.strictEqual(scan([pad + F + 'js', pad + 'x', pad + F]).length, 0, `indent ${pad.length}`);
    }
});

it('an indented closer closes a block whose opener has a different indent', () => {
    const results = scan([F, 'code', '   ' + F, F + 'js', 'x', F]);
    assert.strictEqual(results.length, 1, 'the indented closer must end the first block');
    assert.strictEqual(results[0].lineNumber, 1);
});

it('a fence indented four spaces is not a fence', () => {
    assert.strictEqual(scan(['    ' + F, '    code', '    ' + F]).length, 0);
});

it('a four-space-indented fence line inside a block does not close it', () => {
    const results = scan([F, 'code', '    ' + F, 'more', F, F + 'js', 'x', F]);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].lineNumber, 1);
});

// ── Summary ───────────────────────────────────────────────────────────────────
fs.rmSync(TMP, { recursive: true, force: true });
console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exit(1); }
