// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Test for code block pairing and language tag detection in code-highlight-audit.ts
// Inlines the pure scanFile logic (no vscode dependency) since esbuild bundles everything.

'use strict';
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');

// ── Inline the pure scanFile logic from code-highlight-audit.ts ──────────────
// (copied verbatim — no TypeScript syntax needed; function is pure fs/path only)
function scanFile(filePath, project) {
    const results = [];
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); } catch { return results; }

    const lines = content.split('\n');
    let insideBlock = false;
    let blockStartLine = 0;
    let blockLang = '';
    let blockPreview = '';
    let blockFenceOpen = '```';
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fenceMatch = line.match(/^([`~]{3,})(.*)$/);
        if (fenceMatch) {
            if (!insideBlock) {
                insideBlock = true;
                blockStartLine = i + 1;
                blockFenceOpen = fenceMatch[1];
                blockLang = fenceMatch[2].trim();
                blockPreview = '';
            } else {
                const closingFence = fenceMatch[1];
                const sameFenceChar = closingFence[0] === blockFenceOpen[0];
                const enoughFenceLen = closingFence.length >= blockFenceOpen.length;
                if (!sameFenceChar || !enoughFenceLen) { continue; }
                if (blockLang === '') {
                    results.push({ filePath, project, lineNumber: blockStartLine,
                        preview: blockPreview.trim().slice(0, 80), fenceOpen: blockFenceOpen });
                }
                insideBlock = false;
                blockLang = '';
                blockPreview = '';
                blockFenceOpen = '```';
            }
        } else if (insideBlock && blockPreview === '') {
            blockPreview = line;
        }
    }
    if (insideBlock && blockLang === '') {
        results.push({ filePath, project, lineNumber: blockStartLine,
            preview: blockPreview.trim().slice(0, 80), fenceOpen: blockFenceOpen });
    }
    return results;
}

// ── Minimal test harness ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
function it(label, fn) {
    try { fn(); console.log('  PASS  ' + label); passed++; }
    catch (e) { console.error('  FAIL  ' + label + '\n         → ' + e.message); failed++; }
}

function writeTempMarkdown(content) {
    const tmpPath = path.join(__dirname, 'tmp_test.md');
    fs.writeFileSync(tmpPath, content, 'utf8');
    return tmpPath;
}

function cleanup() {
    const tmpPath = path.join(__dirname, 'tmp_test.md');
    if (fs.existsSync(tmpPath)) { try { fs.unlinkSync(tmpPath); } catch {} }
}

console.log('\nscanFile code block pairing\n' + '─'.repeat(50));

it('flags only untagged code blocks', () => {
    const md = ['# Test', '```', 'console.log(1);', '```', '```js', 'console.log(2);', '```',
                '```python', 'print(3)', '```', '```', 'no tag', '```'].join('\n');
    const tmp = writeTempMarkdown(md);
    const results = scanFile(tmp, 'test');
    cleanup();
    assert.strictEqual(results.length, 2, 'Should flag only untagged blocks');
    assert.strictEqual(results[0].lineNumber, 2);
    assert.strictEqual(results[1].lineNumber, 11);
});

it('does not flag blocks with language tags', () => {
    const md = ['```js', 'console.log(1);', '```', '```python', 'print(2)', '```'].join('\n');
    const tmp = writeTempMarkdown(md);
    const results = scanFile(tmp, 'test');
    cleanup();
    assert.strictEqual(results.length, 0, 'No untagged blocks');
});

it('flags unclosed untagged blocks', () => {
    const md = ['```', 'open block'].join('\n');
    const tmp = writeTempMarkdown(md);
    const results = scanFile(tmp, 'test');
    cleanup();
    assert.strictEqual(results.length, 1, 'Should flag unclosed untagged block');
    assert.strictEqual(results[0].lineNumber, 1);
});

it('does not flag closed tagged blocks even if file ends', () => {
    const md = ['```js', 'console.log(1);', '```'].join('\n');
    const tmp = writeTempMarkdown(md);
    const results = scanFile(tmp, 'test');
    cleanup();
    assert.strictEqual(results.length, 0, 'No untagged blocks');
});

// ── Source-level checks ───────────────────────────────────────────────────────
it('source exports scanFile', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '../../src/features/code-highlight-audit.ts'), 'utf8');
    assert.ok(src.includes('export function scanFile'), 'scanFile must be exported');
});

// ── Summary ───────────────────────────────────────────────────────────────────
cleanup();
console.log('\nResult: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exit(1); }
