/**
 * tests/npm-fix-button.test.js
 *
 * Tests the npm-command-launcher output panel behavior:
 *   - When a script starts, a job card appears (btn-chat hidden)
 *   - When done (any exit code), btn-chat becomes visible
 *   - Clicking btn-chat posts {command:'copy-to-chat', text, jobKey}
 *   - When chat-sent is received, btn-chat gets .done class
 *
 * Run: node tests/npm-fix-button.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { JSDOM } = require('jsdom');

// ── Extract JS from installed compiled output ─────────────────────────────
// Dynamically find installed extension (any version)
const EXT_ROOT = path.join(process.env.USERPROFILE || 'C:\\Users\\jwpmi', '.vscode-insiders', 'extensions');
const extDir = fs.readdirSync(EXT_ROOT).find(d => d.startsWith('cielovistasoftware.cielovista-tools-'));
const INSTALLED_NPM = extDir
    ? path.join(EXT_ROOT, extDir, 'out', 'features', 'npm-command-launcher.js')
    : '';

const SOURCE_NPM = path.join(
    __dirname, '..', 'src', 'features', 'npm-command-launcher.ts'
);

if (!fs.existsSync(INSTALLED_NPM)) {
    console.error('INSTALLED npm-command-launcher.js NOT FOUND. Run npm run rebuild first.');
    process.exit(1);
}

const compiled = fs.readFileSync(INSTALLED_NPM, 'utf8');
const source   = fs.readFileSync(SOURCE_NPM, 'utf8');


// ── Extract the inlined <script> JS from the compiled HTML template ───────
function extractWebviewJs(src) {
    // The compiled JS has the HTML as a template literal ending with `);`
    // Extract everything between <script>( and )</script>
    const scriptStart = src.indexOf('<script>(function(){');
    if (scriptStart === -1) { return null; }
    const scriptEnd = src.indexOf('})();</script>');
    if (scriptEnd === -1) { return null; }
    return src.slice(scriptStart + '<script>'.length, scriptEnd + '})();'.length);
}

const webviewJs = extractWebviewJs(compiled);

// ── Build a DOM that simulates the npm-command-launcher output webview ────
function makeDom(js) {
    const messages = [];
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<div id="cvt-header">
  <span class="title">NPM Output</span>
  <span class="hint" id="cvt-header-hint">hint</span>
  <button class="clear-btn" id="btn-clear">Clear</button>
</div>
<div id="log"></div>
<div id="stopbar"><span id="stop-label"></span><button id="btn-stop-cur">Stop</button></div>
<script>${js || ''}</script>
</body></html>`;

    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({
                postMessage: msg => messages.push(msg),
                getState:    ()   => null,
                setState:    ()   => {},
            });
        },
    });

    return { dom, messages, doc: dom.window.document, win: dom.window };
}

// ── Test runner ───────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Static checks — source and compiled output have btn-chat
// ═══════════════════════════════════════════════════════════════════════════

test('SOURCE: btn-chat button present in source', () => {
    assert.ok(source.includes('btn-chat'), 'btn-chat missing from source');
});

test('SOURCE: copy-to-chat command present in source', () => {
    assert.ok(source.includes('copy-to-chat'), 'copy-to-chat command missing from source');
});

test('SOURCE: chat-sent handler present in source', () => {
    assert.ok(source.includes('chat-sent'), 'chat-sent message handler missing from source');
});

test('COMPILED: webview JS extracted successfully from compiled output', () => {
    assert.ok(webviewJs, 'Could not extract webview JS from compiled npm-command-launcher.js');
    assert.ok(webviewJs.length > 200, 'Extracted JS too short');
});

test('COMPILED: btn-chat present in compiled output', () => {
    assert.ok(compiled.includes('btn-chat'), 'btn-chat missing from compiled output — rebuild required');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: DOM behavior — job card lifecycle
// ═══════════════════════════════════════════════════════════════════════════

let ctx;

test('DOM: builds without errors and log div exists', () => {
    ctx = makeDom(webviewJs);
    assert.ok(ctx.doc.getElementById('log'), '#log element must exist');
});

test('DOM: no job cards before any job-start message', () => {
    const { doc } = ctx;
    assert.strictEqual(doc.querySelectorAll('.job').length, 0, 'No job cards before run');
});

test('DOM: job card appears after job-start message', () => {
    const { doc, win } = ctx;
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'job-start', jobKey: 'k1', script: 'build', folder: 'proj', time: '12:00' }
    }));
    const card = doc.getElementById('job-k1');
    assert.ok(card, 'job card must appear after job-start');
});

test('DOM: btn-chat is hidden before job completes', () => {
    const { doc } = ctx;
    const btn = doc.querySelector('#job-k1 .btn-chat');
    assert.ok(btn, 'btn-chat must exist in job card');
    assert.ok(!btn.classList.contains('show'), 'btn-chat must not have .show class before done');
});

test('DOM: btn-chat becomes visible after done message (exit 0)', () => {
    const { doc, win } = ctx;
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'done', jobKey: 'k1', code: 0 }
    }));
    const btn = doc.querySelector('#job-k1 .btn-chat');
    assert.ok(btn, 'btn-chat must exist after done');
    assert.ok(btn.classList.contains('show'), 'btn-chat must have .show class after done');
});

test('DOM: btn-chat becomes visible after done message (exit 1 failure)', () => {
    const { doc, win } = ctx;
    // Start a second job to test failure path
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'job-start', jobKey: 'k2', script: 'test', folder: 'proj', time: '12:01' }
    }));
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'done', jobKey: 'k2', code: 1 }
    }));
    const btn = doc.querySelector('#job-k2 .btn-chat');
    assert.ok(btn, 'btn-chat must exist after failed run');
    assert.ok(btn.classList.contains('show'), 'btn-chat must be visible after exit 1');
});

test('DOM: rc element shows failure text after exit 1', () => {
    const { doc } = ctx;
    const rc = doc.getElementById('rc-k2');
    assert.ok(rc, 'rc element must exist');
    assert.ok(rc.classList.contains('fail'), 'rc must have .fail class after non-zero exit');
    assert.ok(rc.textContent.includes('Exit 1'), 'rc must show exit code');
});

test('DOM: clicking btn-chat posts copy-to-chat message', () => {
    const { doc, win, messages } = ctx;
    messages.length = 0;
    const btn = doc.querySelector('#job-k1 .btn-chat');
    assert.ok(btn, 'btn-chat must exist');
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const msg = messages.find(m => m.command === 'copy-to-chat');
    assert.ok(msg, `btn-chat click must post {command:'copy-to-chat'}. Got: ${JSON.stringify(messages)}`);
    assert.strictEqual(msg.jobKey, 'k1', 'Message must include the jobKey');
});

test('DOM: btn-chat gets .done class after chat-sent', () => {
    const { doc, win } = ctx;
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'chat-sent', jobKey: 'k1', ok: true }
    }));
    const btn = doc.querySelector('#job-k1 .btn-chat');
    assert.ok(btn && btn.classList.contains('done'), 'btn-chat must have .done class after chat-sent');
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('NPM Output Panel Tests (npm-fix-button)');
console.log('='.repeat(60));
for (const r of results) {
    const icon = r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${icon}  ${r.name}`);
    if (!r.ok) console.log(`         \x1b[31m→ ${r.err}\x1b[0m`);
}
console.log('='.repeat(60));
const failStr = failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed';
console.log(`${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, ${failStr}\n`);
if (failed > 0) process.exit(1);

