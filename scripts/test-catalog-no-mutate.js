'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const CATALOG_TEST = path.join(ROOT, 'tests', 'catalog-integrity.test.js');
const VALIDATOR = path.join(ROOT, 'scripts', 'validate-package-json.js');

function fail(message) {
  console.error('FAIL: ' + message);
  process.exit(1);
}

if (!fs.existsSync(PKG_PATH)) {
  fail('package.json not found at ' + PKG_PATH);
}
if (!fs.existsSync(CATALOG_TEST)) {
  fail('catalog test not found at ' + CATALOG_TEST);
}
if (!fs.existsSync(VALIDATOR)) {
  fail('validator not found at ' + VALIDATOR);
}

const beforeRaw = fs.readFileSync(PKG_PATH, 'utf8');

// Run the existing catalog integrity test exactly as before.
const catalog = cp.spawnSync(process.execPath, [CATALOG_TEST], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (catalog.error) {
  fail('could not run catalog-integrity.test.js: ' + catalog.error.message);
}
if (catalog.status !== 0) {
  process.exit(catalog.status || 1);
}

const afterRaw = fs.readFileSync(PKG_PATH, 'utf8');
if (afterRaw !== beforeRaw) {
  fail('package.json changed during catalog test execution. This is blocked by issue #67 guardrail.');
}

try {
  JSON.parse(afterRaw);
} catch (err) {
  fail('package.json no longer parses after catalog test: ' + (err instanceof Error ? err.message : String(err)));
}

// Reuse canonical validator so all shape checks remain centralized.
const validate = cp.spawnSync(process.execPath, [VALIDATOR], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (validate.error) {
  fail('could not run validate-package-json.js: ' + validate.error.message);
}
if (validate.status !== 0) {
  process.exit(validate.status || 1);
}

console.log('PASS: catalog test completed without mutating package.json');