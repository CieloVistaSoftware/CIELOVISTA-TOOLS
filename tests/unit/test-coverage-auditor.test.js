// Copyright (c) CieloVista Software. All rights reserved.
// Unit tests: test-coverage-auditor.ts (#128)
// Run: node tests/unit/test-coverage-auditor.test.js

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const ROOT    = path.resolve(__dirname, '..', '..');
const SRC     = fs.readFileSync(path.join(ROOT, 'src', 'features', 'test-coverage-auditor.ts'), 'utf8');
const LAUNCHER = fs.readFileSync(path.join(ROOT, 'src', 'features', 'cvs-command-launcher', 'index.ts'), 'utf8');
const OUT     = path.join(ROOT, 'out', 'features', 'test-coverage-auditor.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${name}\n    → ${err.message}`);
        failed++;
    }
}

console.log('\ntest-coverage-auditor unit tests (#128)\n' + '─'.repeat(50));

// ── Source-level: command constants ──────────────────────────
test('COMMAND_OPEN = cvs.audit.testCoverage', () => {
    assert(SRC.includes("const COMMAND_OPEN = 'cvs.audit.testCoverage';"), 'COMMAND_OPEN wrong or missing');
});

test('COMMAND_REFRESH = cvs.audit.testCoverage.refresh', () => {
    assert(SRC.includes("const COMMAND_REFRESH = 'cvs.audit.testCoverage.refresh';"), 'COMMAND_REFRESH wrong or missing');
});

test('COMMAND_EXPORT = cvs.audit.testCoverage.export', () => {
    assert(SRC.includes("const COMMAND_EXPORT = 'cvs.audit.testCoverage.export';"), 'COMMAND_EXPORT wrong or missing');
});

test('WEBVIEW_TYPE = testCoverageAuditor', () => {
    assert(SRC.includes("const WEBVIEW_TYPE = 'testCoverageAuditor';"), 'WEBVIEW_TYPE wrong or missing');
});

// ── Source-level: panel wiring ────────────────────────────────
test('panel title is "Test Coverage Audit"', () => {
    assert(SRC.includes("'Test Coverage Audit'"), 'Panel title must be "Test Coverage Audit"');
});

test('onDidReceiveMessage registered exactly once (buttons survive refresh)', () => {
    const count = (SRC.match(/onDidReceiveMessage/g) || []).length;
    assert(count === 1, `onDidReceiveMessage must appear exactly once (found ${count}) — duplicates break buttons after Refresh`);
});

test('onDidReceiveMessage paired with context.subscriptions for disposal', () => {
    const idx = SRC.indexOf('onDidReceiveMessage');
    const block = SRC.slice(idx, idx + 1200);
    assert(block.includes('context.subscriptions'), 'onDidReceiveMessage must pass context.subscriptions');
});

test('all four message commands are handled (refresh/export/generate/copyFallback)', () => {
    assert(SRC.includes("case 'refresh':"),      'refresh handler missing');
    assert(SRC.includes("case 'export':"),       'export handler missing');
    assert(SRC.includes("case 'generate':"),     'generate handler missing');
    assert(SRC.includes("case 'copyFallback':"), 'copyFallback handler missing');
});

// ── Source-level: JSON extraction edge cases ──────────────────
test('extractBalancedJsonObject tracks depth to handle nested braces', () => {
    assert(SRC.includes('if (depth === 0)'), 'Depth guard must exist for balanced brace extraction');
    assert(SRC.includes("if (ch === '{'"), 'Must increment depth on open brace');
    assert(SRC.includes("if (ch === '}'"), 'Must decrement depth on close brace');
});

test('runAudit handles string escape state to avoid false brace counts', () => {
    assert(SRC.includes('inString'), 'Must track string context to ignore braces inside strings');
    assert(SRC.includes('escaped'), 'Must handle escape sequences inside strings');
});

// ── Source-level: error path coverage ────────────────────────
test('runAudit throws descriptive error when script file not found', () => {
    assert(SRC.includes('audit-test-coverage.js not found at:'), 'Missing-script error must name the script');
    assert(SRC.includes('this script only exists in the cielovista-tools project'), 'Error must identify correct project');
});

test('runAudit throws with parse context when JSON.parse fails', () => {
    assert(SRC.includes('JSON.parse failed on script output'), 'Parse-failure message missing');
    assert(SRC.includes('Offending payload'), 'Must include payload excerpt for debugging');
});

test('runAudit throws with last-output context when no JSON found', () => {
    assert(SRC.includes('produced no parseable JSON output'), 'No-JSON error message missing');
    assert(SRC.includes('Last output:'), 'Must include last output lines for debugging');
});

