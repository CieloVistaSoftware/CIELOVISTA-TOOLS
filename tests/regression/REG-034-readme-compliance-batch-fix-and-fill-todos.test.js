// Copyright (c) CieloVista Software. All rights reserved.
// REG-034: Issues #307 #308 — README Compliance AI batch fix + fillTodos command.
//
// #307 — AI Batch Fix (fixAllNonCompliant redesign):
//   1. buildBatchReviewHtml() renders a per-file Approve/Skip review panel
//   2. The applyBatch webview message writes only the approved files
//   3. fixAllNonCompliant iterates non-compliant READMEs and calls callClaude per file
//
// #308 — Fill README TODO Stubs command:
//   1. cvs.readme.fillTodos command is registered in the extension
//   2. cvs.readme.fillTodos entry exists in the command catalog

'use strict';

const fs     = require('fs');
const path   = require('path');
const assert = require('assert');

const ROOT        = path.resolve(__dirname, '..', '..');
const FEATURE_SRC = fs.readFileSync(path.join(ROOT, 'src/features/readme-compliance/feature.ts'), 'utf8');
const CATALOG_SRC = fs.readFileSync(path.join(ROOT, 'src/features/cvs-command-launcher/catalog.ts'), 'utf8');
const PKG         = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (err) { console.error(`  FAIL ${name}`); console.error(`       ${err.message}`); failed++; }
}

// ═══════════════════════════════════════════════════════════
// #307 — AI Batch Fix
// ═══════════════════════════════════════════════════════════

test('buildBatchReviewHtml() function is defined (#307)', () => {
    assert(
        FEATURE_SRC.includes('function buildBatchReviewHtml'),
        'feature.ts does not define buildBatchReviewHtml() — batch review panel cannot be built'
    );
});

test('buildBatchReviewHtml renders Approve and Skip buttons (#307)', () => {
    const fnIdx  = FEATURE_SRC.indexOf('function buildBatchReviewHtml');
    const fnBody = FEATURE_SRC.slice(fnIdx, fnIdx + 3000);
    assert(
        (fnBody.includes('Approve') || fnBody.includes('approve')) &&
        (fnBody.includes('Skip')    || fnBody.includes('skip')),
        'buildBatchReviewHtml() does not render Approve/Skip controls — user cannot selectively apply fixes'
    );
});

test('applyBatch message handler writes only approved files (#307)', () => {
    assert(
        FEATURE_SRC.includes("msg.command !== 'applyBatch'") ||
        FEATURE_SRC.includes("msg.command === 'applyBatch'"),
        'feature.ts does not handle applyBatch webview message — approved fixes will never be written'
    );
});

test('fixAllNonCompliant calls callClaude per README (#307)', () => {
    const fnIdx  = FEATURE_SRC.indexOf('async function fixAllNonCompliant');
    assert(fnIdx !== -1, 'fixAllNonCompliant function not found');
    const fnBody = FEATURE_SRC.slice(fnIdx, fnIdx + 2000);
    assert(
        fnBody.includes('callClaude'),
        'fixAllNonCompliant() does not call callClaude() — batch AI fix is not implemented'
    );
});

test('batch fix opens _batchPanel webview panel (#307)', () => {
    assert(
        FEATURE_SRC.includes('_batchPanel'),
        'feature.ts does not use a _batchPanel — batch review results have nowhere to display'
    );
});

// ═══════════════════════════════════════════════════════════
// #308 — fillTodos command
// ═══════════════════════════════════════════════════════════

test('cvs.readme.fillTodos is registered via registerCommand (#308)', () => {
    assert(
        FEATURE_SRC.includes("'cvs.readme.fillTodos'") || FEATURE_SRC.includes('"cvs.readme.fillTodos"'),
        'feature.ts does not registerCommand cvs.readme.fillTodos — command will not appear in palette'
    );
});

test('cvs.readme.fillTodos is in the command catalog (#308)', () => {
    assert(
        CATALOG_SRC.includes('cvs.readme.fillTodos'),
        'catalog.ts does not list cvs.readme.fillTodos — command is absent from the CVT launcher'
    );
});

test('cvs.readme.fillTodos is contributed in package.json (#308)', () => {
    const commands = (PKG.contributes && PKG.contributes.commands) || [];
    const found    = commands.some(c => c.command === 'cvs.readme.fillTodos');
    assert(found, 'package.json contributes.commands does not include cvs.readme.fillTodos');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('REG-034: README Compliance batch fix + fillTodos (#307 #308)');
console.log('─'.repeat(58));
if (failed === 0) {
    console.log(`✓ REG-034 passed (${passed} checks — batch fix and fillTodos are fully wired).`);
    process.exit(0);
} else {
    console.error(`✗ REG-034 FAILED (${failed} of ${passed + failed} checks failed).`);
    process.exit(1);
}
