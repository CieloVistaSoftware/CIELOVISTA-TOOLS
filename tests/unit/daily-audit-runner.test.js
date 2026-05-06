'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../../out/features/daily-audit/runner.js');
if (!fs.existsSync(OUT)) {
    console.error(`SKIP: ${OUT} not found — run npm run compile`);
    process.exit(0);
}

const mod = require(OUT);

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (error) {
        console.error(`  \u2717 ${name}\n    \u2192 ${error.message}`);
        failed++;
    }
}

console.log('\ndaily-audit-runner unit tests\n' + '\u2500'.repeat(50));

test('exports getDailyAuditProjects', () => {
    assert.strictEqual(typeof mod.getDailyAuditProjects, 'function');
});

test('getDailyAuditProjects excludes generated, archived, and dailyAuditExcluded projects', () => {
    const projects = [
        { name: 'product-ok', path: 'C:/tmp/product-ok', type: 'node', description: '', status: 'product' },
        { name: 'workbench-ok', path: 'C:/tmp/workbench-ok', type: 'node', description: '', status: 'workbench' },
        { name: 'generated-skip', path: 'C:/tmp/generated-skip', type: 'node', description: '', status: 'generated' },
        { name: 'archived-skip', path: 'C:/tmp/archived-skip', type: 'node', description: '', status: 'archived' },
        { name: 'excluded-skip', path: 'C:/tmp/excluded-skip', type: 'node', description: '', status: 'product', dailyAuditExcluded: true },
    ];

    const result = mod.getDailyAuditProjects(projects);
    assert.deepStrictEqual(result.map(project => project.name), ['product-ok', 'workbench-ok']);
});

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) {
    console.log(`\u2713 All ${passed} tests passed\n`);
    process.exit(0);
}

console.error(`\n\u2717 ${failed} test(s) FAILED\n`);
process.exit(1);
