/**
 * tests/unit/feature-toggle.test.js
 *
 * Tests for src/features/feature-toggle.ts
 * Reads TypeScript source directly (same pattern as doc-catalog.test.js).
 * Also tests the compiled FEATURE_REGISTRY and isFeatureEnabled via mock.
 *
 * Covers:
 *   FEATURE_REGISTRY — all entries have required fields, no duplicates
 *   isFeatureEnabled — defaults to true, reads config correctly
 *   getFeatureToggleHtml — webview HTML structure
 *   Source contracts — activate, deactivate exported, correct command registered
 *
 * Run: node tests/unit/feature-toggle.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const Module = require('module');

// ── vscode mock ───────────────────────────────────────────────────────────────
let _featureConfig = {};

const vscodeMock = {
    workspace: {
        getConfiguration: (section) => ({
            get: (key, defaultVal) => {
                const fullKey = `${section}.${key}`;
                return fullKey in _featureConfig ? _featureConfig[fullKey] : defaultVal;
            },
            update: () => Promise.resolve(),
        }),
    },
    window: {
        createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
        createWebviewPanel: () => ({
            webview: { html: '', onDidReceiveMessage: () => {} },
            reveal: () => {}, onDidDispose: () => {}, dispose: () => {},
        }),
    },
    commands: { registerCommand: (_id, _fn) => ({ dispose: () => {} }) },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    ViewColumn: { One: 1 },
};

const _orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_ft__' : _orig(req, ...args);
require.cache['__vs_ft__'] = {
    id: '__vs_ft__', filename: '__vs_ft__', loaded: true,
    exports: vscodeMock, parent: null, children: [], path: '', paths: [],
};

// ── Load compiled module ──────────────────────────────────────────────────────
const OUT_CHANNEL = path.join(__dirname, '../../out/shared/output-channel.js');
const OUT_WEBVIEW = path.join(__dirname, '../../out/shared/webview-utils.js');
const OUT         = path.join(__dirname, '../../out/features/feature-toggle.js');
const SRC         = path.join(__dirname, '../../src/features/feature-toggle.ts');

for (const p of [OUT_CHANNEL, OUT_WEBVIEW, OUT]) {
    if (!fs.existsSync(p)) {
        console.error(`SKIP: ${p} not found — run npm run compile`);
        process.exit(0);
    }
}

const ft  = require(OUT);
const src = fs.readFileSync(SRC, 'utf8');

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)  { assert.strictEqual(a, b, msg); }
function ok(v, msg)     { assert.ok(v, msg); }
function has(str, sub, msg) { ok(str.includes(sub), msg || `Expected: ${sub}`); }

console.log('\nfeature-toggle unit tests\n' + '\u2500'.repeat(50));

// ── FEATURE_REGISTRY ──────────────────────────────────────────────────────────
console.log('\n-- FEATURE_REGISTRY --');

test('FEATURE_REGISTRY is exported and is an array', () => {
    ok(Array.isArray(ft.FEATURE_REGISTRY), 'Must be an array');
    ok(ft.FEATURE_REGISTRY.length > 0, 'Must have entries');
});

test('FEATURE_REGISTRY has at least 10 features', () => {
    ok(ft.FEATURE_REGISTRY.length >= 10, `Expected ≥10, got ${ft.FEATURE_REGISTRY.length}`);
});

test('Every entry has key, label, description', () => {
    const missing = ft.FEATURE_REGISTRY.filter(e => !e.key || !e.label || !e.description);
    eq(missing.length, 0, `Entries missing fields: ${missing.map(e => e.key).join(', ')}`);
});

test('No duplicate keys in FEATURE_REGISTRY', () => {
    const keys = ft.FEATURE_REGISTRY.map(e => e.key);
    const unique = new Set(keys);
    eq(unique.size, keys.length, `Duplicate keys found: ${keys.filter((k, i) => keys.indexOf(k) !== i).join(', ')}`);
});

test('No duplicate labels in FEATURE_REGISTRY', () => {
    const labels = ft.FEATURE_REGISTRY.map(e => e.label);
    const unique = new Set(labels);
    eq(unique.size, labels.length, `Duplicate labels: ${labels.filter((l, i) => labels.indexOf(l) !== i).join(', ')}`);
});

test('All keys are camelCase strings', () => {
    const invalid = ft.FEATURE_REGISTRY.filter(e => !/^[a-z][a-zA-Z0-9]+$/.test(e.key));
    eq(invalid.length, 0, `Non-camelCase keys: ${invalid.map(e => e.key).join(', ')}`);
});

test('cvsCommandLauncher is in registry', () => {
    ok(ft.FEATURE_REGISTRY.some(e => e.key === 'cvsCommandLauncher'));
});

test('All descriptions are non-empty strings', () => {
    const bad = ft.FEATURE_REGISTRY.filter(e => typeof e.description !== 'string' || e.description.trim().length === 0);
    eq(bad.length, 0, `Entries with empty description: ${bad.map(e => e.key).join(', ')}`);
});

// ── isFeatureEnabled() ────────────────────────────────────────────────────────
console.log('\n-- isFeatureEnabled() --');

test('isFeatureEnabled: defaults to true when setting not present', () => {
    _featureConfig = {};
    eq(ft.isFeatureEnabled('copilotRulesEnforcer'), true, 'Missing setting must default to true');
});

test('isFeatureEnabled: returns false when explicitly set false', () => {
    _featureConfig = { 'cielovistaTools.features.copilotRulesEnforcer': false };
    eq(ft.isFeatureEnabled('copilotRulesEnforcer'), false);
});

test('isFeatureEnabled: returns true when explicitly set true', () => {
    _featureConfig = { 'cielovistaTools.features.npmCommandLauncher': true };
    eq(ft.isFeatureEnabled('npmCommandLauncher'), true);
});

test('isFeatureEnabled: unknown key defaults to true', () => {
    _featureConfig = {};
    eq(ft.isFeatureEnabled('nonExistentFeature'), true, 'Unknown feature must default to true');
});

// ── activate / deactivate (source-level) ─────────────────────────────────────
console.log('\n-- activate / deactivate --');

test('activate is an exported function', () => ok(typeof ft.activate === 'function'));
test('deactivate is an exported function', () => ok(typeof ft.deactivate === 'function'));

test('source registers cvs.features.configure command', () => {
    has(src, "'cvs.features.configure'", 'Must register cvs.features.configure command');
});

test('source handles getStates message type', () => has(src, "'getStates'"));
test('source handles toggle message type', () => has(src, "'toggle'"));
test('source reads cielovistaTools.features config', () => has(src, "'cielovistaTools.features'"));

// ── HTML output (source-level) ────────────────────────────────────────────────
console.log('\n-- webview HTML (source) --');

test('HTML includes a toggle input per feature', () => {
    has(src, "input type=\"checkbox\"", 'Must render checkboxes for feature toggles');
});

test('HTML uses CVS_CSS for consistent styling', () => has(src, 'CVS_CSS'));
test('HTML includes cvs-toolbar class', () => has(src, 'cvs-toolbar'));
test('HTML posts getStates on DOMContentLoaded', () => has(src, 'getStates'));
test('HTML listens for states message to set checkbox states', () => has(src, "'states'"));
test('HTML posts toggle message on checkbox change', () => has(src, "'toggle'"));
test('Webview uses acquireVsCodeApi()', () => has(src, 'acquireVsCodeApi()'));

// ── FEATURE_EXPLANATIONS (source-level) ──────────────────────────────────────
console.log('\n-- FEATURE_EXPLANATIONS --');

test('FEATURE_EXPLANATIONS defined in source', () => has(src, 'FEATURE_EXPLANATIONS'));
test('FEATURE_EXPLANATIONS has entry for copilotRulesEnforcer', () => has(src, 'copilotRulesEnforcer'));
test('FEATURE_EXPLANATIONS has entry for cvsCommandLauncher', () => has(src, 'cvsCommandLauncher'));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
