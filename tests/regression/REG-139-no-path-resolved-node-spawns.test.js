/**
 * REG-139-no-path-resolved-node-spawns.test.js
 *
 * Regression test for #723 — the #615 root cause, everywhere else it lived.
 *
 * #615 was the MCP server dying at startup with 0xC0000142
 * (STATUS_DLL_INIT_FAILED) and empty output: it was spawned as
 * `spawn('node', …)`, which lets the system PATH choose the interpreter, and on
 * Windows the node.exe found there can be the wrong ABI, an antivirus-wrapped
 * shim, or a launcher whose DLL imports fail to initialize.
 *
 * Fixing that one call site left two others with identical code:
 * background-health-runner.ts (the hourly regression run) and
 * doc-catalog/commands.ts (the demo server). The second of those is spawned
 * detached with stdio:'ignore', so the same crash there produces no output at
 * all — it would simply never start, silently.
 *
 * The fix is one shared resolver, src/shared/node-launcher.ts, used by all
 * three. This test exists because the defect's whole character is that it
 * spreads by copy-paste and is invisible until it bites: the failing binary is
 * never named anywhere, so a fourth call site would look fine in review and
 * fail intermittently in production.
 *
 * Checks:
 *   1. the shared launcher exists and is a pure module (no vscode import)
 *   2. no literal 'node' / "node" spawn survives anywhere under src/
 *   3. every spawn of the shared launcher's command passes its env through
 *   4. the launcher does not mutate the caller's env (behavioural)
 *
 * Run: node tests/regression/REG-139-no-path-resolved-node-spawns.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..', '..');
const SRC       = path.join(ROOT, 'src');
const LAUNCHER  = path.join(SRC, 'shared', 'node-launcher.ts');

let passed = 0;
let failed = 0;
const fail = (msg) => { console.error('  FAIL: ' + msg); failed++; };
const ok   = (msg) => { console.log('  PASS: ' + msg); passed++; };

console.log('\nREG-139: nothing under src/ lets PATH choose the Node binary (#723)\n');

// ─── 1: the shared launcher exists and is pure ───────────────────────────────

if (!fs.existsSync(LAUNCHER)) {
    fail('src/shared/node-launcher.ts is missing — there is no single answer to ' +
         'which Node binary we spawn (#723)');
} else {
    const text = fs.readFileSync(LAUNCHER, 'utf8');
    if (/from\s+['"]vscode['"]/.test(text)) {
        fail('node-launcher.ts imports vscode — shared/ holds pure functions only, ' +
             'and an impure launcher cannot be unit-tested outside the extension host');
    } else if (!/export\s+function\s+resolveNodeLauncher\s*\(/.test(text)) {
        fail('node-launcher.ts does not export resolveNodeLauncher()');
    } else {
        ok('src/shared/node-launcher.ts exists, exports resolveNodeLauncher, imports no vscode');
    }
}

// ─── 2: no literal node spawn anywhere under src/ ────────────────────────────

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') { continue; }
            out.push(...walk(full));
        } else if (/\.(ts|js)$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

// Matches spawn('node', …), spawnSync("node", …), execFile('node', …) and the
// cp./child_process. prefixed forms of each.
const LITERAL_NODE_SPAWN = /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*['"]node(?:\.exe)?['"]/;

const offenders = [];
for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    text.split('\n').forEach((line, i) => {
        // Skip comment lines: the explanatory comments about this bug quote the
        // old call, and quoting it is not committing it.
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) { return; }
        if (LITERAL_NODE_SPAWN.test(line)) {
            offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
        }
    });
}

if (offenders.length > 0) {
    fail('a literal node binary is still being spawned — PATH picks the interpreter ' +
         'and a bad one dies at DLL init with no output (#615, #723):\n' +
         offenders.map(o => '        ' + o).join('\n'));
} else {
    ok('no literal node spawn under src/ — every call site resolves the binary');
}

// ─── 3: resolved spawns pass the launcher's env through ──────────────────────

// Resolving the command without carrying its env is the subtle half-fix:
// ELECTRON_RUN_AS_NODE lives in that env, and without it the Electron host
// binary launches a VS Code window instead of running the script.
const halfFixed = [];
for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/resolveNodeLauncher\s*\(/.test(text)) { continue; }
    if (path.resolve(file) === path.resolve(LAUNCHER)) { continue; }
    // Find each spawn whose command comes from the launcher, and look for an
    // env in the options object that follows it.
    const spawns = text.match(/\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(\s*(?:launcher\.)?command\s*,[\s\S]{0,400}?\}\s*[,)]/g) || [];
    for (const call of spawns) {
        if (!/\benv\s*:/.test(call)) {
            halfFixed.push(path.relative(ROOT, file));
        }
    }
}

if (halfFixed.length > 0) {
    fail('a call site resolves the command but does not pass the launcher env — ' +
         'without ELECTRON_RUN_AS_NODE the host binary opens a window instead of ' +
         'running the script (#723): ' + [...new Set(halfFixed)].join(', '));
} else {
    ok('every resolved spawn carries the launcher env');
}

// ─── 4: the launcher leaves the caller's env alone ───────────────────────────

// Behavioural, not a grep. A launcher that mutated the shared process.env
// would set ELECTRON_RUN_AS_NODE for everything else the extension spawns.
if (fs.existsSync(LAUNCHER)) {
    const text = fs.readFileSync(LAUNCHER, 'utf8');
    const body = text.match(/export\s+function\s+resolveNodeLauncher[\s\S]*?\n\}/);
    if (!body) {
        fail('could not read resolveNodeLauncher() to check for env mutation');
    } else {
        // Strip the TypeScript type annotation, then run the real function.
        const js = body[0]
            .replace(/export\s+function/, 'function')
            .replace(/\(env:[^)]*\)\s*:\s*NodeLaunch/, '(env)');
        // eslint-disable-next-line no-new-func
        const resolve = new Function(`${js}; return resolveNodeLauncher;`)();
        const caller = { PATH: 'unchanged' };
        const result = resolve(caller);
        if (caller.ELECTRON_RUN_AS_NODE !== undefined) {
            fail('resolveNodeLauncher mutated the env it was given — every later spawn ' +
                 'in this process would inherit ELECTRON_RUN_AS_NODE');
        } else if (result.env.PATH !== 'unchanged') {
            fail('resolveNodeLauncher dropped the caller\'s existing env');
        } else if (result.env.ELECTRON_RUN_AS_NODE !== '1') {
            fail('resolveNodeLauncher did not set ELECTRON_RUN_AS_NODE=1');
        } else {
            ok('resolveNodeLauncher copies the env, preserves it, and does not mutate the caller\'s');
        }
    }
}

// ─── Result ──────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
    console.log(`✓ All ${passed} REG-139 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} REG-139 test(s) FAILED\n`);
    process.exit(1);
}
