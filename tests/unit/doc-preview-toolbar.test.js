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
    // The old broken wiring: btn-edit sent command:'open' on the same line which re-opened the doc preview
    const lines = src.split('\n');
    const btnEditLine = lines.find(l => l.includes("safeAddListener('btn-edit'"));
    assert.ok(btnEditLine, "safeAddListener for btn-edit not found");
    assert.ok(
        !btnEditLine.includes("command: 'open'") && !btnEditLine.includes("command:'open'"),
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

test("safeAddListener wires all four toolbar buttons", () => {
    assert.ok(src.includes("safeAddListener('btn-edit'"),     "safeAddListener for btn-edit missing");
    assert.ok(src.includes("safeAddListener('btn-vscode'"),   "safeAddListener for btn-vscode missing");
    assert.ok(src.includes("safeAddListener('btn-terminal'"), "safeAddListener for btn-terminal missing");
    assert.ok(src.includes("safeAddListener('btn-explorer'"), "safeAddListener for btn-explorer missing");
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '-'.repeat(50));
console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) { process.exit(1); }
