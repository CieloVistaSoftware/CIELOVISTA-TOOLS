/**
 * tests/unit/readme-generator.test.js
 * Unit tests for src/features/readme-generator.ts
 * Run: node tests/unit/readme-generator.test.js
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const OUT = path.join(__dirname, '../../out/features/readme-generator.js');
if (!fs.existsSync(OUT)) { console.error('SKIP: not compiled'); process.exit(0); }

// ── Constants ──────────────────────────────────────────────────────────────────
// Derive REGISTRY_PATH from source so the test stays in sync with src/shared/registry.ts.
// The TS source uses \\ escape sequences; convert them to single backslashes as they
// appear at runtime.
const registrySrc = path.join(__dirname, '../../src/shared/registry.ts');
const registryTxt = fs.existsSync(registrySrc) ? fs.readFileSync(registrySrc, 'utf8') : '';
const _regMatch   = registryTxt.match(/REGISTRY_PATH\s*=\s*'([^']+)'/);
const REGISTRY_PATH = _regMatch
    ? _regMatch[1].replace(/\\\\/g, '\\')
    : 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';

const PROJ_PATH = path.join(require('os').tmpdir(), 'cvt-readme-gen-test-proj');

// ── Mock state ─────────────────────────────────────────────────────────────────
const msgs      = { info: [], error: [], warn: [] };
const panels    = [];
const quickPicks = [];
const registered = new Map();

const fakeFs = {
    registryExists: false,
    registry:       null,
    projectExists:  false,
    readmeExists:   false,
    written:        []
};

function resetState() {
    msgs.info.length    = 0;
    msgs.error.length   = 0;
    msgs.warn.length    = 0;
    panels.length       = 0;
    quickPicks.length   = 0;
    fakeFs.registryExists = false;
    fakeFs.registry       = null;
    fakeFs.projectExists  = false;
    fakeFs.readmeExists   = false;
    fakeFs.written.length = 0;
}

function makePanel() {
    const panel = {
        webview: {
            html: '',
            postMessage() {},
            onDidReceiveMessage() { return { dispose() {} }; }
        },
        revealed: false,
        reveal()  { this.revealed = true; },
        onDidDispose(fn) { panel._disposeFn = fn; return { dispose() {} }; },
        dispose() { if (panel._disposeFn) { panel._disposeFn(); } }
    };
    panels.push(panel);
    return panel;
}

// ── Module._load shim ──────────────────────────────────────────────────────────
const origLoad = Module._load;
Module._load = function(req, parent, isMain) {
    if (req === 'vscode') {
        return {
            commands: {
                registerCommand(n, h) { registered.set(n, h); return { dispose() {} }; },
                executeCommand()      { return Promise.resolve(); }
            },
            window: {
                showErrorMessage(msg)       { msgs.error.push(msg); return Promise.resolve(); },
                showInformationMessage(msg) { msgs.info.push(msg);  return Promise.resolve(); },
                showWarningMessage(msg)     { msgs.warn.push(msg);  return Promise.resolve(); },
                showQuickPick(items)        { quickPicks.push(items); return Promise.resolve(undefined); },
                createWebviewPanel()        { return makePanel(); },
                showTextDocument()          { return Promise.resolve(); },
                createOutputChannel()       { return { appendLine() {}, show() {}, dispose() {} }; },
                withProgress(_, fn)         { return fn({ report() {} }); }
            },
            workspace: {
                openTextDocument()  { return Promise.resolve({}); },
                getConfiguration()  { return { get() { return undefined; } }; }
            },
            ViewColumn:       { Beside: 2, One: 1 },
            ProgressLocation: { Notification: 15 }
        };
    }
    if (req === 'fs') {
        return {
            existsSync(p) {
                if (p === REGISTRY_PATH)                       return fakeFs.registryExists;
                if (p === PROJ_PATH)                           return fakeFs.projectExists;
                if (p === path.join(PROJ_PATH, 'README.md'))   return fakeFs.readmeExists;
                return false;
            },
            readFileSync(p) {
                if (p === REGISTRY_PATH) return JSON.stringify(fakeFs.registry);
                return '';
            },
            readdirSync() { return []; },
            writeFileSync(p, data) { fakeFs.written.push({ p, data }); }
        };
    }
    return origLoad.apply(this, arguments);
};

const sharedOC = path.join(__dirname, '../../out/shared/output-channel.js');
if (fs.existsSync(sharedOC)) { try { require(sharedOC); } catch {} }
const mod = require(OUT);

// ── Test harness ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}
async function testAsync(name, fn) {
    try   { await fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}\n    → ${e.message}`); failed++; }
}

(async () => {
    console.log('\nreadme-generator unit tests\n' + '─'.repeat(50));

    // ── Module shape ───────────────────────────────────────────────────────────
    test('module loads without throwing',  () => assert.ok(mod));
    test('exports activate function',      () => assert.strictEqual(typeof mod.activate,   'function'));
    test('exports deactivate function',    () => assert.strictEqual(typeof mod.deactivate, 'function'));

    // ── Source-level static checks ─────────────────────────────────────────────
    test('source file has copyright header', () => {
        const src = path.join(__dirname, '../../src/features/readme-generator.ts');
        if (!fs.existsSync(src)) return;
        assert.ok(fs.readFileSync(src, 'utf8').includes('CieloVista'));
    });

    test('source declares all three expected command names', () => {
        const src = path.join(__dirname, '../../src/features/readme-generator.ts');
        if (!fs.existsSync(src)) return;
        const txt = fs.readFileSync(src, 'utf8');
        assert.ok(txt.includes('cvs.readme.generate.scan'),   'missing scan command');
        assert.ok(txt.includes('cvs.readme.generate.run'),    'missing run command');
        assert.ok(txt.includes('cvs.readme.generate.single'), 'missing single command');
    });

    test('README_STANDARD in source contains required section headings', () => {
        const src = path.join(__dirname, '../../src/features/readme-generator.ts');
        if (!fs.existsSync(src)) return;
        const txt = fs.readFileSync(src, 'utf8');
        const required = [
            '## What it does', '## Quick Start', '## Architecture',
            '## Project Structure', '## Common Commands', '## Prerequisites', '## License'
        ];
        for (const heading of required) {
            assert.ok(txt.includes(heading), `README_STANDARD missing "${heading}"`);
        }
    });

    // ── Command registration ───────────────────────────────────────────────────
    registered.clear();
    mod.activate({ subscriptions: [] });

    test('activate registers exactly 3 commands', () =>
        assert.strictEqual(registered.size, 3, `Expected 3 commands, got ${registered.size}`));
    test('activate registers cvs.readme.generate.scan',   () =>
        assert.ok(registered.has('cvs.readme.generate.scan')));
    test('activate registers cvs.readme.generate.run',    () =>
        assert.ok(registered.has('cvs.readme.generate.run')));
    test('activate registers cvs.readme.generate.single', () =>
        assert.ok(registered.has('cvs.readme.generate.single')));

    // ── Behaviour: registry not found (edge / failure path) ───────────────────

    await testAsync('scan returns early without panel when registry file is missing', async () => {
        resetState();
        mod.deactivate();
        fakeFs.registryExists = false;
        await registered.get('cvs.readme.generate.scan')();
        assert.strictEqual(panels.length, 0,        'No panel should open when registry is missing');
        assert.strictEqual(msgs.info.length, 0,     'No info message expected when registry is missing');
    });

    await testAsync('run command returns early without crash when registry is missing', async () => {
        resetState();
        mod.deactivate();
        fakeFs.registryExists = false;
        await registered.get('cvs.readme.generate.run')();
        assert.strictEqual(panels.length, 0,    'No panel expected');
        assert.strictEqual(msgs.info.length, 0, 'No info message expected');
    });

    await testAsync('single command skips quickpick when registry is missing', async () => {
        resetState();
        mod.deactivate();
        fakeFs.registryExists = false;
        await registered.get('cvs.readme.generate.single')();
        assert.strictEqual(quickPicks.length, 0, 'No quickpick when registry is missing');
    });

    // ── Behaviour: all projects already have READMEs ──────────────────────────

    await testAsync('single command shows info message when all projects already have READMEs', async () => {
        resetState();
        mod.deactivate();
        fakeFs.registryExists = true;
        fakeFs.registry       = {
            globalDocsPath: '/global',
            projects: [{ name: 'Test Project', path: PROJ_PATH, type: 'node', description: 'test' }]
        };
        fakeFs.projectExists = true;
        fakeFs.readmeExists  = true;
        await registered.get('cvs.readme.generate.single')();
        assert.ok(
            msgs.info.some(m => m.includes('All projects already have README')),
            `Expected "All projects already have README" info, got: ${JSON.stringify(msgs.info)}`
        );
        assert.strictEqual(quickPicks.length, 0, 'No quickpick when all have READMEs');
    });

    await testAsync('scan shows info message and creates panel when all projects have READMEs', async () => {
        resetState();
        mod.deactivate();
        fakeFs.registryExists = true;
        fakeFs.registry       = {
            globalDocsPath: '/global',
            projects: [{ name: 'Test Project', path: PROJ_PATH, type: 'node', description: 'test' }]
        };
        fakeFs.projectExists = true;
        fakeFs.readmeExists  = true;
        await registered.get('cvs.readme.generate.scan')();
        assert.ok(panels.length > 0, 'Webview panel should be created');
        assert.ok(
            msgs.info.some(m => m.includes('All registered projects already have README')),
            `Expected "All registered projects already have README" info, got: ${JSON.stringify(msgs.info)}`
        );
        assert.ok(panels[0].webview.html.includes('✅ All registered projects have README files!'),
            'Panel HTML should confirm all projects have READMEs');
    });

    // ── Behaviour: scan reports missing README in panel HTML ──────────────────

    await testAsync('scan includes project name in panel HTML when README is missing', async () => {
        resetState();
        mod.deactivate();
        fakeFs.registryExists = true;
        fakeFs.registry       = {
            globalDocsPath: '/global',
            projects: [{ name: 'MyApp', path: PROJ_PATH, type: 'node', description: 'demo app' }]
        };
        fakeFs.projectExists = true;
        fakeFs.readmeExists  = false;   // ← README absent
        await registered.get('cvs.readme.generate.scan')();
        assert.ok(panels.length > 0, 'Expected webview panel');
        assert.ok(panels[0].webview.html.includes('MyApp'),
            'Panel HTML should contain project name when README is missing');
        assert.ok(
            msgs.info.some(m => m.includes("project(s) without README")),
            `Expected "project(s) without README" info, got: ${JSON.stringify(msgs.info)}`
        );
    });

    // ── Edge / failure path: project folder absent → skipped by findMissingReadmes

    await testAsync('scan skips projects whose folder does not exist on disk', async () => {
        resetState();
        mod.deactivate();
        fakeFs.registryExists = true;
        fakeFs.registry       = {
            globalDocsPath: '/global',
            projects: [{ name: 'Ghost Project', path: PROJ_PATH, type: 'node', description: 'ghost' }]
        };
        fakeFs.projectExists = false;   // ← project folder absent
        fakeFs.readmeExists  = false;
        await registered.get('cvs.readme.generate.scan')();
        // findMissingReadmes skips projects whose path doesn't exist, so missing=0
        assert.ok(panels.length > 0, 'Panel should still be created');
        assert.ok(
            msgs.info.some(m => m.includes('All registered projects already have README')),
            'Projects with absent folder should be skipped (treated as no missing READMEs), ' +
            `got: ${JSON.stringify(msgs.info)}`
        );
    });

    // ── Deactivate ─────────────────────────────────────────────────────────────
    test('deactivate runs without error', () => {
        assert.doesNotThrow(() => mod.deactivate());
    });

    // ── Wrap-up ────────────────────────────────────────────────────────────────
    Module._load = origLoad;
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();

