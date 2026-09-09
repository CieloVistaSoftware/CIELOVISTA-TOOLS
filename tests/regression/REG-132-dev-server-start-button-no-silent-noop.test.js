/**
 * REG-132-dev-server-start-button-no-silent-noop.test.js
 *
 * Regression test for issue #680 — "Home page Start button silently no-ops for
 * projects with no .claude/launch.json".
 *
 * Two independent defects produced one silent failure:
 *
 *   1. getDevServerConfig() fell back to port 4000 whenever .claude/launch.json
 *      was missing or portless, and returned a config INDISTINGUISHABLE from a
 *      real read. Callers could not tell a guess from a fact, so nothing could
 *      warn the user that the port was invented.
 *
 *   2. devServerAction probed the port exactly once, immediately. A server that
 *      had not finished booting read as "down", so the handler spawned a
 *      terminal and returned — never opening a browser. The click looked dead,
 *      and each repeat click spawned another `npm start` against a port that
 *      was by then in use.
 *
 * Invariants:
 *   1. A config read from a real launch.json is marked source:'launch.json';
 *      every fallback path is marked source:'default'.
 *   2. waitForPort keeps probing until the server comes up, and reports true.
 *   3. waitForPort gives up and reports false — it never hangs or throws.
 *   4. waitForPort returns immediately when the port is already open.
 *   5. The handler does not return after sendText without either opening a
 *      browser or surfacing a warning — i.e. no silent no-op path survives.
 *
 * Fixtures live in os.tmpdir(); the shared repo tree is never written to
 * (REG-130 invariant 1).
 *
 * Run: node tests/regression/REG-132-dev-server-start-button-no-silent-noop.test.js
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const ts   = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC  = path.join(ROOT, 'src', 'shared', 'dev-server-config.ts');

let passed = 0, failed = 0;

function test(name, fn) {
    const done = ok => { if (ok) { passed++; console.log(`  ✓ ${name}`); } };
    return Promise.resolve()
        .then(fn)
        .then(() => done(true))
        .catch(err => { failed++; console.error(`  ✗ ${name}\n      ${err && err.message}`); });
}

function assert(cond, message) {
    if (!cond) { throw new Error(message); }
}

// ─── Load the real module (transpiled, no vscode dependency) ──────────────────

const transpiled = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const devServerConfig = (() => {
    const module = { exports: {} };
    new Function('module', 'exports', 'require', transpiled)(module, module.exports, require);
    return module.exports;
})();

const { getDevServerConfig, waitForPort } = devServerConfig;

// ─── Sandbox ──────────────────────────────────────────────────────────────────

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reg132-'));

function project(name, launchJson) {
    const dir = path.join(sandbox, name);
    fs.mkdirSync(dir, { recursive: true });
    if (launchJson !== undefined) {
        fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.claude', 'launch.json'), launchJson);
    }
    return dir;
}

const withPort    = project('with-port',    JSON.stringify({ configurations: [{ name: 'dev', port: 3000 }] }));
const noLaunch    = project('no-launch',    undefined);
const noPortField = project('no-port',      JSON.stringify({ configurations: [{ name: 'dev' }] }));
const malformed   = project('malformed',    '{ this is not json');
const badPort     = project('bad-port',     JSON.stringify({ configurations: [{ name: 'dev', port: 70000 }] }));

async function main() {
    console.log('\nREG-132: Start button never silently no-ops (#680)\n');

    // ─── Invariant 1 — a guessed port is labelled as a guess ──────────────────

    await test('a real launch.json port is reported as source:launch.json', () => {
        const cfg = getDevServerConfig(withPort);
        assert(cfg.port === 3000, `expected port 3000, got ${cfg.port}`);
        assert(cfg.source === 'launch.json', `expected source launch.json, got ${cfg.source}`);
    });

    await test('a missing .claude/launch.json is reported as source:default (the #680 repro)', () => {
        const cfg = getDevServerConfig(noLaunch);
        assert(cfg.port === 4000, `expected fallback port 4000, got ${cfg.port}`);
        assert(cfg.source === 'default',
            'a guessed port is indistinguishable from a real one — nothing can warn the user (#680)');
    });

    for (const [label, dir] of [
        ['launch.json with no port field', noPortField],
        ['malformed launch.json',          malformed],
        ['out-of-range port',              badPort],
    ]) {
        await test(`${label} is reported as source:default`, () => {
            const cfg = getDevServerConfig(dir);
            assert(cfg.port === 4000, `expected fallback port 4000, got ${cfg.port}`);
            assert(cfg.source === 'default', `expected source default, got ${cfg.source}`);
        });
    }

    // ─── Invariants 2-4 — waitForPort ─────────────────────────────────────────

    await test('waits for a server that is still booting, then reports up', async () => {
        let calls = 0;
        const probe = async () => { calls++; return calls >= 4; };
        const ok = await waitForPort(3000, probe, { attempts: 10, intervalMs: 0, delay: async () => {} });
        assert(ok === true, 'gave up on a server that did come up');
        assert(calls === 4, `expected to stop probing at 4 calls, made ${calls}`);
    });

    await test('gives up cleanly when the server never comes up', async () => {
        let calls = 0;
        const probe = async () => { calls++; return false; };
        const ok = await waitForPort(4000, probe, { attempts: 5, intervalMs: 0, delay: async () => {} });
        assert(ok === false, 'claimed a server was up when it never was');
        assert(calls === 5, `expected exactly 5 attempts, made ${calls}`);
    });

    await test('returns immediately when the port is already open', async () => {
        let calls = 0;
        const ok = await waitForPort(3000, async () => { calls++; return true; },
            { attempts: 10, intervalMs: 0, delay: async () => {} });
        assert(ok === true && calls === 1, `expected 1 probe, made ${calls}`);
    });

    // ─── Invariant 5 — no silent no-op path in the handler ────────────────────

    await test('devServerAction never ends after sendText without opening or warning', () => {
        const home = fs.readFileSync(path.join(ROOT, 'src', 'features', 'home-page.ts'), 'utf8');
        const start = home.indexOf("msg.type === 'devServerAction'");
        assert(start !== -1, 'devServerAction handler not found in home-page.ts');

        // The handler ends at the next top-level `msg.type ===` branch.
        const next = home.indexOf("msg.type === '", start + 30);
        const body = home.slice(start, next === -1 ? home.length : next);

        assert(/waitForPort\s*\(/.test(body),
            'handler no longer waits for the port — a booting server reads as down and the '
            + 'click becomes a silent no-op again (#680)');
        assert(/showWarningMessage/.test(body),
            'handler has no path that tells the user the server never came up (#680)');
        assert(/source === 'default'/.test(body),
            'handler no longer distinguishes a guessed port from a configured one (#680)');
        assert(/vscode\.window\.terminals\.find/.test(body),
            'handler no longer reuses an existing terminal — repeat clicks spawn duplicate '
            + '`npm start` processes against a port already in use (#680)');
    });

    fs.rmSync(sandbox, { recursive: true, force: true });

    console.log('─'.repeat(60));
    if (failed === 0) {
        console.log(`✓ All ${passed} REG-132 tests passed\n`);
        process.exit(0);
    } else {
        console.error(`\n✗ ${failed} REG-132 test(s) FAILED\n`);
        process.exit(1);
    }
}

main();
