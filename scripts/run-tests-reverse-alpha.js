// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * run-tests-reverse-alpha.js
 *
 * Runs all unit/integration tests in reverse alphabetical order (Z→A by filename).
 * Reports pass/fail for each test and summarizes failures at the end.
 *
 * Usage: node scripts/run-tests-reverse-alpha.js
 */

import { spawnSync } from 'child_process';
import { readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Directories to scan and extensions to include */
const SCAN_DIRS = [
  'tests',
  'tests/regression',
  'tests/unit',
];

/** Patterns to skip (playwright UI tests, vscode test harness) */
const SKIP_PATTERNS = [
  /tests[/\\]ui[/\\]/,
  /tests[/\\]vscode[/\\]/,
  /\.spec\.(js|ts|mjs)$/,
];

function collectTests() {
  const collected = [];

  for (const dir of SCAN_DIRS) {
    const absDir = path.join(ROOT, dir);
    if (!existsSync(absDir)) continue;

    const entries = readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.(test\.js|test\.mjs|test\.ts)$/.test(entry.name)) continue;

      const fullPath = path.join(absDir, entry.name);
      const relative = path.relative(ROOT, fullPath);

      if (SKIP_PATTERNS.some(p => p.test(relative))) continue;
      collected.push({ name: entry.name, fullPath, relative });
    }
  }

  // Sort reverse-alphabetically by filename (Z→A)
  collected.sort((a, b) => b.name.localeCompare(a.name));
  return collected;
}

function runTest(test) {
  const isTs = test.name.endsWith('.test.ts');
  const isMjs = test.name.endsWith('.test.mjs');

  let cmd, args;

  if (isTs) {
    // Run .ts test files with plain node (tests are written as CommonJS-compatible JS)
    cmd = 'node';
    args = [test.fullPath];
  } else if (isMjs) {
    cmd = 'node';
    args = ['--experimental-vm-modules', test.fullPath];
  } else {
    cmd = 'node';
    args = [test.fullPath];
  }

  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });

  return {
    name: test.name,
    relative: test.relative,
    passed: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    error: result.error ? result.error.message : null,
  };
}

function main() {
  const tests = collectTests();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running ${tests.length} tests in reverse-alphabetical order`);
  console.log(`${'='.repeat(60)}\n`);

  const failures = [];
  let passed = 0;

  for (const test of tests) {
    process.stdout.write(`  Running: ${test.relative.padEnd(65)}`);
    const result = runTest(test);

    if (result.passed) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL');
      failures.push(result);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failures.length} failed out of ${tests.length} total`);
  console.log(`${'='.repeat(60)}\n`);

  if (failures.length > 0) {
    console.log('FAILURES:\n');
    for (const f of failures) {
      console.log(`  FILE: ${f.relative}`);
      console.log(`  EXIT: ${f.status}`);
      if (f.error) console.log(`  ERROR: ${f.error}`);
      if (f.stderr.trim()) {
        const lines = f.stderr.trim().split('\n').slice(0, 15);
        console.log(`  STDERR:\n${lines.map(l => '    ' + l).join('\n')}`);
      }
      if (f.stdout.trim()) {
        const lines = f.stdout.trim().split('\n').slice(0, 20);
        console.log(`  STDOUT:\n${lines.map(l => '    ' + l).join('\n')}`);
      }
      console.log();
    }

    // Output machine-readable failure list for CI/issue filing
    console.log('FAILURE_LIST_JSON:' + JSON.stringify(failures.map(f => ({
      name: f.name,
      relative: f.relative,
      status: f.status,
      stderr: f.stderr.slice(0, 500),
      stdout: f.stdout.slice(0, 500),
    }))));

    process.exit(1);
  }
}

main();
