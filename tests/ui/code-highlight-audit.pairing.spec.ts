// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Playwright test for code block pairing and language tag detection in code-highlight-audit
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Redirect require('vscode') to a minimal stub so the compiled standalone
// module loads outside the VS Code host process.
/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require('module') as { _resolveFilename: (...a: unknown[]) => string };
const VSCODE_STUB = path.resolve(__dirname, '../__mocks__/vscode.js');
const _orig = Module._resolveFilename;
Module._resolveFilename = (req: string, ...rest: unknown[]): string =>
    req === 'vscode' ? VSCODE_STUB : (_orig as (...a: unknown[]) => string)(req, ...rest);

const COMPILED = path.join(__dirname, '../../out/features/code-highlight-audit.js');
if (!fs.existsSync(COMPILED)) {
    throw new Error(`Compiled output not found: ${COMPILED} — run npm run compile`);
}
const { scanFile } = require(COMPILED) as { scanFile: (f: string, p: string) => { lineNumber: number }[] };
/* eslint-enable @typescript-eslint/no-require-imports */

test.describe('scanFile code block pairing', () => {
    const tmpPath = path.join(__dirname, 'tmp_test.md');

    test.afterEach(() => {
        if (fs.existsSync(tmpPath)) { fs.unlinkSync(tmpPath); }
    });

    test('flags only untagged code blocks', async () => {
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
        fs.writeFileSync(tmpPath, md, 'utf8');
        const results = scanFile(tmpPath, 'test');
        expect(results.length).toBe(2);
        expect(results[0].lineNumber).toBe(2);
        expect(results[1].lineNumber).toBe(11);
    });

    test('does not flag blocks with language tags', async () => {
        const md = [
            '```js',
            'console.log(1);',
            '```',
            '```python',
            'print(2)',
            '```',
        ].join('\n');
        fs.writeFileSync(tmpPath, md, 'utf8');
        const results = scanFile(tmpPath, 'test');
        expect(results.length).toBe(0);
    });

    test('flags unclosed untagged blocks', async () => {
        const md = [
            '```',
            'open block',
        ].join('\n');
        fs.writeFileSync(tmpPath, md, 'utf8');
        const results = scanFile(tmpPath, 'test');
        expect(results.length).toBe(1);
        expect(results[0].lineNumber).toBe(1);
    });

    test('does not flag closed tagged blocks even if file ends', async () => {
        const md = [
            '```js',
            'console.log(1);',
            '```',
        ].join('\n');
        fs.writeFileSync(tmpPath, md, 'utf8');
        const results = scanFile(tmpPath, 'test');
        expect(results.length).toBe(0);
    });
});
