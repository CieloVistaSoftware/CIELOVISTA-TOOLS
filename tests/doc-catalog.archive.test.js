// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * doc-catalog.archive.test.js
 *
 * Proves two things end-to-end:
 *
 * 1. UI — clicking the Archive button on a card, then clicking Yes:
 *    a) immediately hides the card (card.style.display === 'none')
 *    b) sends postMessage({ command: 'archive-doc', data: <path>, ... })
 *
 * 2. Backend — archiveDoc() from archive.ts:
 *    a) writes an entry to archived-docs.json (temp file)
 *    b) isArchived() returns true for that path
 *    c) restoreDoc() removes it and isArchived() returns false
 *
 * Run: node tests/doc-catalog.archive.test.js
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { JSDOM } = require('jsdom');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  ✓ ' + name); passed++; }
    catch (e) { console.error('  ✗ ' + name + '\n    → ' + e.message); failed++; }
}
function testAsync(name, fn) {
    return fn().then(() => { console.log('  ✓ ' + name); passed++; })
               .catch(e  => { console.error('  ✗ ' + name + '\n    → ' + e.message); failed++; });
}

// ────────────────────────────────────────────────────────────────────────────
// Part 1 — UI: catalog.html archive flow via JSDOM
// ────────────────────────────────────────────────────────────────────────────
console.log('\nPart 1 — UI: archive button hides card + fires postMessage\n' + '─'.repeat(60));

const CATALOG_HTML = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'catalog.html');
if (!fs.existsSync(CATALOG_HTML)) {
    console.error('FATAL: catalog.html not found at', CATALOG_HTML);
    process.exit(1);
}

const rawHtml = fs.readFileSync(CATALOG_HTML, 'utf8');

// Inject one synthetic card and the acquireVsCodeApi stub into the HTML so
// the webview script has something to operate on.
const FAKE_PATH  = '/fake/project/my-doc.md';
const FAKE_TITLE = 'My Test Doc';
const FAKE_PROJ  = 'fake-project';

const cardHtml = `
<div class="card" data-project="${FAKE_PROJ}" data-section="Docs">
  <div class="card-title" data-action="open-preview" data-path="${FAKE_PATH}">${FAKE_TITLE}</div>
  <div class="card-btns">
    <button class="btn-archive"
      data-action="archive-doc"
      data-path="${FAKE_PATH}"
      data-title="${FAKE_TITLE}"
      data-project="${FAKE_PROJ}">Archive</button>
  </div>
</div>`;

// Patch: insert card into #catalog div, and inject vscode stub before the script runs
const patchedHtml = rawHtml
    .replace('<div id="catalog"></div>', '<div id="catalog"><div class="cat-section"><div class="card-grid">' + cardHtml + '</div></div></div>')
    .replace(
        "'use strict';\n(function() {",
        "'use strict';\n(function() {\n  window.acquireVsCodeApi = function() { return window.__vscodeStub; };"
    );

// Build JSDOM synchronously — scripts run immediately
const dom = new JSDOM(patchedHtml, {
    runScripts: 'dangerously',
    url: 'http://localhost',
    beforeParse(window) {
        const messages = [];
        window.__vscodeStub = {
            postMessage: (msg) => messages.push(msg),
            getState: () => ({}),
            setState: () => {},
        };
        window.__postedMessages = messages;
    },
});

const { window } = dom;
const doc = window.document;

(function runUiTests() {
    const card = doc.querySelector('.card');
    if (!card) { console.error('FATAL: card not rendered in JSDOM'); process.exit(1); }

    test('card is initially visible (no display:none)', () => {
        assert.notStrictEqual(card.style.display, 'none', 'Card should be visible before archiving');
    });

    // Click the Archive button — this should replace footer with Yes/Cancel
    const archiveBtn = doc.querySelector('[data-action="archive-doc"]');
    assert.ok(archiveBtn, 'Archive button must exist');
    archiveBtn.click();

    test('clicking Archive shows inline Yes/Cancel confirmation', () => {
        const yesBtn = doc.querySelector('[data-action="archive-confirm"]');
        assert.ok(yesBtn, 'Yes button (data-action="archive-confirm") must appear after clicking Archive');
        const cancelBtn = doc.querySelector('[data-action="archive-cancel"]');
        assert.ok(cancelBtn, 'Cancel button (data-action="archive-cancel") must appear after clicking Archive');
    });

    // Click Cancel — should restore original buttons
    const cancelBtn = doc.querySelector('[data-action="archive-cancel"]');
    cancelBtn.click();

    test('clicking Cancel restores the Archive button', () => {
        const restored = doc.querySelector('[data-action="archive-doc"]');
        assert.ok(restored, 'Original Archive button should be restored after Cancel');
        const yesGone = doc.querySelector('[data-action="archive-confirm"]');
        assert.strictEqual(yesGone, null, 'Yes button should be gone after Cancel');
    });

    // Click Archive again, then Yes
    const archiveBtn2 = doc.querySelector('[data-action="archive-doc"]');
    archiveBtn2.click();
    const yesBtn = doc.querySelector('[data-action="archive-confirm"]');
    assert.ok(yesBtn, 'Yes button must appear for second archive attempt');
    yesBtn.click();

    test('clicking Yes sets card display:none immediately', () => {
        assert.strictEqual(card.style.display, 'none',
            'Card must be hidden immediately after confirming archive (display:none)');
    });

    test('clicking Yes fires postMessage with command archive-doc', () => {
        const msgs = window.__postedMessages || [];
        const archiveMsg = msgs.find(m => m.command === 'archive-doc');
        assert.ok(archiveMsg, 'postMessage({ command: "archive-doc" }) must be sent after Yes');
    });

    test('postMessage carries correct file path', () => {
        const msgs = window.__postedMessages || [];
        const archiveMsg = msgs.find(m => m.command === 'archive-doc');
        assert.ok(archiveMsg, 'archive-doc message must exist');
        assert.strictEqual(archiveMsg.data, FAKE_PATH, 'data must equal the card file path');
    });

    test('postMessage carries correct title', () => {
        const msgs = window.__postedMessages || [];
        const archiveMsg = msgs.find(m => m.command === 'archive-doc');
        assert.ok(archiveMsg, 'archive-doc message must exist');
        assert.strictEqual(archiveMsg.title, FAKE_TITLE, 'title must match the card title');
    });

    test('postMessage carries correct project name', () => {
        const msgs = window.__postedMessages || [];
        const archiveMsg = msgs.find(m => m.command === 'archive-doc');
        assert.ok(archiveMsg, 'archive-doc message must exist');
        assert.strictEqual(archiveMsg.project, FAKE_PROJ, 'project must match the card project');
    });
})();

