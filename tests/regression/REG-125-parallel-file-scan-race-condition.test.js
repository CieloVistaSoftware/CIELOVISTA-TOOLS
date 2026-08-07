/**
 * REG-125: Parallel test execution doesn't cause ENOENT during concurrent file scans
 *
 * Issue #382 (flaky regression tests): Under parallel load, REG-015 (package-json-round-trip)
 * creates and deletes a temporary test fixture file __reg015_test_feature.ts while REG-002
 * (logError interface compliance) scans all .ts files in src/. The race condition:
 *
 *   1. walkTs() enumerates all files in src/ (synchronous, non-atomic)
 *   2. REG-015 creates __reg015_test_feature.ts
 *   3. REG-002 reads from the accumulated file list
 *   4. REG-015 deletes __reg015_test_feature.ts
 *   5. REG-002 tries fs.readFileSync() → ENOENT crash
 *
 * Fix: Wrap file reads in try-catch, skip ENOENT gracefully since the file doesn't exist
 * in the actual codebase we're scanning anyway.
 *
 * Run: node tests/regression/REG-125-parallel-file-scan-race-condition.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LOGERROR_TEST = path.join(ROOT, 'scripts', 'test-logerror-interface.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    failed++;
  }
}

console.log('REG-125: Parallel file scan handles ENOENT gracefully (#382)');
console.log('─'.repeat(65));

// Verify that the logError interface test has the fix for ENOENT handling
test('logError test wraps readFileSync in try-catch for ENOENT handling', () => {
  const src = fs.readFileSync(LOGERROR_TEST, 'utf8');

  // Check that the fix is in place: ENOENT handling in the loop that reads files
  if (!src.includes("fs.readFileSync(allFiles[fi]")) {
    throw new Error('Could not find readFileSync call for allFiles in logError test');
  }

  // Verify it's wrapped in try-catch
  if (!src.includes("try {") || !src.includes("} catch (err) {")) {
    throw new Error('readFileSync call is not wrapped in try-catch');
  }

  // Verify ENOENT is specifically handled
  if (!src.includes("err.code === 'ENOENT'")) {
    throw new Error("ENOENT error code is not checked in the catch block");
  }

  // Verify the fix continues on ENOENT instead of crashing
  if (!src.includes("continue;") || !src.match(/ENOENT[^}]*continue/)) {
    throw new Error('Catch block does not continue/skip on ENOENT');
  }
});

// Verify that temp test fixtures won't be scanned
test('temp fixture naming convention prevents accidental inclusion', () => {
  // Both REG-015 and REG-125 use __reg* prefix which makes them obvious as temp files
  // This is a secondary defense: even if a file isn't cleaned up, reviewers will
  // spot it as a test artifact
  if (!fs.existsSync(path.join(ROOT, 'src', 'features', '__reg015_test_feature.ts')) &&
      !fs.existsSync(path.join(ROOT, 'src', 'features', '__reg125_temp_fixture.ts'))) {
    // Good — no temp fixtures left over (they were cleaned up)
    return;
  }
  throw new Error('Temporary test fixture file was not cleaned up');
});

console.log('─'.repeat(65));
if (failed === 0) {
  console.log(`✓ REG-125 passed (${passed} checks).\n`);
  process.exit(0);
}

console.error(`✗ REG-125 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
