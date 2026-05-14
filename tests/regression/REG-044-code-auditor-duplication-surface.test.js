// Copyright (c) CieloVista Software. All rights reserved.
// REG-044: Issue #351 - code auditor script + command + MCP surface
//
// Run: node tests/regression/REG-044-code-auditor-duplication-surface.test.js

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'code-auditor.js');
const EXTENSION_SRC = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
const FEATURE_SRC = fs.readFileSync(path.join(ROOT, 'src', 'features', 'code-auditor.ts'), 'utf8');
const PACKAGE_JSON = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
const MCP_DEFS = fs.readFileSync(path.join(ROOT, 'mcp-server', 'src', 'tools', 'definitions.ts'), 'utf8');
const MCP_INDEX = fs.readFileSync(path.join(ROOT, 'mcp-server', 'src', 'tools', 'index.ts'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS ${name}`);
        passed += 1;
    } catch (err) {
        console.error(`  FAIL ${name}\n       ${err.message}`);
        failed += 1;
    }
}

console.log('REG-044: Code auditor duplication surface (#351)');
console.log('-'.repeat(64));

test('code auditor script exists with JSON and text output paths', () => {
    assert(fs.existsSync(SCRIPT), 'scripts/code-auditor.js is missing');
    const src = fs.readFileSync(SCRIPT, 'utf8');
    assert(src.includes('--json'), 'script is missing --json support');
    assert(src.includes('clusterExact'), 'script missing exact duplicate clustering');
    assert(src.includes('clusterNear'), 'script missing near duplicate clustering');
    assert(src.includes('clusterPattern'), 'script missing repeated-pattern clustering');
});

test('VS Code command is registered and contributed', () => {
    assert(EXTENSION_SRC.includes('codeAuditorActivate'), 'extension feature wiring missing');
    assert(FEATURE_SRC.includes('cvs.tools.codeAuditor'), 'feature command registration missing');
    assert(PACKAGE_JSON.includes('"command": "cvs.tools.codeAuditor"'), 'package command contribution missing');
});

test('MCP tool schema and registration exist', () => {
    assert(MCP_DEFS.includes('AuditDuplicationToolSchema'), 'MCP audit duplication schema missing');
    assert(MCP_INDEX.includes('"cvs_audit_duplication"'), 'MCP tool registration missing');
    assert(MCP_INDEX.includes('code-auditor.js'), 'MCP tool does not invoke the code auditor script');
});

test('script executes and returns a valid JSON report shape', () => {
    const tmpRegistry = path.join(os.tmpdir(), `cvt-reg-044-${Date.now()}.json`);
    const registry = {
        globalDocsPath: ROOT,
        projects: [
            {
                name: 'cielovista-tools',
                path: ROOT,
                type: 'vscode-extension',
                description: 'regression test registry',
                status: 'product',
            },
        ],
    };
    fs.writeFileSync(tmpRegistry, JSON.stringify(registry, null, 2), 'utf8');

    const run = spawnSync(process.execPath, [
        SCRIPT,
        '--json',
        `--registry=${tmpRegistry}`,
        '--min-lines=12',
        '--min-statements=6',
        '--near-threshold=80',
    ], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 180000,
    });

    try {
        assert.strictEqual(run.status, 0, `script exited with ${run.status}: ${run.stderr}`);
        const payload = JSON.parse(run.stdout);
        assert(payload && typeof payload === 'object', 'json payload missing');
        assert(payload.stats && typeof payload.stats.filesScanned === 'number', 'stats.filesScanned missing');
        assert(Array.isArray(payload.clusters), 'clusters array missing');
        assert(typeof payload.stats.clusters === 'number', 'stats.clusters missing');
    } finally {
        try { fs.unlinkSync(tmpRegistry); } catch { /* ignore cleanup errors */ }
    }
});

console.log('-'.repeat(64));
if (failed === 0) {
    console.log(`\u2713 REG-044 passed (${passed} checks).\n`);
    process.exit(0);
}

console.error(`\u2717 REG-044 FAILED (${failed} of ${passed + failed} checks failed).\n`);
process.exit(1);
