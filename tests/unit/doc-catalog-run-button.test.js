'use strict';

/**
 * tests/unit/doc-catalog-run-button.test.js
 *
 * Regression test for issue #322 — Doc Catalog Run button for .ts-backed cards.
 *
 * Verifies the structural guarantees of the Run button implementation without
 * launching VS Code:
 *   1. html.ts imports CATALOG
 *   2. html.ts resolves commandId from srcPath vs catalog location
 *   3. html.ts emits btn-run with data-action="run-command" and data-command-id
 *   4. catalog.html dispatches run-command to vscode.postMessage
 *   5. commands.ts handles the run-command case with executeCommand
 */

const fs   = require('fs');
const path = require('path');

const HTML_TS    = path.resolve(__dirname, '..', '..', 'src', 'features', 'doc-catalog', 'html.ts');
const CATALOG_HTML = path.resolve(__dirname, '..', '..', 'src', 'features', 'doc-catalog', 'catalog.html');
const COMMANDS_TS  = path.resolve(__dirname, '..', '..', 'src', 'features', 'doc-catalog', 'commands.ts');

let failed = 0;
const fail = (msg) => { console.error('FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('PASS: ' + msg); };

for (const [label, p] of [['html.ts', HTML_TS], ['catalog.html', CATALOG_HTML], ['commands.ts', COMMANDS_TS]]) {
    if (!fs.existsSync(p)) {
        console.error('FATAL: ' + label + ' not found at ' + p);
        process.exit(1);
    }
}

const htmlSrc     = fs.readFileSync(HTML_TS,     'utf8');
const catalogHtml = fs.readFileSync(CATALOG_HTML, 'utf8');
const commandsSrc = fs.readFileSync(COMMANDS_TS,  'utf8');

// ─── Check 1: html.ts imports CATALOG ────────────────────────────────────────

(function checkCatalogImport() {
    if (!htmlSrc.includes("from '../cvs-command-launcher/catalog'")) {
        fail('html.ts does not import CATALOG from cvs-command-launcher/catalog');
        return;
    }
    ok('html.ts imports CATALOG from cvs-command-launcher/catalog');
})();

// ─── Check 2: html.ts resolves commandId from srcPath ────────────────────────

(function checkCommandIdResolution() {
    if (!htmlSrc.includes('commandId')) {
        fail('html.ts has no commandId variable — Run button resolution missing');
        return;
    }
    if (!htmlSrc.includes('CATALOG.find(')) {
        fail('html.ts does not call CATALOG.find() to resolve commandId');
        return;
    }
    if (!htmlSrc.includes('e.location')) {
        fail('html.ts CATALOG.find does not reference e.location for path matching');
        return;
    }
    ok('html.ts resolves commandId by matching srcPath against CATALOG entry locations');
})();

// ─── Check 3: html.ts emits btn-run button with correct attributes ────────────

(function checkButtonEmitted() {
    if (!htmlSrc.includes('btn-run')) {
        fail('html.ts does not emit btn-run class on the Run button');
        return;
    }
    if (!htmlSrc.includes('data-action="run-command"')) {
        fail('html.ts Run button is missing data-action="run-command"');
        return;
    }
    if (!htmlSrc.includes('data-command-id=')) {
        fail('html.ts Run button is missing data-command-id attribute');
        return;
    }
    ok('html.ts emits btn-run with data-action="run-command" and data-command-id');
})();

// ─── Check 4: catalog.html dispatches run-command to vscode ──────────────────

(function checkCatalogDispatch() {
    if (!catalogHtml.includes("'run-command'") && !catalogHtml.includes('"run-command"')) {
        fail('catalog.html does not handle run-command action in click dispatcher');
        return;
    }
    if (!catalogHtml.includes('commandId')) {
        fail('catalog.html run-command dispatch does not forward commandId');
        return;
    }
    ok('catalog.html dispatches run-command with commandId via vscode.postMessage');
})();

// ─── Check 5: commands.ts handles run-command with executeCommand ─────────────

(function checkCommandsHandler() {
    if (!commandsSrc.includes("case 'run-command'")) {
        fail("commands.ts missing case 'run-command' in message handler");
        return;
    }
    if (!commandsSrc.includes('executeCommand')) {
        fail('commands.ts run-command handler does not call vscode.commands.executeCommand');
        return;
    }
    ok("commands.ts handles 'run-command' via vscode.commands.executeCommand");
})();

// ─── Result ───────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log('doc-catalog-run-button PASSED — Run button implementation structurally correct');
    process.exit(0);
} else {
    console.error('doc-catalog-run-button FAILED — ' + failed + ' check' + (failed > 1 ? 's' : '') + ' failed');
    process.exit(1);
}
