/**
 * tests/unit/daily-audit-checks.test.js
 *
 * Unit tests for src/features/daily-audit/checks/*.ts
 * All four check functions are pure fs/path logic — no VS Code required.
 *
 * Covers:
 *   runChangelogCheck()       — missing / stale / fresh CHANGELOG.md
 *   runReadmeQualityCheck()   — missing / stub / ok README.md
 *   checkTestCoverage()       — per-project playwright setup checks
 *   runTestCoverageCheck()    — aggregate status rollup
 *   runRegistryHealthCheck()  — project paths exist on disk
 *   AuditCheck shape          — all required fields on every result
 *
 * Run: node tests/unit/daily-audit-checks.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

// ── Load compiled modules ─────────────────────────────────────────────────────
const OUT = 'C:\\Users\\jwpmi\\Downloads\\VSCode\\projects\\cielovista-tools\\out\\features\\daily-audit\\checks';

const modules = {};
for (const name of ['changelog', 'readme-quality', 'test-coverage', 'registry-health']) {
    const p = path.join(OUT, `${name}.js`);
    if (!fs.existsSync(p)) { console.error(`SKIP: ${p} not found — run npm run compile`); process.exit(0); }
    modules[name] = require(p);
}

const { runChangelogCheck }       = modules['changelog'];
const { runReadmeQualityCheck }   = modules['readme-quality'];
const { checkTestCoverage, runTestCoverageCheck } = modules['test-coverage'];
const { runRegistryHealthCheck }  = modules['registry-health'];

// ── Temp workspace ────────────────────────────────────────────────────────────
const TMP = path.join(os.tmpdir(), `cvt-dac-${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });

function makeProject(name, opts = {}) {
    const dir = path.join(TMP, name);
    fs.mkdirSync(dir, { recursive: true });
    return { name, path: dir, type: opts.type ?? 'node', description: '' };
}

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }
function has(s, sub)    { ok(String(s).includes(sub), `Expected: "${sub}" in "${s}"`); }

// ── AuditCheck shape validator ────────────────────────────────────────────────
const REQUIRED_FIELDS = ['checkId','category','title','status','summary','detail',
    'affectedProjects','affectedFiles','action','actionLabel','ranAt','durationMs'];

function assertAuditShape(result, label) {
    for (const f of REQUIRED_FIELDS) {
        ok(f in result, `${label}: missing field "${f}"`);
    }
    ok(['green','yellow','red','grey'].includes(result.status), `${label}: invalid status "${result.status}"`);
    ok(Array.isArray(result.affectedProjects), `${label}: affectedProjects must be array`);
    ok(Array.isArray(result.affectedFiles),    `${label}: affectedFiles must be array`);
    ok(typeof result.durationMs === 'number' && result.durationMs >= 0, `${label}: durationMs must be >= 0`);
    ok(result.ranAt && !isNaN(Date.parse(result.ranAt)), `${label}: ranAt must be valid ISO date`);
}

console.log('\ndaily-audit-checks unit tests\n' + '\u2500'.repeat(50));

// ═══════════════════════════════════════════════════════════
// runChangelogCheck()
// ═══════════════════════════════════════════════════════════
console.log('\n-- runChangelogCheck() --');

test('all fresh changelogs → green', () => {
    const proj = makeProject('cl-fresh');
    fs.writeFileSync(path.join(proj.path, 'CHANGELOG.md'), '# Changelog\n\n## v1.0.0\nInitial.', 'utf8');
    const result = runChangelogCheck([proj]);
    eq(result.status, 'green');
    assertAuditShape(result, 'cl-fresh');
    eq(result.affectedProjects.length, 0);
});

test('missing changelog → red', () => {
    const proj = makeProject('cl-missing');
    // No CHANGELOG.md created
    const result = runChangelogCheck([proj]);
    eq(result.status, 'red');
    ok(result.affectedProjects.includes('cl-missing'));
    has(result.summary, 'cl-missing');
});

test('stale changelog (>30 days) → yellow', () => {
    const proj = makeProject('cl-stale');
    const clPath = path.join(proj.path, 'CHANGELOG.md');
    fs.writeFileSync(clPath, '# Changelog', 'utf8');
    // Set mtime to 40 days ago
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    fs.utimesSync(clPath, fortyDaysAgo, fortyDaysAgo);
    const result = runChangelogCheck([proj]);
    eq(result.status, 'yellow');
    ok(result.affectedProjects.includes('cl-stale'));
});

test('project path missing → skipped (not counted)', () => {
    const ghost = { name: 'ghost-cl', path: path.join(TMP, 'nonexistent-cl'), type: 'node', description: '' };
    // Missing projects are skipped, resulting in empty lists → green
    const result = runChangelogCheck([ghost]);
    eq(result.status, 'green');
});

test('missing takes priority over stale → red', () => {
    const missing = makeProject('cl-miss2');
    const stale   = makeProject('cl-stale2');
    const clPath  = path.join(stale.path, 'CHANGELOG.md');
    fs.writeFileSync(clPath, '# Stale', 'utf8');
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    fs.utimesSync(clPath, oldDate, oldDate);
    const result = runChangelogCheck([missing, stale]);
    eq(result.status, 'red', 'Missing takes priority over stale');
});

test('checkId is "changelog"', () => {
    const result = runChangelogCheck([]);
    eq(result.checkId, 'changelog');
});

// ═══════════════════════════════════════════════════════════
// runReadmeQualityCheck()
// ═══════════════════════════════════════════════════════════
console.log('\n-- runReadmeQualityCheck() --');

test('all good READMEs → green', () => {
    const proj = makeProject('rq-ok');
    fs.writeFileSync(path.join(proj.path, 'README.md'),
        Array(25).fill('# Section\n\nContent line here.').join('\n'), 'utf8');
    const result = runReadmeQualityCheck([proj]);
    eq(result.status, 'green');
    assertAuditShape(result, 'rq-ok');
});

test('missing README → red', () => {
    const proj = makeProject('rq-missing');
    const result = runReadmeQualityCheck([proj]);
    eq(result.status, 'red');
    ok(result.affectedProjects.includes('rq-missing'));
});

test('stub README (< 20 lines) → yellow', () => {
    const proj = makeProject('rq-stub');
    fs.writeFileSync(path.join(proj.path, 'README.md'), '# Title\n\nShort.', 'utf8');
    const result = runReadmeQualityCheck([proj]);
    eq(result.status, 'yellow');
    ok(result.affectedProjects.includes('rq-stub'));
});

test('missing takes priority over stub → red', () => {
    const miss = makeProject('rq-m');
    const stub = makeProject('rq-s');
    fs.writeFileSync(path.join(stub.path, 'README.md'), '# Title', 'utf8');
    const result = runReadmeQualityCheck([miss, stub]);
    eq(result.status, 'red');
});

test('checkId is "readmeQuality"', () => {
    eq(runReadmeQualityCheck([]).checkId, 'readmeQuality');
});

test('actionLabel is "Generate Now" when README missing', () => {
    const proj = makeProject('rq-action');
    const result = runReadmeQualityCheck([proj]);
    eq(result.actionLabel, 'Generate Now');
});

// ═══════════════════════════════════════════════════════════
// checkTestCoverage() — per-project
// ═══════════════════════════════════════════════════════════
console.log('\n-- checkTestCoverage() (per-project) --');

test('project folder missing → issue reported', () => {
    const proj = { name: 'tc-ghost', path: path.join(TMP, 'nonexistent-tc'), type: 'node', description: '' };
    const result = checkTestCoverage(proj);
    ok(result.issues.length > 0, 'Must report issue for missing folder');
    ok(result.issues[0].includes('not found'));
});

test('no tests/ folder → issue reported', () => {
    const proj = makeProject('tc-notests', { type: 'vscode-extension' });
    fs.writeFileSync(path.join(proj.path, 'package.json'),
        JSON.stringify({ name: 'tc-notests', scripts: { test: 'playwright test' }, devDependencies: { '@playwright/test': '^1' } }), 'utf8');
    fs.writeFileSync(path.join(proj.path, 'playwright.config.ts'), 'export default {};', 'utf8');
    const result = checkTestCoverage(proj);
    ok(result.issues.some(i => i.includes('tests/')), 'Must flag missing tests/ folder');
    eq(result.hasTests, false);
});

test('complete playwright setup → no issues', () => {
    const proj = makeProject('tc-complete', { type: 'vscode-extension' });
    const testsDir = path.join(proj.path, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, 'app.spec.ts'),
        "import { test, expect } from '@playwright/test';\ntest('works', async ({ page }) => { expect(1).toBe(1); });", 'utf8');
    fs.writeFileSync(path.join(proj.path, 'playwright.config.ts'), 'export default {};', 'utf8');
    fs.writeFileSync(path.join(proj.path, 'package.json'),
        JSON.stringify({ name: 'tc-complete', scripts: { test: 'playwright test' }, devDependencies: { '@playwright/test': '^1.0.0' } }), 'utf8');
    const result = checkTestCoverage(proj);
    eq(result.issues.length, 0, `Expected no issues, got: ${result.issues.join('; ')}`);
    eq(result.hasTests, true);
    eq(result.hasPlaywright, true);
    eq(result.hasConfig, true);
    eq(result.hasDep, true);
    eq(result.realTestCount, 1);
});

test('wrong test runner → issue mentions playwright', () => {
    const proj = makeProject('tc-jest', { type: 'vscode-extension' });
    fs.mkdirSync(path.join(proj.path, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(proj.path, 'package.json'),
        JSON.stringify({ name: 'tc-jest', scripts: { test: 'jest' }, devDependencies: {} }), 'utf8');
    fs.writeFileSync(path.join(proj.path, 'playwright.config.ts'), '', 'utf8');
    const result = checkTestCoverage(proj);
    ok(result.issues.some(i => i.toLowerCase().includes('playwright')),
       'Wrong runner must suggest playwright');
});

test('dotnet-only project (no package.json) → only tests/ check applies', () => {
    const proj = makeProject('tc-dotnet', { type: 'dotnet' });
    // No package.json — should skip playwright checks
    const result = checkTestCoverage(proj);
    eq(result.hasNpm, false, 'dotnet project must have hasNpm=false');
    // Issues should only be about tests/ folder, not playwright
    ok(!result.issues.some(i => i.includes('playwright')),
       'Dotnet project must not be penalized for missing playwright');
});

test('spec file with only placeholder → issue reported', () => {
    const proj = makeProject('tc-placeholder', { type: 'vscode-extension' });
    const testsDir = path.join(proj.path, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, 'placeholder.spec.ts'),
        "test('placeholder test', () => { /* placeholder */ });", 'utf8');
    fs.writeFileSync(path.join(proj.path, 'package.json'),
        JSON.stringify({ name: 'tc-ph', scripts: { test: 'playwright test' }, devDependencies: { '@playwright/test': '^1' } }), 'utf8');
    fs.writeFileSync(path.join(proj.path, 'playwright.config.ts'), '', 'utf8');
    const result = checkTestCoverage(proj);
    ok(result.issues.some(i => i.includes('placeholder')),
       'Placeholder-only spec must be flagged');
    eq(result.realTestCount, 0);
});

