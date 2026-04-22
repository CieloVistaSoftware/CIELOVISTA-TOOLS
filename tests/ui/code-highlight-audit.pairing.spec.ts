// Copyright (c) 2025 CieloVista Software. All rights reserved.
// Playwright test for code block pairing and language tag detection in code-highlight-audit
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { scanFile } from '../../src/features/code-highlight-audit';

test.describe('scanFile code block pairing', () => {
  const tmpPath = path.join(__dirname, 'tmp_test.md');

  test.afterEach(() => {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
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
    expect(results[1].lineNumber).toBe(12);
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
