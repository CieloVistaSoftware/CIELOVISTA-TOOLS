/**
 * tests/unit/npm-start-browser.test.js
 *
 * Unit tests for the localhost URL detection logic added to
 * npm-command-launcher.ts to fix issue #36/#37.
 *
 * The fix: when running start/dev/serve/preview scripts, stdout/stderr is
 * scanned for localhost URLs. The first match triggers
 * vscode.commands.executeCommand('simpleBrowser.show', url).
 *
 * This file tests the pure detection logic (regex + script-name gate)
 * without spawning any processes or requiring VS Code.
 *
 * Covers:
 *   - LOCALHOST_URL regex matches http and https variants
 *   - SERVER_SCRIPTS regex gates on start/dev/serve/preview only
 *   - maybeOpenBrowser() fires exactly once per run
 *   - maybeOpenBrowser() does nothing for non-server scripts (build/test/etc.)
 *   - maybeOpenBrowser() does nothing when output contains no URL
 *   - URL with path suffix is captured correctly
 *
 * Run: node tests/unit/npm-start-browser.test.js
 */
'use strict';

const assert = require('assert');

let passed = 0, failed = 0;

function test(name, fn) {
    try   { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (e) { console.error(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function ok(v, msg)  { assert.ok(v, msg); }
function eq(a, b, m) { assert.strictEqual(a, b, m); }

// ── Replicate the detection logic from npm-command-launcher.ts ────────────
// These are the two regexes and the maybeOpenBrowser logic
const SERVER_SCRIPTS = /^(start|dev|serve|preview)$/;
const LOCALHOST_URL  = /(https?:\/\/localhost:\d+[^\s'"]*)/;

function makeMaybeOpenBrowser(script, onOpen) {
    let opened = false;
    return function maybeOpenBrowser(text) {
        if (opened || !SERVER_SCRIPTS.test(script)) { return; }
        const m = text.match(LOCALHOST_URL);
        if (!m) { return; }
        opened = true;
        onOpen(m[1]);
    };
}

console.log('\nnpm-start-browser URL detection tests');
console.log('\u2500'.repeat(50));

// ── SERVER_SCRIPTS gate ───────────────────────────────────────────────────
console.log('\n-- SERVER_SCRIPTS gate --');

test('start is a server script', ()    => ok(SERVER_SCRIPTS.test('start')));
test('dev is a server script', ()      => ok(SERVER_SCRIPTS.test('dev')));
test('serve is a server script', ()    => ok(SERVER_SCRIPTS.test('serve')));
test('preview is a server script', ()  => ok(SERVER_SCRIPTS.test('preview')));
test('build is NOT a server script', ()   => ok(!SERVER_SCRIPTS.test('build')));
test('test is NOT a server script', ()    => ok(!SERVER_SCRIPTS.test('test')));
test('compile is NOT a server script', () => ok(!SERVER_SCRIPTS.test('compile')));
test('rebuild is NOT a server script', () => ok(!SERVER_SCRIPTS.test('rebuild')));

// ── LOCALHOST_URL regex ───────────────────────────────────────────────────
console.log('\n-- LOCALHOST_URL regex --');

test('matches http://localhost:3000', () => {
    const m = 'Server running at http://localhost:3000'.match(LOCALHOST_URL);
    ok(m, 'should match');
    eq(m[1], 'http://localhost:3000');
});

test('matches https://localhost:8443', () => {
    const m = 'Listening on https://localhost:8443'.match(LOCALHOST_URL);
    ok(m, 'should match');
    eq(m[1], 'https://localhost:8443');
});

test('captures URL with path suffix', () => {
    const m = 'Open http://localhost:5173/app/ to view'.match(LOCALHOST_URL);
    ok(m, 'should match');
    eq(m[1], 'http://localhost:5173/app/');
});

test('does not match non-localhost URL', () => {
    const m = 'See https://example.com for details'.match(LOCALHOST_URL);
    ok(!m, 'should not match non-localhost');
});

test('does not match localhost without port', () => {
    const m = 'Running at http://localhost/'.match(LOCALHOST_URL);
    ok(!m, 'should not match localhost without explicit port');
});

// ── maybeOpenBrowser() behaviour ─────────────────────────────────────────
console.log('\n-- maybeOpenBrowser() behaviour --');

test('calls onOpen with URL when server script outputs localhost URL', () => {
    const calls = [];
    const maybe = makeMaybeOpenBrowser('start', url => calls.push(url));
    maybe('webpack compiled\n  Local: http://localhost:8080\n');
    eq(calls.length, 1, 'should fire once');
    eq(calls[0], 'http://localhost:8080');
});

test('fires only once even when URL appears in multiple chunks', () => {
    const calls = [];
    const maybe = makeMaybeOpenBrowser('start', url => calls.push(url));
    maybe('Server at http://localhost:3000\n');
    maybe('Also at http://localhost:3000\n');
    eq(calls.length, 1, 'should fire only once');
});

test('does not fire for non-server script regardless of output', () => {
    const calls = [];
    const maybe = makeMaybeOpenBrowser('build', url => calls.push(url));
    maybe('Build at http://localhost:3000\n');
    eq(calls.length, 0, 'build script should not trigger browser open');
});

test('does not fire when output contains no URL', () => {
    const calls = [];
    const maybe = makeMaybeOpenBrowser('dev', url => calls.push(url));
    maybe('Compiling...\n');
    maybe('Done in 2.3s\n');
    eq(calls.length, 0, 'no URL in output — should not fire');
});

test('fires on stderr output as well (many servers print URL to stderr)', () => {
    const calls = [];
    const maybe = makeMaybeOpenBrowser('dev', url => calls.push(url));
    // Simulate stderr chunk
    maybe('vite v4.0.0 dev server running at:\n  http://localhost:5173/\n');
    eq(calls.length, 1, 'should detect URL from stderr-style output');
    eq(calls[0], 'http://localhost:5173/');
});

test('captures correct URL when multiple URLs on same line', () => {
    const calls = [];
    const maybe = makeMaybeOpenBrowser('start', url => calls.push(url));
    // First match wins
    maybe('Local: http://localhost:3000 Network: http://localhost:3000');
    eq(calls.length, 1);
    ok(calls[0].startsWith('http://localhost:3000'));
});

// ── Result ────────────────────────────────────────────────────────────────
console.log('');
console.log(`=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
