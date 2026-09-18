/**
 * REG-145-extension-ts-is-wiring-only.test.js
 *
 * Guards #738. CLAUDE.md: "extension.ts is wiring only — no business logic" and
 * "each feature file registers commands for exactly one feature".
 *
 * extension.ts registered five commands itself (cvs.license.sync,
 * cvs.audit.codebase, cvs.tools.errorLog, cvs.issues.openViewer,
 * cvs.issues.newIssue, the last with inline registry-lookup logic) plus
 * cvs.tools.results, a no-op placeholder nothing invoked and package.json never
 * contributed. cvs.tools.regressionLog was the same until #734, and was found
 * only because its unit test happened to expect an activate(). Nothing asked
 * the others for one, so this test does.
 *
 * It asserts:
 *   1. extension.ts (comments stripped) contains no register*Command( call
 *   2. behaviourally: each owning feature, loaded from the per-module test
 *      build in out-test/ with a mocked vscode, registers its command(s) when
 *      its activate() runs, pushes the disposables onto context.subscriptions,
 *      and wires the expected handler
 *   3. extension.ts imports and calls each of those activate()/deactivate()
 *   4. every moved command is registered exactly once across src/
 *   5. cvs.tools.results no longer exists anywhere in src/
 *
 * Read-only: it reads src/ and out-test/ and writes nothing. out-test/ is
 * built by scripts/run-regression-tests.js before any test runs (#734).
 *
 * Run: node tests/regression/REG-145-extension-ts-is-wiring-only.test.js
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const Module = require('module');

const ROOT     = path.resolve(__dirname, '..', '..');
const SRC      = path.join(ROOT, 'src');
const OUT_TEST = path.join(ROOT, 'out-test');
const EXT_TS   = path.join(SRC, 'extension.ts');

/** Owning feature for each command that used to be registered in extension.ts. */
const OWNERS = [
    { module: 'features/license-sync',     alias: 'license-sync',     commands: { 'cvs.license.sync':   'runLicenseSync' } },
    { module: 'features/codebase-auditor', alias: 'codebase-auditor', commands: { 'cvs.audit.codebase': 'runCodebaseAudit' } },
    { module: 'features/error-log-viewer', alias: 'error-log-viewer', commands: { 'cvs.tools.errorLog': 'openErrorLogViewer' } },
    { module: 'features/github-issues',    alias: 'github-issues',    commands: { 'cvs.issues.openViewer': null, 'cvs.issues.newIssue': 'newIssueForCurrentProject' } },
];

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (err) { failed++; console.error(`  ✗ ${name}\n      → ${err && err.message}`); }
}
function assert(cond, message) { if (!cond) { throw new Error(message); } }

/** Remove // and block comments so a comment mentioning registerCommand is not a call. */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

function walkTs(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walkTs(full, out); }
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) { out.push(full); }
    }
    return out;
}

// ── A vscode mock that records registrations and absorbs everything else ───
// Modules touch assorted vscode APIs at load time (output channels, config,
// enums). Anything not modelled here returns an inert stub instead of throwing,
// so a failure below is about registration, not about the mock.
const registrations = [];
function inert() {
    const fn = function () { return inert(); };
    return new Proxy(fn, {
        get(_t, prop) {
            if (prop === Symbol.toPrimitive) { return () => ''; }
            if (prop === 'then') { return undefined; }
            if (prop === 'dispose') { return () => {}; }
            return inert();
        },
    });
}
const vscodeMock = new Proxy({
    commands: {
        registerCommand(id, handler) {
            registrations.push({ id, handler });
            return { dispose() {} };
        },
        executeCommand: () => Promise.resolve(),
        getCommands: () => Promise.resolve([]),
    },
    window: new Proxy({
        createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, clear() {}, dispose() {} }),
    }, { get: (t, p) => (p in t ? t[p] : inert()) }),
    workspace: new Proxy({
        workspaceFolders: undefined,
        getConfiguration: () => ({ get: (_k, d) => d, update: () => Promise.resolve(), has: () => false, inspect: () => undefined }),
    }, { get: (t, p) => (p in t ? t[p] : inert()) }),
    ViewColumn: { One: 1, Two: 2, Three: 3, Beside: -2, Active: -1 },
    Uri: { file: f => ({ fsPath: f, toString: () => f }), parse: s => ({ toString: () => s }) },
}, { get: (t, p) => (p in t ? t[p] : inert()) });

function loadWithMock(rel) {
    const file = path.join(OUT_TEST, rel + '.js');
    assert(fs.existsSync(file), `out-test/${rel}.js does not exist; scripts/run-regression-tests.js builds out-test/ before running tests`);
    const origLoad = Module._load;
    Module._load = function (req) {
        if (req === 'vscode') { return vscodeMock; }
        return origLoad.apply(this, arguments);
    };
    try { return require(file); }
    finally { Module._load = origLoad; }
}

