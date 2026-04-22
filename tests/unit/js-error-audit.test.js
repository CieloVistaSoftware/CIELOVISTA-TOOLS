/**
 * tests/unit/js-error-audit.test.js
 *
 * Unit tests for src/features/js-error-audit.ts pure logic.
 * Uses the _test export handle — no VS Code required.
 *
 * Covers:
 *   classifyFixKind()    — BARE_CATCH / NO_ERRLOG / NO_TRY_CATCH classification
 *   findIssueLine()      — line number detection from file content
 *   computeLCS()         — LCS algorithm on string arrays
 *   buildDiff()          — diff generation (add/del/eq lines)
 *   collapseDiff()       — context collapsing with ±N context lines
 *   mergeState()         — ID assignment and state persistence
 *   loadState()          — reads state JSON, graceful on missing file
 *   saveState()          — writes state JSON
 *   esc()                — HTML escaping
 *   findAuditJson()      — path helper
 *   findStateJson()      — path helper
 *
 * Run: node tests/unit/js-error-audit.test.js
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const Module = require('module');

// ── vscode mock ───────────────────────────────────────────────────────────────
const vscodeMock = {
    window: {
        createOutputChannel:  () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
        showErrorMessage:     () => Promise.resolve(),
        showWarningMessage:   () => Promise.resolve(),
        withProgress:         async (_o, fn) => fn({ report: () => {} }),
        createWebviewPanel:   () => ({ webview: { html: '', onDidReceiveMessage: () => {}, postMessage: () => {} }, reveal: () => {}, onDidDispose: () => {}, dispose: () => {} }),
    },
    workspace: { workspaceFolders: [], openTextDocument: async () => ({}) },
    commands:  { registerCommand: () => ({ dispose: () => {} }) },
    ProgressLocation: { Notification: 15 },
    ViewColumn: { One: 1, Beside: 2 },
    Range: class { constructor(sl,sc,el,ec){} },
    Selection: class { constructor(a,b){} },
    TextEditorRevealType: { InCenter: 2 },
};

const _orig = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_jea__' : _orig(req, ...args);
require.cache['__vs_jea__'] = { id: '__vs_jea__', filename: '__vs_jea__', loaded: true, exports: vscodeMock, parent: null, children: [], path: '', paths: [] };

// ── Load dependencies ─────────────────────────────────────────────────────────
for (const dep of ['output-channel', 'registry', 'anthropic-client']) {
    const p = path.join(__dirname, `../../out/shared/${dep}.js`);
    if (fs.existsSync(p)) { try { require(p); } catch { /* optional */ } }
}

