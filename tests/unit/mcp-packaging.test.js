/**
 * tests/unit/mcp-packaging.test.js
 *
 * Guards against VSIX runtime packaging regressions that break MCP startup.
 * Extension and MCP server are bundled by esbuild; node_modules are excluded.
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
const ebuildPath = path.join(root, 'esbuild.mjs');

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

test('esbuild.mjs build script exists', () => {
    assert.ok(fs.existsSync(ebuildPath), 'esbuild.mjs must exist at project root');
});

test('compile script uses esbuild', () => {
    assert.ok(pkg.scripts && pkg.scripts.compile, 'compile script must exist');
    assert.ok(pkg.scripts.compile.includes('esbuild'), 'compile must invoke esbuild');
});

test('vscode:prepublish uses esbuild', () => {
    assert.ok(pkg.scripts && pkg.scripts['vscode:prepublish'], 'vscode:prepublish must exist');
    assert.ok(pkg.scripts['vscode:prepublish'].includes('esbuild'), 'vscode:prepublish must invoke esbuild');
});

test('@modelcontextprotocol/sdk is declared as a dependency', () => {
    assert.ok(pkg.dependencies, 'dependencies section is required');
    assert.ok(pkg.dependencies['@modelcontextprotocol/sdk'], 'expected @modelcontextprotocol/sdk in dependencies');
});

test('.vscodeignore blanket-excludes node_modules (bundled deps, not needed at runtime)', () => {
    const hasBlanketExclude = /^\s*node_modules\/\*\*\s*$/m.test(ignoreText);
    assert.ok(hasBlanketExclude, 'node_modules/** must be excluded — deps are inlined by esbuild');
});

test('.vscodeignore does not keep individual node_modules packages', () => {
    const hasKeepList = /^\s*!node_modules\//m.test(ignoreText);
    assert.strictEqual(hasKeepList, false, 'esbuild bundles deps — no !node_modules keep-list entries needed');
});

console.log('-'.repeat(50));
if (failed === 0) {
    console.log(`PASS: ${passed} passed, 0 failed`);
    process.exit(0);
}
console.log(`FAIL: ${passed} passed, ${failed} failed`);
process.exit(1);