// ═══════════════════════════════════════════════════════════
// runTestCoverageCheck() — aggregate
// ═══════════════════════════════════════════════════════════
console.log('\n-- runTestCoverageCheck() --');

test('all passing → green', () => {
    const proj = makeProject('rtc-green', { type: 'vscode-extension' });
    const testsDir = path.join(proj.path, 'tests');
    fs.mkdirSync(testsDir, { recursive: true });
    fs.writeFileSync(path.join(testsDir, 'a.spec.ts'),
        "import { test } from '@playwright/test';\ntest('works', () => {});", 'utf8');
    fs.writeFileSync(path.join(proj.path, 'playwright.config.ts'), 'export default {};', 'utf8');
    fs.writeFileSync(path.join(proj.path, 'package.json'),
        JSON.stringify({ name: 'rtc-green', scripts: { test: 'playwright test' }, devDependencies: { '@playwright/test': '^1' } }), 'utf8');
    const result = runTestCoverageCheck([proj]);
    eq(result.status, 'green');
    assertAuditShape(result, 'rtc-green');
});

test('1–2 failing → yellow', () => {
    const fail1 = makeProject('rtc-f1', { type: 'vscode-extension' });
    const fail2 = makeProject('rtc-f2', { type: 'vscode-extension' });
    const result = runTestCoverageCheck([fail1, fail2]);
    eq(result.status, 'yellow');
    eq(result.affectedProjects.length, 2);
});

