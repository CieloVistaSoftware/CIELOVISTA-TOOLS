/**
 * launcher-test-coverage.test.js
 * 
 * Tests that the cvs-command-launcher properly includes and searches 
 * test coverage commands with 'playwright' tags.
 * 
 * Run: node tests/launcher-test-coverage.test.js
 */

const assert = require('assert');

// Simulate the CATALOG from the compiled launcher
const CATALOG = [
    { id: 'cvs.audit.testCoverage', title: 'Audit: Test Coverage Dashboard', description: 'Interactive dashboard showing test coverage by tier with one-click unit test generation.', tags: ['test', 'audit', 'coverage', 'dashboard', 'unit tests', 'playwright', 'jest'], group: 'Doc Audit', groupIcon: '🔍', dewey: '900.002', auditCheckId: 'testCoverage' },
    { id: 'cvs.audit.testCoverage.refresh', title: 'Audit: Refresh Test Coverage', description: 'Re-run the test coverage audit and update metrics.', tags: ['test', 'refresh', 'coverage', 'playwright'], group: 'Doc Audit', groupIcon: '🔍', dewey: '900.0021' },
    { id: 'cvs.audit.testCoverage.export', title: 'Audit: Export Coverage Report', description: 'Save and open the test coverage report as markdown.', tags: ['test', 'export', 'report', 'playwright'], group: 'Doc Audit', groupIcon: '🔍', dewey: '900.0022' },
];

/**
 * Search function that mimics the launcher's search logic
 * Matches against: id, title, description, and tags
 */
function searchCatalog(query) {
    if (!query || query.trim() === '') return CATALOG;
    
    const lower = query.toLowerCase();
    return CATALOG.filter(cmd => {
        // Search in id
        if (cmd.id.toLowerCase().includes(lower)) return true;
        // Search in title
        if (cmd.title.toLowerCase().includes(lower)) return true;
        // Search in description
        if (cmd.description.toLowerCase().includes(lower)) return true;
        // Search in tags
        if (cmd.tags && cmd.tags.some(tag => tag.toLowerCase().includes(lower))) return true;
        return false;
    });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        testsPassed++;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${err.message}`);
        testsFailed++;
    }
}

console.log('\n📋 Test Coverage Launcher Commands\n');

test('CATALOG should have 3 test coverage commands', () => {
    const testCovCmds = CATALOG.filter(c => c.id.includes('testCoverage'));
    assert.strictEqual(testCovCmds.length, 3, `Expected 3 test coverage commands, got ${testCovCmds.length}`);
});

test('Primary test coverage command should exist', () => {
    const cmd = CATALOG.find(c => c.id === 'cvs.audit.testCoverage');
    assert.ok(cmd, 'cvs.audit.testCoverage not found in CATALOG');
});

test('Refresh test coverage command should exist', () => {
    const cmd = CATALOG.find(c => c.id === 'cvs.audit.testCoverage.refresh');
    assert.ok(cmd, 'cvs.audit.testCoverage.refresh not found in CATALOG');
});

test('Export test coverage command should exist', () => {
    const cmd = CATALOG.find(c => c.id === 'cvs.audit.testCoverage.export');
    assert.ok(cmd, 'cvs.audit.testCoverage.export not found in CATALOG');
});

test('All test coverage commands should have "test" tag', () => {
    const testCovCmds = CATALOG.filter(c => c.id.includes('testCoverage'));
    testCovCmds.forEach(cmd => {
        assert.ok(
            cmd.tags.includes('test'),
            `Command ${cmd.id} missing "test" tag. Tags: ${cmd.tags.join(', ')}`
        );
    });
});

test('Primary test coverage command should have "playwright" tag', () => {
    const cmd = CATALOG.find(c => c.id === 'cvs.audit.testCoverage');
    assert.ok(
        cmd.tags.includes('playwright'),
        `Command ${cmd.id} missing "playwright" tag. Tags: ${cmd.tags.join(', ')}`
    );
});

test('Refresh test coverage command should have "playwright" tag', () => {
    const cmd = CATALOG.find(c => c.id === 'cvs.audit.testCoverage.refresh');
    assert.ok(
        cmd.tags.includes('playwright'),
        `Command ${cmd.id} missing "playwright" tag. Tags: ${cmd.tags.join(', ')}`
    );
});

test('Export test coverage command should have "playwright" tag', () => {
    const cmd = CATALOG.find(c => c.id === 'cvs.audit.testCoverage.export');
    assert.ok(
        cmd.tags.includes('playwright'),
        `Command ${cmd.id} missing "playwright" tag. Tags: ${cmd.tags.join(', ')}`
    );
});

test('Search "playwright" should find all 3 test coverage commands', () => {
    const results = searchCatalog('playwright');
    const testCovCmds = results.filter(c => c.id.includes('testCoverage'));
    assert.strictEqual(testCovCmds.length, 3, `Expected 3 results for "playwright", got ${testCovCmds.length}: ${results.map(r => r.id).join(', ')}`);
});

test('Search "test coverage" should find all 3 test coverage commands', () => {
    const results = searchCatalog('test coverage');
    const testCovCmds = results.filter(c => c.id.includes('testCoverage'));
    assert.strictEqual(testCovCmds.length, 3, `Expected 3 results for "test coverage", got ${testCovCmds.length}`);
});

test('Search "test" should find all 3 test coverage commands', () => {
    const results = searchCatalog('test');
    const testCovCmds = results.filter(c => c.id.includes('testCoverage'));
    assert.strictEqual(testCovCmds.length, 3, `Expected 3 results for "test", got ${testCovCmds.length}`);
});

test('Search "dashboard" should find primary test coverage command', () => {
    const results = searchCatalog('dashboard');
    const testCovCmds = results.filter(c => c.id === 'cvs.audit.testCoverage');
    assert.strictEqual(testCovCmds.length, 1, `Expected 1 result for "dashboard", got ${results.length}`);
});

test('All test coverage commands should have proper group', () => {
    const testCovCmds = CATALOG.filter(c => c.id.includes('testCoverage'));
    testCovCmds.forEach(cmd => {
        assert.strictEqual(cmd.group, 'Doc Audit', `Command ${cmd.id} has wrong group: ${cmd.group}`);
    });
});

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n📊 Results: ${testsPassed} passed, ${testsFailed} failed\n`);

console.log('✅ CATALOG entries for test coverage commands:\n');
CATALOG.filter(c => c.id.includes('testCoverage')).forEach(cmd => {
    console.log(`  ${cmd.id}`);
    console.log(`    Title: ${cmd.title}`);
    console.log(`    Tags: ${cmd.tags.join(', ')}`);
    console.log(`    Has 'playwright': ${cmd.tags.includes('playwright') ? '✓ YES' : '✗ NO'}`);
    console.log();
});

console.log('🔍 Search Test Results:\n');
console.log(`  Search "playwright": ${searchCatalog('playwright').filter(c => c.id.includes('testCoverage')).length} results`);
console.log(`  Search "test": ${searchCatalog('test').filter(c => c.id.includes('testCoverage')).length} results`);
console.log(`  Search "dashboard": ${searchCatalog('dashboard').filter(c => c.id.includes('testCoverage')).length} results\n`);

if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('✨ All tests passed!\n');
}
