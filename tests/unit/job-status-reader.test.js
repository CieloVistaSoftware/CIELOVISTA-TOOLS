/**
 * tests/unit/job-status-reader.test.js
 *
 * Unit tests for src/shared/job-status-reader.ts (issue #3 — Current Job panel).
 *
 * The module is pure Node (no vscode dependency), so we require the compiled
 * out/ build directly and inject `now` for deterministic time math.
 *
 * Run: node tests/unit/job-status-reader.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const outPath = path.join(__dirname, '../../out/shared/job-status-reader.js');
if (!fs.existsSync(outPath)) {
    console.error(`SKIP: ${outPath} not found - run npm run compile`);
    process.exit(0);
}

const jsr = require(outPath);

let passed = 0;
let failed = 0;
function check(label, fn) {
    try {
        fn();
        console.log(`  PASS - ${label}`);
        passed++;
    } catch (err) {
        console.log(`  FAIL - ${label}: ${err.message}`);
        failed++;
    }
}

console.log('\njob-status-reader unit tests\n' + '─'.repeat(60));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const T0 = Date.parse('2026-06-15T12:00:00.000Z');
const MIN = 60 * 1000;

function running(updatedOffsetMs = 0) {
    return {
        jobId: 'job-1',
        title: 'Pivot pico-LLM to RAG',
        startedAt: new Date(T0).toISOString(),
        updatedAt: new Date(T0 + updatedOffsetMs).toISOString(),
        etaIso: new Date(T0 + 5 * MIN).toISOString(),
        steps: [
            { name: 'Build index', status: 'done' },
            { name: 'Verify retrieval', status: 'active' },
            { name: 'Wire into CVT', status: 'pending' },
        ],
        detail: 'embedding chunks',
    };
}

// ── readJobStatus ───────────────────────────────────────────────────────────
check('readJobStatus returns null for a missing file', () => {
    const p = path.join(os.tmpdir(), 'cvt-nope-' + Date.now() + '.json');
    assert.strictEqual(jsr.readJobStatus(p), null);
});

check('readJobStatus returns null for malformed JSON', () => {
    const p = path.join(os.tmpdir(), 'cvt-bad-' + Date.now() + '.json');
    fs.writeFileSync(p, '{ not json');
    assert.strictEqual(jsr.readJobStatus(p), null);
    fs.unlinkSync(p);
});

check('writeJobStatus + readJobStatus round-trips a status', () => {
    const p = path.join(os.tmpdir(), 'cvt-rt-' + Date.now() + '.json');
    const s = running();
    jsr.writeJobStatus(p, s);
    const back = jsr.readJobStatus(p);
    assert.strictEqual(back.title, s.title);
    assert.strictEqual(back.steps.length, 3);
    fs.unlinkSync(p);
});

// ── summarizeJob: states ──────────────────────────────────────────────────────
check('summarizeJob → none when status is null', () => {
    assert.strictEqual(jsr.summarizeJob(null, T0).state, 'none');
});

check('summarizeJob → none when there are no steps', () => {
    const s = running();
    s.steps = [];
    assert.strictEqual(jsr.summarizeJob(s, T0).state, 'none');
});

check('summarizeJob → running for a fresh in-progress job', () => {
    const sum = jsr.summarizeJob(running(), T0 + 30 * 1000);
    assert.strictEqual(sum.state, 'running');
});

check('summarizeJob → stale when updatedAt is older than STALE_MS', () => {
    const old = T0 + 30 * 1000;            // updatedAt
    const now = old + jsr.STALE_MS + 1000; // well past staleness
    assert.strictEqual(jsr.summarizeJob(running(30 * 1000), now).state, 'stale');
});

check('summarizeJob → done when every step is done', () => {
    const s = running();
    s.steps = s.steps.map((st) => ({ name: st.name, status: 'done' }));
    const sum = jsr.summarizeJob(s, T0 + 30 * 1000);
    assert.strictEqual(sum.state, 'done');
    assert.strictEqual(sum.percent, 100);
});

// ── summarizeJob: derived numbers ─────────────────────────────────────────────
check('summarizeJob counts done/total and percent', () => {
    const sum = jsr.summarizeJob(running(), T0 + 30 * 1000);
    assert.strictEqual(sum.stepsDone, 1);
    assert.strictEqual(sum.stepsTotal, 3);
    assert.strictEqual(sum.percent, 33);
});

check('summarizeJob picks the active step name', () => {
    const sum = jsr.summarizeJob(running(), T0 + 30 * 1000);
    assert.strictEqual(sum.activeStepName, 'Verify retrieval');
});

check('summarizeJob computes elapsed text from startedAt', () => {
    const sum = jsr.summarizeJob(running(90 * 1000), T0 + 90 * 1000);
    assert.match(sum.elapsedText, /1m 30s/);
});

check('summarizeJob computes ETA text from etaIso', () => {
    const sum = jsr.summarizeJob(running(60 * 1000), T0 + 60 * 1000); // 4 min to eta
    assert.match(sum.etaText, /4m/);
});

check('summarizeJob ETA is em-dash when etaIso is absent or past', () => {
    const s = running();
    s.etaIso = null;
    assert.strictEqual(jsr.summarizeJob(s, T0 + 60 * 1000).etaText, '—');
});

check('summarizeJob exposes detail and the raw steps', () => {
    const sum = jsr.summarizeJob(running(), T0 + 30 * 1000);
    assert.strictEqual(sum.detail, 'embedding chunks');
    assert.strictEqual(sum.steps.length, 3);
});

console.log('');
if (failed > 0) {
    console.log(`FAILED ${failed} / ${passed + failed}`);
    process.exit(1);
}
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