test('3+ failing → red', () => {
    const fails = ['rtc-a','rtc-b','rtc-c'].map(n => makeProject(n, { type: 'vscode-extension' }));
    const result = runTestCoverageCheck(fails);
    eq(result.status, 'red');
});

test('checkId is "testCoverage"', () => {
    eq(runTestCoverageCheck([]).checkId, 'testCoverage');
});

// ═══════════════════════════════════════════════════════════
// runRegistryHealthCheck()
// ═══════════════════════════════════════════════════════════
console.log('\n-- runRegistryHealthCheck() --');

test('all paths exist → green', () => {
    const proj = makeProject('rh-good');
    const result = runRegistryHealthCheck([proj]);
    eq(result.status, 'green');
    assertAuditShape(result, 'rh-good');
    eq(result.affectedProjects.length, 0);
});

test('missing path → red', () => {
    const ghost = { name: 'rh-ghost', path: path.join(TMP, 'nonexistent-rh'), type: 'node', description: '' };
    const result = runRegistryHealthCheck([ghost]);
    eq(result.status, 'red');
    ok(result.affectedProjects.includes('rh-ghost'));
    has(result.summary, 'rh-ghost');
});

test('mixed valid and invalid → red, only invalid in affectedProjects', () => {
    const good  = makeProject('rh-good2');
    const ghost = { name: 'rh-ghost2', path: path.join(TMP, 'nonexistent-rh2'), type: 'node', description: '' };
    const result = runRegistryHealthCheck([good, ghost]);
    eq(result.status, 'red');
    ok(result.affectedProjects.includes('rh-ghost2'));
    ok(!result.affectedProjects.includes('rh-good2'));
});

