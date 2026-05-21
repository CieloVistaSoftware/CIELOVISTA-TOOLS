'use strict';
/**
 * tests/unit/doc-preview-toolbar.test.js
 *
 * Regression test for #267: doc preview toolbar buttons did nothing.
 *
 * Root cause: btn-edit was posting command:'open' which re-opened the file
 * in the preview instead of in the text editor. btn-vscode/terminal/explorer
 * handlers were already present but untested.
 *
 * After esbuild migration there is no out/shared/doc-preview.js — tests
 * check the TypeScript source for required patterns instead.
 *
 * Run: node tests/unit/doc-preview-toolbar.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const SRC = path.join(__dirname, '../../src/shared/doc-preview.ts');
const src  = fs.readFileSync(SRC, 'utf8');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  PASS ${name}`); passed++; }
    catch (e) { console.error(`  FAIL ${name}\n       → ${e.message}`); failed++; }
}

console.log('\ndoc-preview toolbar regression — #267\n' + '-'.repeat(50));

// ── Edit button ───────────────────────────────────────────────────────────────
test("btn-edit posts 'edit-file' (not generic 'open')", () => {
    assert.ok(
        src.includes("command: 'edit-file'") || src.includes("command:'edit-file'"),
        "btn-edit must post command:'edit-file' so the file opens in the text editor"
    );
});

test("btn-edit does NOT post generic 'open' command", () => {
    // Guard against regressing back to command:'open' for the toolbar edit action.
    const lines = src.split('\n');
    const btnEditLine = lines.find(l => l.includes("action === 'edit-file'"));
    assert.ok(btnEditLine, "delegated edit-file toolbar branch not found");
    assert.ok(
        !src.includes("command: 'open', path: '${jsPath}'") && !src.includes("command:'open',path:'${jsPath}'"),
        "btn-edit must NOT post command:'open' — that would reopen the preview instead of the editor"
    );
});

test("extension host handles 'edit-file' case", () => {
    assert.ok(
        src.includes("case 'edit-file':"),
        "Message handler must have a case 'edit-file' branch"
    );
});

// ── Other toolbar buttons ─────────────────────────────────────────────────────
test("btn-vscode posts 'open-in-vscode'", () => {
    assert.ok(
        src.includes("command: 'open-in-vscode'") || src.includes("command:'open-in-vscode'"),
        "btn-vscode must post command:'open-in-vscode'"
    );
    assert.ok(src.includes("case 'open-in-vscode':"), "handler for open-in-vscode missing");
});

test("btn-terminal posts 'open-terminal'", () => {
    assert.ok(
        src.includes("command: 'open-terminal'") || src.includes("command:'open-terminal'"),
        "btn-terminal must post command:'open-terminal'"
    );
    assert.ok(src.includes("case 'open-terminal':"), "handler for open-terminal missing");
});

test("btn-explorer posts 'reveal-folder-os'", () => {
    assert.ok(
        src.includes("command: 'reveal-folder-os'") || src.includes("command:'reveal-folder-os'"),
        "btn-explorer must post command:'reveal-folder-os'"
    );
    assert.ok(src.includes("case 'reveal-folder-os':"), "handler for reveal-folder-os missing");
});

// ── HTML wiring ───────────────────────────────────────────────────────────────
test("all four button IDs are in the HTML", () => {
    assert.ok(src.includes("id=\"btn-edit\""),     'btn-edit missing from HTML');
    assert.ok(src.includes("id=\"btn-vscode\""),   'btn-vscode missing from HTML');
    assert.ok(src.includes("id=\"btn-terminal\""), 'btn-terminal missing from HTML');
    assert.ok(src.includes("id=\"btn-explorer\""), 'btn-explorer missing from HTML');
});

test("delegated toolbar handler wires all four buttons", () => {
    assert.ok(src.includes("data-toolbar-action=\"edit-file\""), 'btn-edit data-toolbar-action missing');
    assert.ok(src.includes("data-toolbar-action=\"open-in-vscode\""), 'btn-vscode data-toolbar-action missing');
    assert.ok(src.includes("data-toolbar-action=\"open-terminal\""), 'btn-terminal data-toolbar-action missing');
    assert.ok(src.includes("data-toolbar-action=\"reveal-folder-os\""), 'btn-explorer data-toolbar-action missing');
    assert.ok(src.includes("topbarRow.addEventListener('click'"), 'delegated click handler on topbar row missing');
    assert.ok(src.includes("closest('[data-toolbar-action]')"), 'delegated handler must use closest() for toolbar action buttons');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '-'.repeat(50));
console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