console.log('\nREG-145: extension.ts is wiring only; each feature registers its own commands (#738)\n');

const extSrc  = fs.readFileSync(EXT_TS, 'utf8');
const extCode = stripComments(extSrc);

// 1 ─────────────────────────────────────────────────────────────────────────
test('extension.ts contains no registerCommand / registerTextEditorCommand call', () => {
    const calls = [...extCode.matchAll(/\bregister\w*Command\s*\(\s*['"]?([^'",)\s]*)/g)].map(m => m[1] || '(dynamic id)');
    assert(calls.length === 0,
        `${calls.length} registration(s) in extension.ts, which must only call feature activate()/deactivate(): ${calls.join(', ')}`);
});

// 2 ─────────────────────────────────────────────────────────────────────────
for (const owner of OWNERS) {
    const ids = Object.keys(owner.commands);
    test(`${owner.module}.activate() registers ${ids.join(' + ')}`, () => {
        const mod = loadWithMock(owner.module);
        assert(typeof mod.activate === 'function', `${owner.module} exports no activate()`);
        assert(typeof mod.deactivate === 'function', `${owner.module} exports no deactivate()`);

        registrations.length = 0;
        const context = { subscriptions: [], extensionPath: ROOT, globalState: inert(), workspaceState: inert() };
        mod.activate(context);

        const got = registrations.map(r => r.id).sort();
        assert(JSON.stringify(got) === JSON.stringify([...ids].sort()),
            `activate() registered [${got.join(', ') || 'nothing'}], expected [${[...ids].sort().join(', ')}]`);
        assert(context.subscriptions.length >= ids.length,
            `activate() pushed ${context.subscriptions.length} disposable(s) onto context.subscriptions for ${ids.length} command(s)`);

        for (const [id, handlerName] of Object.entries(owner.commands)) {
            const reg = registrations.find(r => r.id === id);
            assert(typeof reg.handler === 'function', `${id} was registered without a handler function`);
            if (handlerName) {
                assert(reg.handler === mod[handlerName],
                    `${id} must be wired to ${owner.module}.${handlerName}(), not an inline or placeholder handler`);
            }
        }
    });
}

// 3 ─────────────────────────────────────────────────────────────────────────
test('extension.ts imports and calls each owning feature\'s activate() and deactivate()', () => {
    const problems = [];
    for (const owner of OWNERS) {
        const importRe = new RegExp(
            "import\\s*\\{\\s*activate\\s+as\\s+(\\w+)\\s*,\\s*deactivate\\s+as\\s+(\\w+)\\s*\\}\\s*from\\s*['\"]\\./" +
            owner.module.replace(/[/.-]/g, '\\$&') + "['\"]");
        const m = extCode.match(importRe);
        if (!m) { problems.push(`${owner.module}: activate/deactivate not imported`); continue; }
        const [, act, deact] = m;
        const called = new RegExp('\\b' + act + '\\s*\\(\\s*context\\s*\\)').test(extCode) ||
                       new RegExp('activateIfEnabled\\([^)]*,\\s*' + act + '\\s*,').test(extCode);
        if (!called) { problems.push(`${owner.module}: ${act}(context) never called`); }
        if (!new RegExp('\\b' + deact + '\\s*\\(\\s*\\)').test(extCode)) { problems.push(`${owner.module}: ${deact}() never called`); }
    }
    assert(problems.length === 0, problems.join('; '));
});

// 4 ─────────────────────────────────────────────────────────────────────────
test('every moved command is registered exactly once across src/', () => {
    const counts = {};
    for (const owner of OWNERS) { for (const id of Object.keys(owner.commands)) { counts[id] = []; } }
    for (const file of walkTs(SRC)) {
        const code = stripComments(fs.readFileSync(file, 'utf8'));
        for (const m of code.matchAll(/\bregisterCommand\s*\(\s*['"]([^'"]+)['"]/g)) {
            if (counts[m[1]]) { counts[m[1]].push(path.relative(ROOT, file).replace(/\\/g, '/')); }
        }
    }
    const bad = Object.entries(counts).filter(([, files]) => files.length !== 1)
        .map(([id, files]) => `${id} registered ${files.length}x${files.length ? ' (' + files.join(', ') + ')' : ''}`);
    assert(bad.length === 0, bad.join('; '));
});

// 5 ─────────────────────────────────────────────────────────────────────────
test('the cvs.tools.results no-op placeholder is gone from src/', () => {
    const hits = walkTs(SRC).filter(f => fs.readFileSync(f, 'utf8').includes('cvs.tools.results'))
        .map(f => path.relative(ROOT, f).replace(/\\/g, '/'));
    assert(hits.length === 0, `cvs.tools.results still referenced in ${hits.join(', ')}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