const OUT = path.join(__dirname, '../../out/features/js-error-audit.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

const jea = require(OUT);
const t   = jea._test;
if (!t) { console.error('SKIP: _test not exported'); process.exit(0); }

// ── Temp workspace ────────────────────────────────────────────────────────────
const TMP = path.join(os.tmpdir(), `cvt-jea-${Date.now()}`);
fs.mkdirSync(path.join(TMP, 'data'), { recursive: true });

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function eq(a, b, msg)   { assert.strictEqual(a, b, msg); }
function ok(v, msg)      { assert.ok(v, msg); }
function deep(a, b, msg) { assert.deepStrictEqual(a, b, msg); }

console.log('\njs-error-audit unit tests\n' + '\u2500'.repeat(50));

// ═══════════════════════════════════════════════════════════
// esc()
// ═══════════════════════════════════════════════════════════
console.log('\n-- esc() --');

test('& → &amp;',         () => eq(t.esc('a & b'), 'a &amp; b'));
test('< → &lt;',          () => eq(t.esc('<script>'), '&lt;script&gt;'));
test('" → &quot;',        () => eq(t.esc('"x"'), '&quot;x&quot;'));
test('safe string intact', () => eq(t.esc('hello world'), 'hello world'));
test('empty string intact',() => eq(t.esc(''), ''));

// ═══════════════════════════════════════════════════════════
// classifyFixKind()
// ═══════════════════════════════════════════════════════════
console.log('\n-- classifyFixKind() --');

function makeViolation(issues) {
    return { file: 'test.js', tryCatchCount: 0, hasErrLog: false, severity: 'ERROR', issues };
}

test('bare catch issue → BARE_CATCH', () => {
    eq(t.classifyFixKind(makeViolation(['has bare catch block'])), 'BARE_CATCH');
});

test('ErrLog issue → NO_ERRLOG', () => {
    eq(t.classifyFixKind(makeViolation(['catch block missing ErrLog call'])), 'NO_ERRLOG');
});

test('no try/catch at all → NO_TRY_CATCH', () => {
    eq(t.classifyFixKind(makeViolation(['no error handling found'])), 'NO_TRY_CATCH');
});

test('empty issues → NO_TRY_CATCH (fallback)', () => {
    eq(t.classifyFixKind(makeViolation([])), 'NO_TRY_CATCH');
});

test('uses issue field (singular) when issues array absent', () => {
    const v = { file: 'x.js', tryCatchCount: 0, hasErrLog: false, severity: 'WARN', issue: 'bare catch found' };
    eq(t.classifyFixKind(v), 'BARE_CATCH');
});

test('bare catch takes priority over ErrLog in same issues list', () => {
    eq(t.classifyFixKind(makeViolation(['bare catch block', 'missing ErrLog'])), 'BARE_CATCH');
});

// ═══════════════════════════════════════════════════════════
// findIssueLine()
// ═══════════════════════════════════════════════════════════
console.log('\n-- findIssueLine() --');

test('returns 0 for non-existent file', () => {
    eq(t.findIssueLine('/does/not/exist.js', 'BARE_CATCH'), 0);
});

test('finds BARE_CATCH line — empty catch block', () => {
    const file = path.join(TMP, 'bare.js');
    fs.writeFileSync(file, 'function f() {\n  try { x(); } catch(e) {}\n}\n', 'utf8');
    const line = t.findIssueLine(file, 'BARE_CATCH');
    ok(line > 0, `Expected line > 0, got ${line}`);
    eq(line, 2, 'Bare catch is on line 2');
});

test('finds NO_ERRLOG line — catch block without ErrLog', () => {
    const file = path.join(TMP, 'noerr.js');
    fs.writeFileSync(file, 'function f() {\n  try { x(); }\n  catch (err) {\n    console.log(err);\n  }\n}\n', 'utf8');
    const line = t.findIssueLine(file, 'NO_ERRLOG');
    ok(line > 0, `Expected line > 0, got ${line}`);
    eq(line, 3, 'catch is on line 3');
});

test('returns 0 for NO_TRY_CATCH (no pattern to find)', () => {
    const file = path.join(TMP, 'notry.js');
    fs.writeFileSync(file, 'function f() {\n  doSomething();\n}\n', 'utf8');
    eq(t.findIssueLine(file, 'NO_TRY_CATCH'), 0);
});

// ═══════════════════════════════════════════════════════════
// computeLCS()
// ═══════════════════════════════════════════════════════════
console.log('\n-- computeLCS() --');

test('identical arrays → LCS is full length', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const lcs = t.computeLCS(arr, arr);
    eq(lcs.length, 4);
});

test('completely different arrays → empty LCS', () => {
    const lcs = t.computeLCS(['a', 'b', 'c'], ['x', 'y', 'z']);
    eq(lcs.length, 0);
});

test('partial overlap → correct LCS', () => {
    // ['a','b','c','d'] vs ['a','c','d','e'] → LCS = ['a','c','d']
    const lcs = t.computeLCS(['a','b','c','d'], ['a','c','d','e']);
    eq(lcs.length, 3);
    deep(lcs[0], [0, 0]); // 'a' at index 0,0
    deep(lcs[1], [2, 1]); // 'c' at index 2,1
    deep(lcs[2], [3, 2]); // 'd' at index 3,2
});

test('empty arrays → empty LCS', () => {
    eq(t.computeLCS([], []).length, 0);
    eq(t.computeLCS(['a'], []).length, 0);
    eq(t.computeLCS([], ['a']).length, 0);
});

test('returns empty for very large arrays (O(n²) cap)', () => {
    // 500 × 500 = 250,000 > 200,000 cap → returns []
    const big = Array.from({ length: 500 }, (_, i) => String(i));
    const lcs = t.computeLCS(big, big);
    eq(lcs.length, 0, 'Large arrays capped → empty LCS');
});

// ═══════════════════════════════════════════════════════════
// buildDiff()
// ═══════════════════════════════════════════════════════════
console.log('\n-- buildDiff() --');

test('identical content → all eq lines', () => {
    const src = 'line one\nline two\nline three';
    const diff = t.buildDiff(src, src);
    ok(diff.every(d => d.kind === 'eq'), 'All lines must be eq for identical content');
    eq(diff.length, 3);
});

