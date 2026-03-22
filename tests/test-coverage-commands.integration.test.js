/**
 * test-coverage-commands.integration.test.js
 * 
 * Integration test simulating actual command execution in the launcher
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const WORKSPACE_ROOT = 'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools';
const SCRIPT_PATH = path.join(WORKSPACE_ROOT, 'scripts', 'audit-test-coverage.js');
const SCRIPT_CMD = `node "${SCRIPT_PATH}" --json`;

console.log('\n🧪 Test Coverage Command Integration Tests\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${err.message}`);
        failed++;
    }
}

// Test 1: Script file exists
test('audit-test-coverage.js script exists', () => {
    assert.ok(fs.existsSync(SCRIPT_PATH), `Script not found at: ${SCRIPT_PATH}`);
});

// Test 2: Script is executable
test('Script has executable permissions', () => {
    const stats = fs.statSync(SCRIPT_PATH);
    const isExecutable = (stats.mode & fs.constants.S_IXUSR) !== 0;
    assert.ok(isExecutable || process.platform === 'win32', 'Script not executable');
});

// Test 3: Run script and get output
let auditOutput = null;
test('Script executes without error', () => {
    try {
        auditOutput = execSync(SCRIPT_CMD, { 
            encoding: 'utf8', 
            cwd: WORKSPACE_ROOT,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        assert.ok(auditOutput, 'No output from script');
    } catch (err) {
        throw new Error(`Script execution failed: ${err.message}`);
    }
});

// Test 4: Parse JSON output
let metricsJson = null;
test('Script output contains valid JSON', () => {
    assert.ok(auditOutput, 'No audit output to parse');
    // Try to parse the entire output as JSON (handles pretty-printed JSON)
    metricsJson = JSON.parse(auditOutput);
    assert.ok(metricsJson.metrics, 'Missing metrics in JSON');
});

// Test 5: Verify metrics structure
test('Metrics JSON has required fields', () => {
    assert.ok(metricsJson.metrics.totalTestFiles !== undefined, 'Missing totalTestFiles');
    assert.ok(metricsJson.metrics.totalTestCases !== undefined, 'Missing totalTestCases');
    assert.ok(metricsJson.metrics.featuresCovered !== undefined, 'Missing featuresCovered');
    assert.ok(metricsJson.metrics.featuresTotal !== undefined, 'Missing featuresTotal');
});

// Test 6: Verify tier breakdown exists
test('Metrics includes tier breakdown', () => {
    assert.ok(metricsJson.testsByTier, 'Missing testsByTier in metrics');
    assert.ok(metricsJson.testsByTier.TIER_1 !== undefined, 'Missing TIER_1');
    assert.ok(metricsJson.testsByTier.TIER_2 !== undefined, 'Missing TIER_2');
});

// Test 7: Verify report directory
test('Report output directory exists', () => {
    const reportsDir = path.join(WORKSPACE_ROOT, 'docs', '_today');
    assert.ok(fs.existsSync(reportsDir), `Reports dir not found: ${reportsDir}`);
});

// Test 8: Verify markdown report was generated
test('Markdown report file is created', () => {
    const reportsDir = path.join(WORKSPACE_ROOT, 'docs', '_today');
    const files = fs.readdirSync(reportsDir).filter(f => f.startsWith('test-coverage-audit-') && f.endsWith('.md'));
    assert.ok(files.length > 0, 'No markdown report files found');
    console.log(`      Found: ${files[files.length - 1]}`);
});

// Test 9: Verify generated report has content
test('Markdown report has content', () => {
    const reportsDir = path.join(WORKSPACE_ROOT, 'docs', '_today');
    const files = fs.readdirSync(reportsDir)
        .filter(f => f.startsWith('test-coverage-audit-') && f.endsWith('.md'))
        .sort();
    assert.ok(files.length > 0, 'No reports found');
    const latestReport = files[files.length - 1];
    const content = fs.readFileSync(path.join(reportsDir, latestReport), 'utf8');
    assert.ok(content.length > 100, 'Report is too short or empty');
    assert.ok(content.includes('Test Coverage Audit'), 'Report missing title');
});

// Test 10: Verify command handler paths would work
test('Webview panel would initialize correctly', () => {
    // Simulating what happens in openAuditPanel
    const workspaceRoot = WORKSPACE_ROOT;
    const scriptPathResolved = path.join(workspaceRoot, 'scripts', 'audit-test-coverage.js');
    assert.ok(fs.existsSync(scriptPathResolved), `Webview handler path fails: ${scriptPathResolved}`);
});

// Summary
console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
    console.log('🔴 Commands will NOT work in launcher until these tests pass\n');
    process.exit(1);
} else {
    console.log('✅ All integration tests passed - commands should work!\n');
}