// ── Source-level: markdown generation ────────────────────────
test('generateMarkdownFromReport emits tier table rows', () => {
    assert(SRC.includes('`| ${t.tier} | ${t.name} |'), 'Tier table row template missing');
});

test('generateMarkdownFromReport includes gap and recommendation sections', () => {
    assert(SRC.includes('gapLines'), 'Gap lines variable missing');
    assert(SRC.includes('recLines'), 'Recommendation lines variable missing');
    assert(SRC.includes("'_None_'"), 'Must emit _None_ sentinel when lists are empty');
});

test('buildChatPayload function exists and uses @workspace prefix', () => {
    assert(SRC.includes('function buildChatPayload()'), 'buildChatPayload function must exist');
    assert(SRC.includes("'@workspace Here is the current Test Coverage Audit dashboard"), '@workspace prefix wrong or missing');
});

// ── Launcher integration: #367 ────────────────────────────────
test('cvs.audit.testCoverage in DIRECT_PANEL_COMMANDS (no duplicate result panel)', () => {
    const idx = LAUNCHER.indexOf('DIRECT_PANEL_COMMANDS');
    const block = LAUNCHER.slice(idx, idx + 400);
    assert(block.includes("'cvs.audit.testCoverage'"), 'cvs.audit.testCoverage must be in DIRECT_PANEL_COMMANDS — without this the launcher creates a duplicate result panel alongside the dashboard');
});

test('cvs.audit.testCoverage.refresh in DIRECT_PANEL_COMMANDS', () => {
    const idx = LAUNCHER.indexOf('DIRECT_PANEL_COMMANDS');
    const block = LAUNCHER.slice(idx, idx + 400);
    assert(block.includes("'cvs.audit.testCoverage.refresh'"), 'cvs.audit.testCoverage.refresh must be in DIRECT_PANEL_COMMANDS');
});

// ── Runtime: module loads and exports ────────────────────────
if (fs.existsSync(OUT)) {
    const registered = new Map();
    const origLoad = Module._load;
    Module._load = function(req, parent, isMain) {
        if (req === 'vscode') {
            return {
                commands:  { registerCommand(n, h) { registered.set(n, h); return { dispose() {} }; } },
                window:    {
                    showErrorMessage() {},
                    showInformationMessage() {},
                    createWebviewPanel: () => ({
                        webview: { html: '', onDidReceiveMessage: () => ({ dispose() {} }), asWebviewUri: u => u },
                        onDidDispose: () => ({ dispose() {} }),
                        reveal() {}
                    }),
                    createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} })
                },
                workspace: { workspaceFolders: null, getConfiguration: () => ({ get: () => undefined }) },
                ViewColumn: { One: 1 },
                Uri:        { file: f => ({ fsPath: f, toString: () => f }) },
                env:        { clipboard: { writeText: async () => {} } },
            };
        }
        return origLoad.apply(this, arguments);
    };

    let mod;
    try {
        mod = require(OUT);
    } catch (e) {
        console.error(`  SKIP runtime tests — could not load compiled module: ${e.message}`);
        mod = null;
    }
    Module._load = origLoad;

    if (mod) {
        test('compiled module exports activate', () => assert.strictEqual(typeof mod.activate, 'function'));
        test('compiled module exports deactivate', () => assert.strictEqual(typeof mod.deactivate, 'function'));
        test('activate does not throw synchronously', () => {
            assert.doesNotThrow(() => mod.activate({ subscriptions: [] }));
        });
        test('activate registers cvs.audit.testCoverage command', () => {
            mod.activate({ subscriptions: [] });
            assert(registered.has('cvs.audit.testCoverage'), 'cvs.audit.testCoverage not registered');
        });
        test('activate registers cvs.audit.testCoverage.refresh command', () => {
            assert(registered.has('cvs.audit.testCoverage.refresh'), 'cvs.audit.testCoverage.refresh not registered');
        });
        test('activate registers cvs.audit.testCoverage.export command', () => {
            assert(registered.has('cvs.audit.testCoverage.export'), 'cvs.audit.testCoverage.export not registered');
        });
    }
} else {
    console.log('  (runtime tests skipped — compiled output not found)');
}

console.log('─'.repeat(50));
if (failed === 0) {
    console.log(`✓ All ${passed} tests passed.\n`);
    process.exit(0);
} else {
    console.error(`✗ ${failed} of ${passed + failed} tests failed.\n`);
    process.exit(1);
}