test('added line → appears as add in diff', () => {
    const before = 'line one\nline three';
    const after  = 'line one\nline two\nline three';
    const diff   = t.buildDiff(before, after);
    ok(diff.some(d => d.kind === 'add' && d.text === 'line two'), 'Added line must appear as add');
});

test('removed line → appears as del in diff', () => {
    const before = 'line one\nline two\nline three';
    const after  = 'line one\nline three';
    const diff   = t.buildDiff(before, after);
    ok(diff.some(d => d.kind === 'del' && d.text === 'line two'), 'Removed line must appear as del');
});

test('changed line → del then add', () => {
    const before = 'function f() {}';
    const after  = 'async function f() {}';
    const diff   = t.buildDiff(before, after);
    ok(diff.some(d => d.kind === 'del'), 'Changed line must have a del');
    ok(diff.some(d => d.kind === 'add'), 'Changed line must have an add');
});

test('every line has kind field', () => {
    const diff = t.buildDiff('a\nb\nc', 'a\nx\nc');
    ok(diff.every(d => ['add', 'del', 'eq'].includes(d.kind)), 'Every line must have valid kind');
});

test('eq lines have lineNo set', () => {
    const diff = t.buildDiff('line one', 'line one');
    const eq_  = diff.find(d => d.kind === 'eq');
    ok(eq_ && eq_.lineNo !== null, 'eq lines must have lineNo');
});

// ═══════════════════════════════════════════════════════════
// collapseDiff()
// ═══════════════════════════════════════════════════════════
console.log('\n-- collapseDiff() --');

test('no changes → empty collapsed diff', () => {
    const diff     = t.buildDiff('a\nb\nc\nd\ne', 'a\nb\nc\nd\ne');
    const collapsed = t.collapseDiff(diff, 3);
    eq(collapsed.length, 0, 'Unchanged diff should collapse to nothing');
});

test('single change → shows change with context lines', () => {
    // 10 unchanged lines, then 1 changed, then 10 more
    const before = Array.from({length:10}, (_,i) => `line ${i+1}`).join('\n');
    const after  = Array.from({length:10}, (_,i) => i === 5 ? 'CHANGED' : `line ${i+1}`).join('\n');
    const diff   = t.buildDiff(before, after);
    const collapsed = t.collapseDiff(diff, 3);
    ok(collapsed.length > 0, 'Must show some lines');
    ok(collapsed.length < diff.length, 'Must be shorter than full diff');
    ok(collapsed.some(d => d.kind === 'del' || d.kind === 'add'), 'Must contain the change');
});

test('context=0 → only changed lines shown', () => {
    const before = 'alpha\nbeta\ngamma\ndelta\nepsilon';
    const after  = 'alpha\nXXX\ngamma\ndelta\nepsilon';
    const diff   = t.buildDiff(before, after);
    const collapsed = t.collapseDiff(diff, 0);
    // With context=0, only the changed lines themselves appear
    const nonEq = collapsed.filter(d => d.kind !== 'eq');
    ok(nonEq.length > 0, 'Must show changed lines');
    const eq_ = collapsed.filter(d => d.kind === 'eq');
    eq(eq_.length, 0, 'context=0 must not include unchanged lines');
});

// ═══════════════════════════════════════════════════════════
// State management: loadState, saveState, mergeState
// ═══════════════════════════════════════════════════════════
console.log('\n-- State management --');

test('loadState returns empty state for missing file', () => {
    const state = t.loadState(path.join(TMP, 'no-such-dir'));
    deep(state, { entries: [], lastSeen: '' });
});

test('saveState + loadState round-trip', () => {
    const state = {
        entries: [{ id: 'ERR-001', file: 'src/app.js', severity: 'ERROR', fixKind: 'NO_TRY_CATCH', issues: ['no error handling'], status: 'open' }],
        lastSeen: '2025-01-01T00:00:00.000Z',
    };
    t.saveState(TMP, state);
    const loaded = t.loadState(TMP);
    eq(loaded.entries.length, 1);
    eq(loaded.entries[0].id, 'ERR-001');
    eq(loaded.lastSeen, state.lastSeen);
});

