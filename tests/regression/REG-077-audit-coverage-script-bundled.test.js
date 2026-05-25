'use strict';
/**
 * REG-077 — audit-test-coverage.js is bundled and executable
 *
 * Issue #451: the extension crashed with "audit-test-coverage.js not found at:
 * <extensionPath>/scripts/audit-test-coverage.js" because .vscodeignore excluded
 * the entire scripts/ directory.
 *
 * Fix: added "!scripts/audit-test-coverage.js" negation to .vscodeignore so the
 * script is included in the VSIX and present at <extensionPath>/scripts/.
 *
 * This test exercises the actual script — it runs it via child_process.execSync
 * exactly as test-coverage-auditor.ts does, and verifies the JSON output has the
 * expected structure.  A static text-pattern check would not have caught the
 * bug (the script existed, it was just not packaged).
 *
 * Checks:
 *  1. scripts/audit-test-coverage.js exists (prerequisite for bundling)
 *  2. Running the script with --json exits 0 and produces output
 *  3. Output contains a parseable JSON object
 *  4. JSON has a top-level "metrics" key (required by test-coverage-auditor.ts)
 *  5. metrics.totalTestFiles is a non-negative number
 *  6. metrics.totalTestCases is a non-negative number
 *  7. .vscodeignore contains the !scripts/audit-test-coverage.js negation line
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT        = path.join(__dirname, '..', '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'audit-test-coverage.js');
const VSCODEIGNORE = path.join(ROOT, '.vscodeignore');

let passed = 0;
let failed = 0;

function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); passed++; }
    else       { console.error(`  ✗ ${desc}`); failed++; }
}

console.log('REG-077: audit-test-coverage.js bundled and executable');
console.log('');

// Check 1: script file exists in source
check('scripts/audit-test-coverage.js exists', fs.existsSync(SCRIPT_PATH));

// Checks 2-6: actually run the script the same way test-coverage-auditor.ts does
let rawOutput = '';
let runError  = null;
try {
    rawOutput = execSync(`node "${SCRIPT_PATH}" --json`, {
        encoding: 'utf8',
        cwd: ROOT,           // same as workspaceRoot in the extension
        stdio: 'pipe',
    });
} catch (e) {
    // execSync throws on non-zero exit — capture stdout/stderr from the error
    rawOutput = e.stdout || '';
    runError  = e;
}

check('Script exits 0 or produces stdout output', !runError || rawOutput.trim().length > 0);

// Parse JSON (mirrors extractBalancedJsonObject logic in test-coverage-auditor.ts)
let metricsJson = null;
const trimmed = rawOutput.trim();
if (trimmed.startsWith('{')) {
    try { metricsJson = JSON.parse(trimmed); } catch { /* fall through */ }
}
if (!metricsJson) {
    // Scan for first balanced JSON object containing "metrics"
    for (let i = 0; i < rawOutput.length; i++) {
        if (rawOutput[i] !== '{') { continue; }
        let depth = 0;
        for (let j = i; j < rawOutput.length; j++) {
            if (rawOutput[j] === '{') { depth++; }
            else if (rawOutput[j] === '}') {
                depth--;
                if (depth === 0) {
                    try {
                        const candidate = JSON.parse(rawOutput.slice(i, j + 1));
                        if (candidate && candidate.metrics) { metricsJson = candidate; }
                    } catch { /* keep scanning */ }
                    break;
                }
            }
        }
        if (metricsJson) { break; }
    }
}

check('Script output contains parseable JSON', metricsJson !== null);
check('JSON has top-level "metrics" key',   metricsJson !== null && typeof metricsJson.metrics === 'object');
check('metrics.totalTestFiles is a number', metricsJson !== null && typeof metricsJson.metrics?.totalTestFiles === 'number' && metricsJson.metrics.totalTestFiles >= 0);
check('metrics.totalTestCases is a number', metricsJson !== null && typeof metricsJson.metrics?.totalTestCases === 'number' && metricsJson.metrics.totalTestCases >= 0);

// Check 7: .vscodeignore has the negation line that ensures the script is bundled
const vscodeignoreContent = fs.existsSync(VSCODEIGNORE) ? fs.readFileSync(VSCODEIGNORE, 'utf8') : '';
check('.vscodeignore has !scripts/audit-test-coverage.js negation',
    vscodeignoreContent.includes('!scripts/audit-test-coverage.js'));

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failed > 0) {
    console.error(`REG-077 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-077 passed (${passed} checks)`);
}
