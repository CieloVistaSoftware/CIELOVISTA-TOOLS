'use strict';
/**
 * tests/regression/REG-090-bg-health-runner-output-format.test.js
 *
 * Regression guard for bg-health-runner output format improvements (#458).
 *
 * Verifies:
 *   1) Log format uses ✓ / ✗ symbols (not bare "Check: {name}")
 *   2) chk-workspace-open was removed (trivial check)
 *   3) Delta logic: only logs on status change, not every cycle
 *   4) Interval reads from cvs.bgHealthRunner.intervalSeconds setting
 *   5) Setting is declared in package.json
 *
 * Run: node tests/regression/REG-090-bg-health-runner-output-format.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const SRC    = path.join(__dirname, '../../src/features/background-health-runner.ts');
const PKG    = path.join(__dirname, '../../package.json');

const src    = fs.readFileSync(SRC, 'utf8');
const pkg    = JSON.parse(fs.readFileSync(PKG, 'utf8'));

function mustContain(str, needle, label) {
    assert.ok(str.includes(needle), `${label}\nMissing: ${JSON.stringify(needle)}`);
}
function mustNotContain(str, needle, label) {
    assert.ok(!str.includes(needle), `${label}\nShould not contain: ${JSON.stringify(needle)}`);
}

// 1) ✓ / ✗ log format
mustContain(src, '✓', 'SOURCE: must use ✓ symbol for resolved checks');
mustContain(src, '✗', 'SOURCE: must use ✗ symbol for failed checks');

// 2) No more bare "Check: {name}" log line
mustNotContain(src, 'log(FEATURE, `Check: ${check.name}`)',
    'SOURCE: bare "Check: {name}" log must be removed — use delta ✓/✗ format');

// 3) chk-workspace-open removed
mustNotContain(src, 'chk-workspace-open',
    'SOURCE: trivial chk-workspace-open check must be removed');
mustNotContain(src, "'Workspace is open'",
    'SOURCE: trivial "Workspace is open" check name must be removed');

// 4) Configurable interval via setting
mustContain(src, 'cvs.bgHealthRunner.intervalSeconds',
    'SOURCE: must read interval from cvs.bgHealthRunner.intervalSeconds setting');
mustNotContain(src, 'CHECK_GAP_MS',
    'SOURCE: hardcoded CHECK_GAP_MS constant must be removed');

// 5) Delta logic — _checkStatus map
mustContain(src, '_checkStatus',
    'SOURCE: _checkStatus map must exist for delta-only logging');
mustContain(src, 'prevStatus',
    'SOURCE: must compare prevStatus to implement delta logging');

// 6) One-time-one-place: DATA_DIR resolves from workspace folder, not __dirname
mustContain(src, 'workspaceFolders',
    'SOURCE: DATA_DIR must resolve from vscode.workspace.workspaceFolders (one-time-one-place rule)');
mustContain(src, 'let DATA_DIR',
    'SOURCE: DATA_DIR must be let (not const) so activate() can override it from the workspace');
mustContain(src, 'let HEALTH_FILE',
    'SOURCE: HEALTH_FILE must be let (not const) so activate() can override it from the workspace');

// 7) Setting declared in package.json
const props = pkg?.contributes?.configuration?.properties ?? {};
assert.ok(
    'cvs.bgHealthRunner.intervalSeconds' in props,
    'PACKAGE.JSON: cvs.bgHealthRunner.intervalSeconds setting must be declared in contributes.configuration.properties'
);
assert.strictEqual(
    props['cvs.bgHealthRunner.intervalSeconds']?.default,
    30,
    'PACKAGE.JSON: intervalSeconds default must be 30'
);
assert.strictEqual(
    props['cvs.bgHealthRunner.intervalSeconds']?.minimum,
    5,
    'PACKAGE.JSON: intervalSeconds minimum must be 5'
);

console.log('PASS: REG-090 bg-health-runner output format / one-place data checks passed.');
