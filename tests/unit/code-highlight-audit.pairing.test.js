// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Test for code block pairing and language tag detection in code-highlight-audit.ts

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { scanFile } = require('../../out/features/code-highlight-audit.js');

function writeTempMarkdown(content) {
    const tmpPath = path.join(__dirname, 'tmp_test.md');
    fs.writeFileSync(tmpPath, content, 'utf8');
    return tmpPath;
}

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
        assert.strictEqual(results[1].lineNumber, 12);
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
