// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * doc-catalog.archive.test.js
 *
 * Verifies the full archive flow after fix for issues #238 and #239.
 *
 * #238 root cause: catalog.html called window.confirm() before posting
 *   archive-doc.  VS Code webviews are sandboxed — confirm() always returns
 *   false, so the message was never sent and nothing was archived.
 *
 * Fix: catalog.html now posts { command: 'archive-doc-confirm', ... } directly.
 *   The extension host handles it with vscode.window.showWarningMessage
 *   (modal: true). On confirmation the host calls archiveDoc() and posts
 *   { command: 'remove-card', filePath } back to the webview.
 *
 * Tests:
 *   Part 0 — Static source checks (no confirm(), correct command names)
 *   Part 1 — JSDOM UI: clicking Archive posts archive-doc-confirm
 *             remove-card message from host removes the card
 *   Part 2 — Extension host static: commands.ts has archive-doc-confirm handler
 *             with showWarningMessage + modal:true
 *   Part 3 — Backend: archiveDoc() / isArchived() / restoreDoc() roundtrip
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

const CATALOG_HTML = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'catalog.html');
const COMMANDS_TS  = path.join(__dirname, '..', 'src', 'features', 'doc-catalog', 'commands.ts');
const ARCHIVE_JS   = path.join(__dirname, '..', 'out', 'features', 'doc-catalog', 'archive.js');

for (const p of [CATALOG_HTML, COMMANDS_TS]) {
    if (!fs.existsSync(p)) { console.error('FATAL: missing', p); process.exit(1); }
}

const shellSrc    = fs.readFileSync(CATALOG_HTML, 'utf8').replace(/\r\n/g, '\n');
const commandsSrc = fs.readFileSync(COMMANDS_TS,  'utf8').replace(/\r\n/g, '\n');

// ─────────────────────────────────────────────────────────────────────────────
// Part 0 — Static source checks
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPart 0 — Static source checks\n' + '─'.repeat(60));

test('catalog.html archive-doc handler does NOT call confirm()', () => {
    const idx = shellSrc.indexOf("a === 'archive-doc'");
    assert.ok(idx !== -1, 'archive-doc branch must exist');
    const slice = shellSrc.slice(idx, idx + 300);
    assert.ok(!slice.includes('confirm('), 'confirm() must be absent — VS Code webviews do not support it');
});

test("catalog.html archive-doc handler posts 'archive-doc-confirm'", () => {
    const idx = shellSrc.indexOf("a === 'archive-doc'");
    const slice = shellSrc.slice(idx, idx + 400);
    assert.ok(
        slice.includes("command: 'archive-doc-confirm'"),
        "archive-doc handler must post 'archive-doc-confirm' so the host shows the native dialog"
    );
});

test("catalog.html archive-doc handler does NOT post 'archive-doc' directly", () => {
    const idx = shellSrc.indexOf("a === 'archive-doc'");
    const slice = shellSrc.slice(idx, idx + 400);
    assert.ok(
        !slice.includes("command: 'archive-doc'"),
        "webview must not post 'archive-doc' directly — confirmation must go through the host"
    );
});

test("commands.ts has 'archive-doc-confirm' case", () => {
    assert.ok(
        commandsSrc.includes("case 'archive-doc-confirm':"),
        "commands.ts must handle 'archive-doc-confirm'"
    );
});

test('commands.ts archive-doc-confirm uses showWarningMessage with modal:true', () => {
    const idx = commandsSrc.indexOf("case 'archive-doc-confirm':");
    assert.ok(idx !== -1, 'case must exist');
    const slice = commandsSrc.slice(idx, idx + 900);
    assert.ok(slice.includes('showWarningMessage'), 'must call showWarningMessage');
    assert.ok(slice.includes('modal: true'), 'dialog must be modal');
});

test('commands.ts archive-doc-confirm posts remove-card on confirmation', () => {
    const idx = commandsSrc.indexOf("case 'archive-doc-confirm':");
    const slice = commandsSrc.slice(idx, idx + 900);
    assert.ok(slice.includes("command: 'remove-card'"), 'must post remove-card so the webview hides the card');
});

