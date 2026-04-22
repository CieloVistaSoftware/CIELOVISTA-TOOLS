/**
 * tests/unit/mcp-packaging.test.js
 *
 * Guards against VSIX runtime packaging regressions that break MCP startup.
 *
 * Run: node tests/unit/mcp-packaging.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const pkgPath = path.join(root, 'package.json');
const ignorePath = path.join(root, '.vscodeignore');

if (!fs.existsSync(pkgPath)) {
    console.error(`FAIL: missing ${pkgPath}`);
    process.exit(1);
}
if (!fs.existsSync(ignorePath)) {
    console.error(`FAIL: missing ${ignorePath}`);
    process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const ignoreText = fs.readFileSync(ignorePath, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS ${name}`);
        passed += 1;
    } catch (err) {
        console.error(`  FAIL ${name}`);
        console.error(`    -> ${err.message}`);
        failed += 1;
    }
}

console.log('\nmcp-packaging unit tests\n' + '-'.repeat(50));

test('@modelcontextprotocol/sdk is in runtime dependencies', () => {
    assert.ok(pkg.dependencies, 'dependencies section is required');
    assert.ok(pkg.dependencies['@modelcontextprotocol/sdk'], 'expected @modelcontextprotocol/sdk in dependencies');
});

test('@modelcontextprotocol/sdk is not in devDependencies only', () => {
    const inDev = !!(pkg.devDependencies && pkg.devDependencies['@modelcontextprotocol/sdk']);
    assert.strictEqual(inDev, false, '@modelcontextprotocol/sdk must not be dev-only');
});

test('.vscodeignore does not blanket-exclude node_modules', () => {
    const hasBlanketExclude = /^\s*node_modules\/\*\*\s*$/m.test(ignoreText);
    assert.strictEqual(hasBlanketExclude, false, 'node_modules/** blanket exclusion breaks MCP runtime deps');
});

console.log('-'.repeat(50));
if (failed === 0) {
    console.log(`PASS: ${passed} passed, 0 failed`);
    process.exit(0);
}
console.log(`FAIL: ${passed} passed, ${failed} failed`);
process.exit(1);
