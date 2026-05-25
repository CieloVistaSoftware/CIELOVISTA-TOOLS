/**
 * tests/unit/claude-notifier.test.js
 *
 * Unit tests for the claude-notifier module (enqueueIssue, readQueue,
 * markProcessed).  No VS Code dependency — the module is pure Node.js.
 *
 * Run: node tests/unit/claude-notifier.test.js
 * Requires: npm run compile  (needs out/shared/claude-notifier.js)
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const assert = require('assert');

// ── Load compiled module ──────────────────────────────────────────────────────
const OUT = path.join(__dirname, '../../out/shared/claude-notifier.js');

if (!fs.existsSync(OUT)) {
    console.error(`\n  SKIP: Compiled output not found at:\n  ${OUT}`);
    console.error('  Run: npm run compile\n');
    process.exit(0);
}

const { enqueueIssue, readQueue, markProcessed } = require(OUT);

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (err) { console.error(`  ✗ ${name}\n    → ${err.message}`); failed++; }
}

function ok(val, msg)  { assert.ok(val, msg); }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); }
function deepEq(a, b, msg) { assert.deepStrictEqual(a, b, msg); }

// ── Fixtures ──────────────────────────────────────────────────────────────────
const sampleBug = {
    id:             'bug-001',
    checkId:        'chk-catalog-registered',
    title:          'Catalog not registered',
    category:       'catalog',
    priority:       'high',
    detail:         'The command catalog is missing an entry.',
    recommendation: 'Run cvs.catalog.refresh to rebuild.',
};

function makeTempQueue() {
    return path.join(os.tmpdir(), `cvt-queue-test-${Date.now()}.json`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
console.log('\nclaude-notifier unit tests\n' + '─'.repeat(50));

test('enqueueIssue creates queue file when it does not exist', () => {
    const q = makeTempQueue();
    try {
        const r = enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42', q);
        ok(r.ok, 'result.ok must be true');
        ok(fs.existsSync(q), 'queue file must exist after first enqueue');
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('enqueueIssue writes a correctly shaped entry', () => {
    const q = makeTempQueue();
    try {
        enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42', q);
        const entries = JSON.parse(fs.readFileSync(q, 'utf8'));
        eq(entries.length, 1);
        const e = entries[0];
        eq(e.bugId,       sampleBug.id);
        eq(e.checkId,     sampleBug.checkId);
        eq(e.title,       sampleBug.title);
        eq(e.category,    sampleBug.category);
        eq(e.priority,    sampleBug.priority);
        eq(e.issueNumber, 42);
        eq(e.issueUrl,    'https://github.com/o/r/issues/42');
        eq(e.detail,      sampleBug.detail);
        eq(e.recommendation, sampleBug.recommendation);
        eq(e.processed,   false);
        ok(e.enqueuedAt,  'enqueuedAt must be set');
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('enqueueIssue appends a second distinct bug', () => {
    const q = makeTempQueue();
    try {
        enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42', q);
        enqueueIssue({ ...sampleBug, id: 'bug-002', title: 'Second bug' }, 43, 'https://github.com/o/r/issues/43', q);
        const entries = JSON.parse(fs.readFileSync(q, 'utf8'));
        eq(entries.length, 2, 'Two distinct bugs must produce two entries');
        eq(entries[1].bugId, 'bug-002');
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('enqueueIssue replaces existing entry with the same bugId', () => {
    const q = makeTempQueue();
    try {
        enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42', q);
        enqueueIssue({ ...sampleBug, title: 'Updated title' }, 99, 'https://github.com/o/r/issues/99', q);
        const entries = JSON.parse(fs.readFileSync(q, 'utf8'));
        eq(entries.length, 1, 'Same bugId must not create a duplicate entry');
        eq(entries[0].title,       'Updated title');
        eq(entries[0].issueNumber, 99);
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('enqueueIssue preserves other entries when replacing one', () => {
    const q = makeTempQueue();
    try {
        enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42', q);
        enqueueIssue({ ...sampleBug, id: 'bug-other', title: 'Other' }, 50, 'https://github.com/o/r/issues/50', q);
        enqueueIssue({ ...sampleBug, title: 'Replaced' }, 99, 'https://github.com/o/r/issues/99', q);
        const entries = JSON.parse(fs.readFileSync(q, 'utf8'));
        eq(entries.length, 2, 'Must still have exactly two entries');
        ok(entries.some(e => e.bugId === 'bug-other'), 'other entry must be preserved');
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('readQueue returns [] when file does not exist', () => {
    const q = makeTempQueue();
    deepEq(readQueue(q), [], 'must return empty array for missing file');
});

test('readQueue returns [] for empty / corrupt file', () => {
    const q = makeTempQueue();
    try {
        fs.writeFileSync(q, '{not valid json}', 'utf8');
        deepEq(readQueue(q), [], 'corrupt file must return empty array');
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('readQueue returns all written entries', () => {
    const q = makeTempQueue();
    try {
        enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42', q);
        enqueueIssue({ ...sampleBug, id: 'bug-002' }, 43, 'https://github.com/o/r/issues/43', q);
        const entries = readQueue(q);
        eq(entries.length, 2);
        eq(entries[0].bugId, 'bug-001');
        eq(entries[1].bugId, 'bug-002');
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('markProcessed sets processed:true on matching entry', () => {
    const q = makeTempQueue();
    try {
        enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42', q);
        const r = markProcessed('bug-001', q);
        ok(r.ok, 'markProcessed must return ok:true');
        const entries = JSON.parse(fs.readFileSync(q, 'utf8'));
        eq(entries[0].processed, true);
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('markProcessed is a no-op for unknown bugId', () => {
    const q = makeTempQueue();
    try {
        enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42', q);
        const r = markProcessed('does-not-exist', q);
        ok(r.ok, 'must still return ok:true for unknown id');
        const entries = JSON.parse(fs.readFileSync(q, 'utf8'));
        eq(entries[0].processed, false, 'unrelated entry must be untouched');
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('markProcessed only touches the targeted entry when multiple exist', () => {
    const q = makeTempQueue();
    try {
        enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42', q);
        enqueueIssue({ ...sampleBug, id: 'bug-002' }, 43, 'https://github.com/o/r/issues/43', q);
        markProcessed('bug-001', q);
        const entries = JSON.parse(fs.readFileSync(q, 'utf8'));
        eq(entries[0].processed, true,  'bug-001 must be processed');
        eq(entries[1].processed, false, 'bug-002 must be untouched');
    } finally { if (fs.existsSync(q)) fs.unlinkSync(q); }
});

test('markProcessed is safe when the queue file does not exist', () => {
    const q = makeTempQueue();
    const r = markProcessed('ghost-id', q);
    ok(r.ok, 'must return ok:true even when file is absent');
    ok(!fs.existsSync(q), 'must not create the file');
});

test('enqueueIssue returns ok:false on unwritable path', () => {
    const r = enqueueIssue(sampleBug, 42, 'https://github.com/o/r/issues/42',
        'Z:\\does\\not\\exist\\queue.json');
    eq(r.ok, false, 'must return ok:false for bad path');
    ok(typeof r.error === 'string', 'must include an error message');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('─'.repeat(50));
if (failed === 0) {
    console.log(`✓ All ${passed} tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} test(s) FAILED\n`);
    process.exit(1);
}