test('mergeState assigns ERR-NNN IDs to violations', () => {
    // Fresh state (no existing entries)
    const stateFile = t.findStateJson(TMP);
    if (fs.existsSync(stateFile)) { fs.unlinkSync(stateFile); }

    const report = {
        violations: [
            { file: 'src/alpha.js', tryCatchCount: 0, hasErrLog: false, severity: 'ERROR', issues: ['no error handling'] },
            { file: 'src/beta.js',  tryCatchCount: 0, hasErrLog: false, severity: 'ERROR', issues: ['no error handling'] },
        ],
        warnings: [],
        clean: [],
        scannedAt: new Date().toISOString(),
    };

    const state = t.mergeState(TMP, report);
    eq(state.entries.length, 2);
    eq(state.entries[0].id, 'ERR-001');
    eq(state.entries[1].id, 'ERR-002');
    eq(state.entries[0].severity, 'ERROR');
    eq(state.entries[0].status, 'open');
});

test('mergeState assigns WRN-NNN IDs to warnings', () => {
    const stateFile = t.findStateJson(TMP);
    if (fs.existsSync(stateFile)) { fs.unlinkSync(stateFile); }

    const report = {
        violations: [],
        warnings: [
            { file: 'src/gamma.js', tryCatchCount: 1, hasErrLog: false, severity: 'WARN', issues: ['bare catch block'] },
        ],
        clean: [],
        scannedAt: new Date().toISOString(),
    };

    const state = t.mergeState(TMP, report);
    eq(state.entries.length, 1);
    eq(state.entries[0].id, 'WRN-001');
    eq(state.entries[0].severity, 'WARN');
});

test('mergeState preserves existing entry IDs on re-scan', () => {
    const stateFile = t.findStateJson(TMP);
    if (fs.existsSync(stateFile)) { fs.unlinkSync(stateFile); }

    const report1 = {
        violations: [{ file: 'src/alpha.js', tryCatchCount: 0, hasErrLog: false, severity: 'ERROR', issues: ['no error handling'] }],
        warnings: [], clean: [], scannedAt: new Date().toISOString(),
    };
    const state1 = t.mergeState(TMP, report1);
    eq(state1.entries[0].id, 'ERR-001');

    // Re-scan with same file — ID must be preserved
    const report2 = {
        violations: [{ file: 'src/alpha.js', tryCatchCount: 0, hasErrLog: false, severity: 'ERROR', issues: ['still no error handling'] }],
        warnings: [], clean: [], scannedAt: new Date().toISOString(),
    };
    const state2 = t.mergeState(TMP, report2);
    eq(state2.entries[0].id, 'ERR-001', 'ID must be preserved on re-scan');
    eq(state2.entries[0].issues[0], 'still no error handling', 'Issues must be updated');
});

test('mergeState classifies fix kind for each entry', () => {
    const stateFile = t.findStateJson(TMP);
    if (fs.existsSync(stateFile)) { fs.unlinkSync(stateFile); }

    const report = {
        violations: [
            { file: 'a.js', tryCatchCount: 0, hasErrLog: false, severity: 'ERROR', issues: ['bare catch block found'] },
            { file: 'b.js', tryCatchCount: 1, hasErrLog: false, severity: 'ERROR', issues: ['catch block missing ErrLog'] },
            { file: 'c.js', tryCatchCount: 0, hasErrLog: false, severity: 'ERROR', issues: ['no error handling'] },
        ],
        warnings: [], clean: [], scannedAt: new Date().toISOString(),
    };

    const state = t.mergeState(TMP, report);
    eq(state.entries[0].fixKind, 'BARE_CATCH');
    eq(state.entries[1].fixKind, 'NO_ERRLOG');
    eq(state.entries[2].fixKind, 'NO_TRY_CATCH');
});

// ═══════════════════════════════════════════════════════════
// Path helpers
// ═══════════════════════════════════════════════════════════
console.log('\n-- Path helpers --');

test('findAuditJson returns path ending in js-error-audit.json', () => {
    ok(t.findAuditJson('/some/root').endsWith('js-error-audit.json'));
});

test('findStateJson returns path ending in js-error-audit-state.json', () => {
    ok(t.findStateJson('/some/root').endsWith('js-error-audit-state.json'));
});

test('both paths are inside data/ directory', () => {
    ok(t.findAuditJson('/root').includes('data'));
    ok(t.findStateJson('/root').includes('data'));
});

// Cleanup
fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '\u2500'.repeat(50));
if (failed === 0) { console.log(`\u2713 All ${passed} tests passed\n`); process.exit(0); }
else { console.error(`\n\u2717 ${failed} test(s) FAILED\n`); process.exit(1); }
