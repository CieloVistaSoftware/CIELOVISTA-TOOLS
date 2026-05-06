// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Test for code block pairing and language tag detection in code-highlight-audit.ts

'use strict';
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Module = require('module');

// ── vscode mock (code-highlight-audit.js requires vscode) ────────────────────
const vscodeMockPath = path.resolve(__dirname, '.fake-vscode-highlight.js');
fs.writeFileSync(vscodeMockPath,
    `module.exports = { window:{}, commands:{}, Uri:{}, workspace:{} };`,
    'utf8'
);
const _realResolve = Module._resolveFilename;
Module._resolveFilename = function(req, parent, ...rest) {
    if (req === 'vscode') { return vscodeMockPath; }
    return _realResolve.call(this, req, parent, ...rest);
};

const { scanFile } = require('../../out/features/code-highlight-audit.js');

// ── Minimal describe/it/afterEach shims ──────────────────────────────────────
let _afterEachFn = null;
let passed = 0, failed = 0;
function describe(_label, fn) { fn(); }
function afterEach(fn) { _afterEachFn = fn; }
function it(label, fn) {
    try {
        fn();
        console.log('  PASS  ' + label);
        passed++;
    } catch (e) {
        console.error('  FAIL  ' + label + '\n         → ' + e.message);
        failed++;
    }
    if (_afterEachFn) { try { _afterEachFn(); } catch {} }
}

// ─────────────────────────────────────────────────────────────────────────────

function writeTempMarkdown(content) {
    const tmpPath = path.join(__dirname, 'tmp_test.md');
    fs.writeFileSync(tmpPath, content, 'utf8');
    return tmpPath;
}

console.log('\nscanFile code block pairing\n' + '─'.repeat(50));

describe('scanFile code block pairing', () => {
    afterEach(() => {
        const tmpPath = path.join(__dirname, 'tmp_test.md');
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    });

    it('flags only untagged code blocks', () => {
        const md = [
            '# Test',
            '```',
            'console.log(1);',
            '```',
            '```js',
            'console.log(2);',
            '```',
            '```python',
            'print(3)',
            '```',
            '```',
            'no tag',
            '```',
        ].join('\n');
        const tmp = writeTempMarkdown(md);
        const results = scanFile(tmp, 'test');
        assert.strictEqual(results.length, 2, 'Should flag only untagged blocks');
        assert.strictEqual(results[0].lineNumber, 2);
        assert.strictEqual(results[1].lineNumber, 11);
    });

    it('does not flag blocks with language tags', () => {
        const md = [
            '```js',
            'console.log(1);',
            '```',
            '```python',
            'print(2)',
            '```',
        ].join('\n');
        const tmp = writeTempMarkdown(md);
        const results = scanFile(tmp, 'test');
        assert.strictEqual(results.length, 0, 'No untagged blocks');
    });

    it('flags unclosed untagged blocks', () => {
        const md = [
            '```',
            'open block',
        ].join('\n');
        const tmp = writeTempMarkdown(md);
        const results = scanFile(tmp, 'test');
        assert.strictEqual(results.length, 1, 'Should flag unclosed untagged block');
        assert.strictEqual(results[0].lineNumber, 1);
    });

    it('does not flag closed tagged blocks even if file ends', () => {
        const md = [
            '```js',
            'console.log(1);',
            '```',
        ].join('\n');
        const tmp = writeTempMarkdown(md);
        const results = scanFile(tmp, 'test');
        assert.strictEqual(results.length, 0, 'No untagged blocks');
    });
});

// ── Cleanup + Summary ─────────────────────────────────────────────────────────
try { fs.unlinkSync(vscodeMockPath); } catch {}
console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exit(1); }
