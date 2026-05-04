/**
 * tests/unit/shared-source.test.js
 *
 * Source-level tests for shared modules that depend heavily on vscode APIs.
 * Reads .ts source files directly (same pattern as doc-catalog.test.js).
 * Tests the shape, contracts, and logic patterns without running VS Code.
 *
 * Also runs actual compiled logic for pure functions:
 *   copilot-rules-utils: formatRulesForDisplay(), readRulesFile(), DEFAULT_RULES
 *   terminal-utils: getAppDataPath()
 *   registry: REGISTRY_PATH constant, ProjectEntry / ProjectRegistry shapes
 *   audit-schema: AUDIT_REPORT_PATH, AuditStatus values in source
 *
 * Run: node tests/unit/shared-source.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const Module = require('module');

// ── vscode mock ───────────────────────────────────────────────────────────────
const TMP_WS = path.join(os.tmpdir(), `cvt-shared-${Date.now()}`);
fs.mkdirSync(TMP_WS, { recursive: true });

const vscodeMock = {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: TMP_WS } }],
        getConfiguration: () => ({ update: () => Promise.resolve() }),
    },
    window: {
        createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
        showInformationMessage: () => Promise.resolve(),
        showWarningMessage:     () => Promise.resolve(),
        showErrorMessage:       () => Promise.resolve(),
        activeTerminal: null,
        createTerminal: (opts) => ({
            sendText: () => {}, show: () => {}, dispose: () => {},
        }),
    },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    Uri: { file: (p) => ({ fsPath: p }) },
    commands: { executeCommand: () => Promise.resolve() },
};

const _orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_shared__' : _orig(req, ...args);
require.cache['__vs_shared__'] = {
    id: '__vs_shared__', filename: '__vs_shared__', loaded: true,
    exports: vscodeMock, parent: null, children: [], path: '', paths: [],
};

// ── Load compiled modules ─────────────────────────────────────────────────────
const ROOT    = path.join(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'out', 'shared');
const SRC_DIR = path.join(ROOT, 'src', 'shared');

function requireOut(name) {
    const p = path.join(OUT_DIR, `${name}.js`);
    if (!fs.existsSync(p)) { return null; }
    return require(p);
}

function readSrc(name) {
    return fs.readFileSync(path.join(SRC_DIR, `${name}.ts`), 'utf8');
}

const rulesUtils    = requireOut('copilot-rules-utils');
const terminalUtils = requireOut('terminal-utils');

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }
function has(src, sub, msg)    { ok(src.includes(sub), msg || `Expected: ${sub}`); }
function hasNot(src, sub, msg) { ok(!src.includes(sub), msg || `Must not contain: ${sub}`); }

console.log('\nshared-source unit tests\n' + '\u2500'.repeat(50));

// ═══════════════════════════════════════════════════════════
// audit-schema.ts — source-level checks on types/constants
// ═══════════════════════════════════════════════════════════
console.log('\n-- audit-schema.ts (source) --');

const auditSrc = readSrc('audit-schema');

test('AUDIT_REPORT_PATH constant exported', () => has(auditSrc, 'export const AUDIT_REPORT_PATH'));
test('AUDIT_REPORT_PATH points to CieloVistaStandards', () => has(auditSrc, 'CieloVistaStandards'));
test('AuditStatus type exported with all four values', () => {
    has(auditSrc, "'green'");
    has(auditSrc, "'yellow'");
    has(auditSrc, "'red'");
    has(auditSrc, "'grey'");
});
test('AuditCheck interface has checkId field', () => has(auditSrc, 'checkId:'));
test('AuditCheck interface has status field', () => has(auditSrc, 'status:'));
test('AuditCheck interface has summary field', () => has(auditSrc, 'summary:'));
test('AuditCheck interface has affectedProjects field', () => has(auditSrc, 'affectedProjects:'));
test('AuditCheck interface has ranAt timestamp field', () => has(auditSrc, 'ranAt:'));
test('AuditCheck interface has durationMs field', () => has(auditSrc, 'durationMs:'));
test('DailyAuditReport interface has checks array', () => has(auditSrc, 'checks:'));
test('DailyAuditReport summary has red/yellow/green/grey counts', () => {
    has(auditSrc, 'red:');
    has(auditSrc, 'yellow:');
    has(auditSrc, 'green:');
    has(auditSrc, 'grey:');
});

// ═══════════════════════════════════════════════════════════
// registry.ts — source checks + REGISTRY_PATH value
// ═══════════════════════════════════════════════════════════
console.log('\n-- registry.ts (source) --');

const regSrc = readSrc('registry');

test('REGISTRY_PATH exported', () => has(regSrc, 'export const REGISTRY_PATH'));
test('REGISTRY_PATH points to project-registry.json', () => has(regSrc, 'project-registry.json'));
test('ProjectEntry interface has name field', () => has(regSrc, 'name:'));
test('ProjectEntry interface has path field', () => has(regSrc, 'path:'));
test('ProjectEntry interface has type field', () => has(regSrc, 'type:'));
test('ProjectRegistry interface has globalDocsPath', () => has(regSrc, 'globalDocsPath:'));
test('ProjectRegistry interface has projects array', () => has(regSrc, 'projects:'));
test('loadRegistry exported', () => has(regSrc, 'export function loadRegistry'));
test('loadRegistry returns undefined on missing file', () => {
    has(regSrc, 'return undefined');
    has(regSrc, 'existsSync');
});
test('loadRegistry uses try/catch for JSON parse', () => has(regSrc, 'try {'));
test('loadRegistry shows error message on failure', () => has(regSrc, 'showErrorMessage'));

// ═══════════════════════════════════════════════════════════
// copilot-rules-utils.ts — compiled pure functions
// ═══════════════════════════════════════════════════════════
console.log('\n-- copilot-rules-utils.ts --');

if (!rulesUtils) {
    console.log('  SKIP: copilot-rules-utils not compiled');
} else {
    test('DEFAULT_RULES exported and non-empty', () => {
        ok(typeof rulesUtils.DEFAULT_RULES === 'string' && rulesUtils.DEFAULT_RULES.length > 50);
    });
    test('DEFAULT_RULES contains rule about file path', () => {
        has(rulesUtils.DEFAULT_RULES, 'file path');
    });
    test('DEFAULT_RULES contains rule about TypeScript', () => {
        has(rulesUtils.DEFAULT_RULES, 'TypeScript');
    });
    test('formatRulesForDisplay: inline text rule', () => {
        const result = rulesUtils.formatRulesForDisplay([{ text: 'Always use types' }], TMP_WS);
        has(result, 'Always use types');
        has(result, 'Inline Rule');
    });
    test('formatRulesForDisplay: file rule shows filename', () => {
        const result = rulesUtils.formatRulesForDisplay([{ file: 'copilot-rules.md' }], TMP_WS);
        has(result, 'copilot-rules.md');
    });
    test('formatRulesForDisplay: missing file shows not found message', () => {
        const result = rulesUtils.formatRulesForDisplay([{ file: 'does-not-exist.md' }], TMP_WS);
        has(result, 'File not found');
    });
    test('formatRulesForDisplay: multiple rules all appear', () => {
        const result = rulesUtils.formatRulesForDisplay([
            { text: 'Rule one' },
            { text: 'Rule two' },
        ], TMP_WS);
        has(result, 'Rule one');
        has(result, 'Rule two');
    });
    test('readRulesFile: creates default file when not found', () => {
        const tmpDir = path.join(TMP_WS, 'rules-test');
        fs.mkdirSync(tmpDir, { recursive: true });
        const content = rulesUtils.readRulesFile(tmpDir);
        const rulesPath = path.join(tmpDir, 'copilot-rules.md');
        ok(fs.existsSync(rulesPath), 'Rules file must be created');
        ok(content.length > 0, 'Must return non-empty content');
    });
    test('readRulesFile: returns existing file content', () => {
        const tmpDir = path.join(TMP_WS, 'rules-existing');
        fs.mkdirSync(tmpDir, { recursive: true });
        const CUSTOM = '# My Custom Rules\n\nDo stuff.';
        fs.writeFileSync(path.join(tmpDir, 'copilot-rules.md'), CUSTOM, 'utf8');
        const content = rulesUtils.readRulesFile(tmpDir);
        eq(content, CUSTOM, 'Must return exact file content');
    });
    test('applyWorkspaceRules: exported function', () => {
        ok(typeof rulesUtils.applyWorkspaceRules === 'function');
    });
    test('removeWorkspaceRules: exported function', () => {
        ok(typeof rulesUtils.removeWorkspaceRules === 'function');
    });
    test('applyWorkspaceRules: writes .vscode/settings.json', () => {
        const tmpDir = path.join(TMP_WS, 'apply-test');
        fs.mkdirSync(tmpDir, { recursive: true });
        rulesUtils.applyWorkspaceRules(tmpDir);
        const settingsPath = path.join(tmpDir, '.vscode', 'settings.json');
        ok(fs.existsSync(settingsPath), 'settings.json must be created');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const key = 'github.copilot.chat.codeGeneration.instructions';
        ok(Array.isArray(settings[key]), 'Instructions key must be an array');
        eq(settings[key][0].file, 'copilot-rules.md', 'Must point to rules file');
    });
    test('removeWorkspaceRules: removes copilot instructions key', () => {
        const tmpDir = path.join(TMP_WS, 'remove-test');
        fs.mkdirSync(tmpDir, { recursive: true });
        rulesUtils.applyWorkspaceRules(tmpDir);
        rulesUtils.removeWorkspaceRules(tmpDir);
        const settingsPath = path.join(tmpDir, '.vscode', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const key = 'github.copilot.chat.codeGeneration.instructions';
        ok(!(key in settings), 'Instructions key must be removed');
    });
    test('removeWorkspaceRules: no-op when settings.json not found', () => {
        const tmpDir = path.join(TMP_WS, 'remove-nofile');
        fs.mkdirSync(tmpDir, { recursive: true });
        // Must not throw
        rulesUtils.removeWorkspaceRules(tmpDir);
        ok(true, 'Must not throw when settings.json missing');
    });
}

// ═══════════════════════════════════════════════════════════
// terminal-utils.ts — pure getAppDataPath()
// ═══════════════════════════════════════════════════════════
console.log('\n-- terminal-utils.ts --');

if (!terminalUtils) {
    console.log('  SKIP: terminal-utils not compiled');
} else {
    test('getAppDataPath: returns a non-empty string', () => {
        const result = terminalUtils.getAppDataPath();
        ok(typeof result === 'string' && result.length > 0, 'Must return non-empty string');
    });
    test('getAppDataPath: returns a directory that exists', () => {
        const result = terminalUtils.getAppDataPath();
        ok(fs.existsSync(result), `Path must exist on disk: ${result}`);
    });
    test('getAppDataPath: source uses APPDATA with HOME fallback', () => {
        const src = readSrc('terminal-utils');
        has(src, 'process.env.APPDATA');
        has(src, 'process.env.HOME');
    });
    test('cdToFolder: exported function', () => {
        ok(typeof terminalUtils.cdToFolder === 'function');
    });
    test('openFileAtLine: exported function', () => {
        ok(typeof terminalUtils.openFileAtLine === 'function');
    });
    test('getActiveOrCreateTerminal: exported function', () => {
        ok(typeof terminalUtils.getActiveOrCreateTerminal === 'function');
    });
}

// ═══════════════════════════════════════════════════════════
// output-channel.ts — source checks (VS Code dependency)
// ═══════════════════════════════════════════════════════════
console.log('\n-- output-channel.ts (source) --');

const channelSrc = readSrc('output-channel');

test('getChannel exported', () => has(channelSrc, 'export function getChannel'));
test('log exported', () => has(channelSrc, 'export function log'));
test('logError exported', () => has(channelSrc, 'export function logError'));
test('disposeChannel exported', () => has(channelSrc, 'export function disposeChannel'));
test('Only one OutputChannel created (singleton pattern)', () => {
    has(channelSrc, 'if (!_channel)');
    has(channelSrc, "_channel = vscode.window.createOutputChannel");
});
test('log format includes timestamp and feature prefix', () => {
    has(channelSrc, 'new Date()');
    has(channelSrc, '[${feature}]');
});
test('disposeChannel sets _channel to undefined', () => {
    has(channelSrc, '_channel = undefined');
});
test('No feature creates its own OutputChannel', () => {
    // The one createOutputChannel in output-channel.ts is the only one allowed
    const count = (channelSrc.match(/createOutputChannel/g) || []).length;
    eq(count, 1, 'Exactly one createOutputChannel call in output-channel.ts');
});

// Cleanup
fs.rmSync(TMP_WS, { recursive: true, force: true });

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