// ────────────────────────────────────────────────────────────────────────────
// Part 2 — Backend: archiveDoc() writes to archived-docs.json
// ────────────────────────────────────────────────────────────────────────────
console.log('\nPart 2 — Backend: archiveDoc() writes entry to archived-docs.json\n' + '─'.repeat(60));

const ARCHIVE_JS = path.join(__dirname, '..', 'out', 'features', 'doc-catalog', 'archive.js');
if (!fs.existsSync(ARCHIVE_JS)) {
    console.error('SKIP: archive.js not compiled yet — run npm run compile first');
    console.log('\n' + passed + ' passed, ' + failed + ' failed (archive.js skipped)');
    if (failed > 0) { process.exit(1); }
    process.exit(0);
}

// Redirect ARCHIVE_FILE to a temp path so we never touch real data
const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-archive-test-'));
const tmpFile = path.join(tmpDir, 'archived-docs.json');

// Patch the module's ARCHIVE_FILE constant by monkey-patching require cache
// after load via a fresh require + rewire of the internal path.
// Simpler: rewrite the compiled JS temporarily to point to tmpFile.
const origJs     = fs.readFileSync(ARCHIVE_JS, 'utf8');
const patchedJs  = origJs.replace(
    /const ARCHIVE_FILE\s*=\s*path\.join\([^)]+\)/,
    `const ARCHIVE_FILE = ${JSON.stringify(tmpFile)}`
);

const tmpJs = path.join(tmpDir, 'archive-patched.js');
fs.writeFileSync(tmpJs, patchedJs, 'utf8');

const { archiveDoc, isArchived, restoreDoc, loadArchiveEntries } = require(tmpJs);

const TEST_PATH  = '/test/projects/my-doc.md';
const TEST_TITLE = 'My Doc';
const TEST_PROJ  = 'test-project';

test('archived-docs.json does not exist before first archive', () => {
    assert.ok(!fs.existsSync(tmpFile), 'Temp archive file should not exist yet');
});

archiveDoc(TEST_PATH, TEST_TITLE, TEST_PROJ);

test('archiveDoc() creates archived-docs.json', () => {
    assert.ok(fs.existsSync(tmpFile), 'archived-docs.json must be created by archiveDoc()');
});

test('archived-docs.json contains the archived entry', () => {
    const entries = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    assert.ok(Array.isArray(entries), 'archived-docs.json must be a JSON array');
    const entry = entries.find(e => e.filePath === TEST_PATH);
    assert.ok(entry, 'Entry with correct filePath must be present');
    assert.strictEqual(entry.title, TEST_TITLE, 'Entry title must match');
    assert.strictEqual(entry.projectName, TEST_PROJ, 'Entry projectName must match');
    assert.ok(entry.archivedAt, 'Entry must have archivedAt timestamp');
});

test('isArchived() returns true after archiving', () => {
    assert.strictEqual(isArchived(TEST_PATH), true);
});

test('archiveDoc() is idempotent — calling twice does not duplicate', () => {
    archiveDoc(TEST_PATH, TEST_TITLE, TEST_PROJ);
    const entries = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    const matches = entries.filter(e => e.filePath === TEST_PATH);
    assert.strictEqual(matches.length, 1, 'Must not create duplicate entries on second call');
});

restoreDoc(TEST_PATH);

test('restoreDoc() removes the entry from archived-docs.json', () => {
    const entries = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    const entry = entries.find(e => e.filePath === TEST_PATH);
    assert.strictEqual(entry, undefined, 'Entry must be gone after restoreDoc()');
});

test('isArchived() returns false after restoring', () => {
    assert.strictEqual(isArchived(TEST_PATH), false);
});

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

// ────────────────────────────────────────────────────────────────────────────
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exit(1); }
