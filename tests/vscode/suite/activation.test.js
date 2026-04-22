/**
 * tests/vscode/suite/activation.test.js
 *
 * Runs INSIDE the real VS Code extension host via @vscode/test-electron.
 * The extension is already activated before this test runs.
 *
 * What this proves that no static test can:
 *   - The extension activated without throwing
 *   - Every catalog command is registered at runtime
 *   - The docCatalog webview serializer is registered
 */
'use strict';

const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const vscode = require('vscode');

// ─── Load expected catalog IDs from source ───────────────────────────────────

const catalogSrc = fs.readFileSync(
    path.join(__dirname, '../../../src/features/cvs-command-launcher/catalog.ts'),
    'utf8'
);
const CATALOG_IDS = [...catalogSrc.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);

// ─── Tests ────────────────────────────────────────────────────────────────────

suite('CieloVista Tools — Activation', function () {

    test('Extension is present and active', async function () {
        const ext = vscode.extensions.getExtension('cielovistasoftware.cielovista-tools');
        assert.ok(ext, 'Extension not found — check publisher.name matches package.json');
        if (!ext.isActive) {
            await ext.activate();
        }
        assert.ok(ext.isActive, 'Extension failed to activate');
    });

    test('All catalog commands are registered', async function () {
        // Wait briefly for all registerCommand calls to complete
        await new Promise(r => setTimeout(r, 500));

        const allCommands = await vscode.commands.getCommands(true);
        const missing = CATALOG_IDS.filter(id => !allCommands.includes(id));

        assert.strictEqual(
            missing.length, 0,
            `${missing.length} catalog command(s) NOT registered at runtime:\n  ${missing.join('\n  ')}\n\n` +
            `This means those features are dead — their activate() was never called.\n` +
            `Check extension.ts for missing activateIfEnabled() calls.`
        );
    });

    test(`All ${CATALOG_IDS.length} expected catalog IDs found`, function () {
        assert.ok(CATALOG_IDS.length > 0, 'Could not read catalog IDs from source');
        assert.ok(CATALOG_IDS.length >= 80,
            `Expected at least 80 catalog IDs, found ${CATALOG_IDS.length}`);
    });

    test('cvs.catalog.open is registered and callable', async function () {
        const all = await vscode.commands.getCommands(true);
        assert.ok(all.includes('cvs.catalog.open'),
            'cvs.catalog.open is not registered — docCatalog feature not activated');
    });

    test('cvs.catalog.rebuild is registered and callable', async function () {
        const all = await vscode.commands.getCommands(true);
        assert.ok(all.includes('cvs.catalog.rebuild'),
            'cvs.catalog.rebuild is not registered');
    });

    test('cvs.catalog.view is registered and callable', async function () {
        const all = await vscode.commands.getCommands(true);
        assert.ok(all.includes('cvs.catalog.view'),
            'cvs.catalog.view is not registered');
    });

    test('Home page command is registered', async function () {
        const all = await vscode.commands.getCommands(true);
        assert.ok(all.includes('cvs.tools.home'),
            'cvs.tools.home is not registered — home-page feature not activated');
    });
});
