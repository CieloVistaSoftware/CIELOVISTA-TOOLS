// Copyright (c) CieloVista Software. All rights reserved.
// REG-032: Issue #290 — Broken Refs scan opens panel immediately with progress bar.
//
// Before fix: panel only appeared after the full async scan completed (~30s for 19 projects).
// After fix:
//   1. buildScanningHtml() renders an immediate progress UI with a bar and ETA label
//   2. attachPanelHandlers() wires up the JS that animates the bar during scan
//   3. panel.webview.html is set to buildScanningHtml BEFORE the async scan begins
//   4. Each project scans in a yielding loop (setTimeout(0)) so VS Code stays responsive

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT    = path.resolve(__dirname, '..', '..');
const SRC     = fs.readFileSync(path.join(ROOT, 'src/features/docs-broken-refs.ts'), 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (err) { console.error(`  FAIL ${name}`); console.error(`       ${err.message}`); failed++; }
}

// ─── 1. buildScanningHtml function exists ─────────────────────────────────────

test('buildScanningHtml() function is defined', () => {
    assert(
        SRC.includes('function buildScanningHtml'),
        'docs-broken-refs.ts does not define buildScanningHtml() — panel will stay blank until scan finishes'
    );
});

// ─── 2. Progress bar element in scanning HTML ─────────────────────────────────

test('buildScanningHtml renders a progress bar element', () => {
    // The function returns an HTML string — search up to 1500 chars to cover the full template
    const fnStart = SRC.indexOf('function buildScanningHtml');
    const fnBody  = SRC.slice(fnStart, fnStart + 1500);
    assert(
        fnBody.includes('prog-fill') || fnBody.includes('prog-bg') || fnBody.includes('progressBar'),
        'buildScanningHtml does not include a progress bar element — user sees no visual feedback'
    );
});

// ─── 3. ETA label in scanning HTML ───────────────────────────────────────────

test('buildScanningHtml includes an ETA label', () => {
    assert(
        SRC.includes('ETA'),
        'docs-broken-refs.ts does not reference ETA — user gets no time estimate during scan'
    );
});

// ─── 4. attachPanelHandlers function exists ───────────────────────────────────

test('attachPanelHandlers() function is defined', () => {
    assert(
        SRC.includes('function attachPanelHandlers'),
        'docs-broken-refs.ts does not define attachPanelHandlers() — progress bar JS will never be wired up'
    );
});

// ─── 5. Panel HTML set to scanning view BEFORE async scan ────────────────────

test('panel.webview.html assigned buildScanningHtml result before scan await', () => {
    // The sequence must be: set HTML → then await scan.
    // Verify buildScanningHtml call appears before the first scan-related await.
    const scanningIdx = SRC.indexOf('buildScanningHtml(');
    const awaitIdx    = SRC.indexOf('await new Promise', scanningIdx);
    assert(scanningIdx !== -1, 'buildScanningHtml() is never called');
    assert(
        awaitIdx > scanningIdx,
        'buildScanningHtml() call does not appear before the first await — panel still opens late'
    );
});

// ─── 6. Yielding setTimeout in scan loop ─────────────────────────────────────

test('scan loop yields to event loop via setTimeout(0)', () => {
    assert(
        SRC.includes('setTimeout(resolve, 0)') || SRC.includes('setTimeout(resolve,0)'),
        'docs-broken-refs.ts does not yield between projects — VS Code UI will freeze during long scans'
    );
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('REG-032: Broken Refs progressive scan (#290)');
console.log('─'.repeat(50));
if (failed === 0) {
    console.log(`✓ REG-032 passed (${passed} checks — panel opens immediately with progress bar).`);
    process.exit(0);
} else {
    console.error(`✗ REG-032 FAILED (${failed} of ${passed + failed} checks failed).`);
    process.exit(1);
}