test('empty projects list → green', () => {
    const result = runRegistryHealthCheck([]);
    eq(result.status, 'green');
    assertAuditShape(result, 'empty');
});

test('checkId is "registryHealth"', () => {
    eq(runRegistryHealthCheck([]).checkId, 'registryHealth');
});

test('stale paths appear in affectedFiles', () => {
    const ghost = { name: 'rh-files', path: path.join(TMP, 'nonexistent-files'), type: 'node', description: '' };
    const result = runRegistryHealthCheck([ghost]);
    ok(result.affectedFiles.some(f => f.includes('nonexistent-files')));
});

// ═══════════════════════════════════════════════════════════
// AuditCheck shape — confirmed on all check types
// ═══════════════════════════════════════════════════════════
console.log('\n-- AuditCheck shape validation --');

test('runChangelogCheck returns valid AuditCheck shape', () => {
    assertAuditShape(runChangelogCheck([]), 'changelog-empty');
});

test('runReadmeQualityCheck returns valid AuditCheck shape', () => {
    assertAuditShape(runReadmeQualityCheck([]), 'readme-empty');
});

test('runTestCoverageCheck returns valid AuditCheck shape', () => {
    assertAuditShape(runTestCoverageCheck([]), 'testcoverage-empty');
});

test('runRegistryHealthCheck returns valid AuditCheck shape', () => {
    assertAuditShape(runRegistryHealthCheck([]), 'registry-empty');
});

// Cleanup
fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