test('commands.ts archive-doc-confirm calls archiveDoc()', () => {
    const idx = commandsSrc.indexOf("case 'archive-doc-confirm':");
    const slice = commandsSrc.slice(idx, idx + 900);
    assert.ok(slice.includes('archiveDoc('), 'must call archiveDoc() to persist entry');
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — JSDOM UI: clicking Archive posts archive-doc-confirm
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPart 1 — JSDOM UI: Archive button → archive-doc-confirm message\n' + '─'.repeat(60));

const FAKE_PATH  = '/fake/project/my-doc.md';
const FAKE_TITLE = 'My Test Doc';
const FAKE_PROJ  = 'fake-project';

const cardHtml = `
<div class="card" data-project="${FAKE_PROJ}" data-section="Docs">
  <div class="card-title" data-path="${FAKE_PATH}">${FAKE_TITLE}</div>
  <div class="card-btns">
    <button class="btn-archive"
      data-action="archive-doc"
      data-path="${FAKE_PATH}"
      data-title="${FAKE_TITLE}"
      data-project="${FAKE_PROJ}">Archive</button>
  </div>
</div>`;

const patchedHtml = shellSrc
    .replace(
        '<div id="catalog"></div>',
        '<div id="catalog"><div class="cat-section"><div class="card-grid">' + cardHtml + '</div></div></div>'
    )
    .replace(
        "'use strict';\n(function() {",
        "'use strict';\n(function() {\n  window.acquireVsCodeApi = function(){ return window.__vscodeStub; };"
    );

const messages = [];
const dom = new JSDOM(patchedHtml, {
    runScripts: 'dangerously',
    url: 'http://localhost',
    beforeParse(win) {
        win.__vscodeStub = {
            postMessage: (msg) => messages.push(msg),
            getState:    () => ({}),
            setState:    () => {},
        };
        // Set acquireVsCodeApi directly — string-patching the HTML is fragile
        win.acquireVsCodeApi = function() { return win.__vscodeStub; };
        win.requestAnimationFrame = (fn) => setTimeout(fn, 0);
        // If confirm() is called it means the fix was reverted — fail hard
        win.confirm = () => { throw new Error('confirm() must not be called in a VS Code webview'); };
    },
});

const { window: win } = dom;
const doc = win.document;

test('card is initially visible', () => {
    const card = doc.querySelector('.card');
    assert.ok(card, 'card must exist in DOM');
    assert.notStrictEqual(card.style.display, 'none');
});

test('clicking Archive does NOT call confirm()', () => {
    const btn = doc.querySelector('[data-action="archive-doc"]');
    assert.ok(btn, 'archive button must exist');
    assert.doesNotThrow(() => btn.click(), 'confirm() must not be called');
});

test("clicking Archive posts 'archive-doc-confirm'", () => {
    const msg = messages.find(m => m.command === 'archive-doc-confirm');
    assert.ok(msg, "'archive-doc-confirm' must be posted when Archive is clicked");
});

test('archive-doc-confirm carries correct data, title, project', () => {
    const msg = messages.find(m => m.command === 'archive-doc-confirm');
    assert.ok(msg, 'message must exist');
    assert.strictEqual(msg.data,    FAKE_PATH,  'data must be file path');
    assert.strictEqual(msg.title,   FAKE_TITLE, 'title must match');
    assert.strictEqual(msg.project, FAKE_PROJ,  'project must match');
});

test("'archive-doc' is NOT posted directly by the webview", () => {
    assert.strictEqual(
        messages.find(m => m.command === 'archive-doc'),
        undefined,
        "webview must not post 'archive-doc' — only the host does that after confirmation"
    );
});

test('no inline Yes/Cancel UI appears (host owns the dialog)', () => {
    assert.strictEqual(doc.querySelector('[data-action="archive-confirm"]'), null, 'no archive-confirm button');
    assert.strictEqual(doc.querySelector('[data-action="archive-cancel"]'),  null, 'no archive-cancel button');
});

// Simulate extension host sending remove-card after native dialog confirmed
win.dispatchEvent(new win.MessageEvent('message', {
    data: { command: 'remove-card', filePath: FAKE_PATH }
}));

test('remove-card from host removes the card from the DOM', () => {
    const card = doc.querySelector('.card');
    assert.strictEqual(card, null, 'card must be removed after remove-card message from host');
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — Backend: archiveDoc() / isArchived() / restoreDoc()
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPart 2 — Backend: archiveDoc() writes to archived-docs.json\n' + '─'.repeat(60));

if (!fs.existsSync(ARCHIVE_JS)) {
    console.warn('SKIP: archive.js not compiled — run npm run compile first');
} else {
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'cvt-archive-test-'));
    const tmpFile = path.join(tmpDir, 'archived-docs.json');

    const origJs    = fs.readFileSync(ARCHIVE_JS, 'utf8');
    const patchedJs = origJs.replace(
        /const ARCHIVE_FILE\s*=\s*path\.join\([^)]+\)/,
        `const ARCHIVE_FILE = ${JSON.stringify(tmpFile)}`
    );
    const tmpJs = path.join(tmpDir, 'archive-patched.js');
    fs.writeFileSync(tmpJs, patchedJs, 'utf8');

    const { archiveDoc, isArchived, restoreDoc } = require(tmpJs);
    const TEST_PATH  = '/test/projects/my-doc.md';
    const TEST_TITLE = 'My Doc';
    const TEST_PROJ  = 'test-project';

    test('archived-docs.json does not exist before first archive call', () => {
        assert.ok(!fs.existsSync(tmpFile));
    });

    archiveDoc(TEST_PATH, TEST_TITLE, TEST_PROJ);

    test('archiveDoc() creates archived-docs.json', () => {
        assert.ok(fs.existsSync(tmpFile));
    });

    test('archived-docs.json contains entry with all required fields', () => {
        const entries = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        assert.ok(Array.isArray(entries));
        const e = entries.find(e => e.filePath === TEST_PATH);
        assert.ok(e, 'entry must be present');
        assert.strictEqual(e.title,       TEST_TITLE);
        assert.strictEqual(e.projectName, TEST_PROJ);
        assert.ok(e.archivedAt, 'must have archivedAt timestamp');
    });

    test('isArchived() returns true after archiving', () => {
        assert.strictEqual(isArchived(TEST_PATH), true);
    });

    test('archiveDoc() is idempotent — second call does not duplicate entry', () => {
        archiveDoc(TEST_PATH, TEST_TITLE, TEST_PROJ);
        const entries = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        assert.strictEqual(entries.filter(e => e.filePath === TEST_PATH).length, 1);
    });

    restoreDoc(TEST_PATH);

    test('restoreDoc() removes the entry from archived-docs.json', () => {
        const entries = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        assert.strictEqual(entries.find(e => e.filePath === TEST_PATH), undefined);
    });

    test('isArchived() returns false after restoring', () => {
        assert.strictEqual(isArchived(TEST_PATH), false);
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exit(1); }
