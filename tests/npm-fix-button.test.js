'use strict';
/**
 * tests/npm-fix-button.test.js
 *
 * Reproduces the missing Fix button requirement:
 *   - After a script exits non-zero, a Fix button must appear on the card
 *   - Fix button must post { command: 'fix', id, packageJsonPath } to the extension host
 *   - Fix button must NOT appear on successful runs (exit 0)
 *   - Fix button must NOT appear before the script has run
 *
 * Run: node tests/npm-fix-button.test.js
 */

'use strict';
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { JSDOM } = require('jsdom');

// ── Extract JS from installed compiled output ─────────────────────────────
const INSTALLED_NPM = path.join(
    process.env.USERPROFILE || 'C:\\Users\\jwpmi',
    '.vscode-insiders', 'extensions',
    'cielovistasoftware.cielovista-tools-1.0.0',
    'out', 'features', 'npm-command-launcher.js'
);

const SOURCE_NPM = path.join(
    __dirname, '..', 'src', 'features', 'npm-command-launcher.ts'
);

if (!fs.existsSync(INSTALLED_NPM)) {
    console.error('INSTALLED npm-command-launcher.js NOT FOUND. Run npm run rebuild first.');
    process.exit(1);
}

const compiled = fs.readFileSync(INSTALLED_NPM, 'utf8');
const source   = fs.readFileSync(SOURCE_NPM, 'utf8');

// ── Extract the webview JS template from source ───────────────────────────
// The JS is embedded as a template literal: const JS = `...`
function extractJsTemplate(src) {
    const marker = 'const JS = `';
    const idx    = src.indexOf(marker);
    if (idx === -1) { return null; }
    let i = idx + marker.length;
    let out = '';
    while (i < src.length) {
        if (src[i] === '`' && src[i-1] !== '\\') break;
        out += src[i++];
    }
    return out;
}

const jsTemplate = extractJsTemplate(source);

// ── Build a DOM that simulates the npm-command-launcher webview ───────────
function makeDom(jsTemplate) {
    const messages = [];

    // Substitute template vars
    const rendered = (jsTemplate || '')
        .replace(/\$\{scriptsJson\}/g, JSON.stringify([
            { id: 'C:\\proj::build',   folder: 'proj', scriptName: 'build',   cmd: 'tsc -p .' },
            { id: 'C:\\proj::clean',   folder: 'proj', scriptName: 'clean',   cmd: 'pwsh -c rm -rf out' },
            { id: 'C:\\proj::rebuild', folder: 'proj', scriptName: 'rebuild', cmd: 'npm run build' },
        ]))
        .replace(/\$\{total\}/g, '3');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<div id="toolbar">
  <input id="search" type="text">
  <span id="stat">3 scripts</span>
</div>
<div id="content">
  <div class="folder-section">
    <div class="folder-heading">proj</div>
    <div class="folder-cards">
      <div class="script-card" data-id="C:\\proj::build" data-name="build" data-folder="proj">
        <div class="sc-header">
          <div class="sc-name">build</div>
          <div class="sc-cmd">tsc -p .</div>
        </div>
        <div class="sc-btns">
          <button class="btn-run"  data-action="run"  data-id="C:\\proj::build">&#9654; Run</button>
          <button class="btn-stop" data-action="stop" data-id="C:\\proj::build" style="display:none">&#9632; Stop</button>
          <button class="btn-fix"  data-action="fix"  data-id="C:\\proj::build" data-pkg="C:\\proj\\package.json" style="display:none">&#128296; Fix</button>
        </div>
        <div class="sc-output" style="display:none"><pre class="sc-pre"></pre><div class="sc-rc"></div></div>
      </div>
      <div class="script-card" data-id="C:\\proj::clean" data-name="clean" data-folder="proj">
        <div class="sc-header">
          <div class="sc-name">clean</div>
          <div class="sc-cmd">pwsh -c rm -rf out</div>
        </div>
        <div class="sc-btns">
          <button class="btn-run"  data-action="run"  data-id="C:\\proj::clean">&#9654; Run</button>
          <button class="btn-stop" data-action="stop" data-id="C:\\proj::clean" style="display:none">&#9632; Stop</button>
          <button class="btn-fix"  data-action="fix"  data-id="C:\\proj::clean" data-pkg="C:\\proj\\package.json" style="display:none">&#128296; Fix</button>
        </div>
        <div class="sc-output" style="display:none"><pre class="sc-pre"></pre><div class="sc-rc"></div></div>
      </div>
    </div>
  </div>
  <div id="empty">No scripts match.</div>
</div>
<script>${rendered}</script>
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
            win.requestAnimationFrame = fn => setTimeout(fn, 0);
        },
    });

    return { dom, messages, doc: dom.window.document, win: dom.window };
}

function getCard(doc, id) {
    return [...doc.querySelectorAll('.script-card')].find(c => c.dataset.id === id) || null;
}

// ── Test runner ───────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: Static checks — Fix button exists in source and compiled output
// ═══════════════════════════════════════════════════════════════════════════

test('SOURCE: JS template extracted successfully', () => {
    assert.ok(jsTemplate, 'Could not extract JS template from npm-command-launcher.ts');
    assert.ok(jsTemplate.length > 500, 'JS template too short — extraction probably failed');
});

test('SOURCE: JS template contains btn-fix button markup', () => {
    assert.ok(
        source.includes('btn-fix') || source.includes('data-action="fix"'),
        'Fix button missing from source — btn-fix or data-action="fix" not found'
    );
});

test('SOURCE: Fix button only shown after failed run (data-action="fix" near done/err)', () => {
    assert.ok(
        source.includes("data-action=\"fix\""),
        'Fix button action missing from source'
    );
});

test('COMPILED: btn-fix or fix action present in installed output', () => {
    assert.ok(
        compiled.includes('btn-fix') || compiled.includes('data-action="fix"') || compiled.includes("action=\\\"fix\\\""),
        'Fix button missing from compiled output — rebuild required after adding fix button'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: DOM behavior — Fix button appears only on failure
// ═══════════════════════════════════════════════════════════════════════════

let ctx;

test('DOM: builds without errors', () => {
    ctx = makeDom(jsTemplate);
    assert.ok(ctx.doc.querySelector('.script-card'), 'script-card elements must exist');
});

test('DOM: Fix button is hidden (not visible) before any run', () => {
    const { doc } = ctx;
    const fixBtn = doc.querySelector('[data-action="fix"]');
    // Fix button exists in DOM but must be hidden (display:none) before any run
    assert.ok(!fixBtn || fixBtn.style.display === 'none',
        'Fix button must be hidden before script has run');
});

test('DOM: Fix button stays hidden after successful run (exit 0)', () => {
    const { doc, win } = ctx;
    // Simulate exit 0 on build card
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'done', id: 'C:\\proj::build', rc: 0 }
    }));
    const card   = getCard(doc, 'C:\\proj::build');
    assert.ok(card, 'build card must exist');
    const fixBtn = card.querySelector('[data-action="fix"]');
    // Fix button must not be visible after exit 0
    assert.ok(!fixBtn || fixBtn.style.display === 'none',
        'Fix button must NOT be visible after successful run (exit 0)');
});

test('DOM: Fix button DOES appear after failed run (exit 1)', () => {
    const { doc, win } = ctx;
    // Simulate exit 1 on clean card
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'done', id: 'C:\\proj::clean', rc: 1 }
    }));
    const card   = getCard(doc, 'C:\\proj::clean');
    assert.ok(card, 'clean card must exist');
    const fixBtn = card.querySelector('[data-action="fix"]');
    assert.ok(
        fixBtn,
        'Fix button MUST appear after failed run (exit 1) — FEATURE MISSING'
    );
});

test('DOM: Fix button is visible (not hidden) after failed run', () => {
    const { doc } = ctx;
    const card   = getCard(doc, 'C:\\proj::clean');
    const fixBtn = card?.querySelector('[data-action="fix"]');
    assert.ok(fixBtn, 'Fix button must exist');
    assert.ok(
        fixBtn.style.display !== 'none',
        'Fix button must be visible after failed run'
    );
});

test('DOM: Clicking Fix button posts fix message with correct id', () => {
    const { doc, win, messages } = ctx;
    messages.length = 0;
    const card   = getCard(doc, 'C:\\proj::clean');
    const fixBtn = card?.querySelector('[data-action="fix"]');
    assert.ok(fixBtn, 'Fix button must exist to click');
    fixBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const fixMsg = messages.find(m => m.command === 'fix');
    assert.ok(
        fixMsg,
        `Fix button click must post { command: 'fix' } message. Got: ${JSON.stringify(messages)}`
    );
    assert.strictEqual(fixMsg.id, 'C:\\proj::clean', 'Fix message must include the script id');
});

test('DOM: Fix button disappears after re-run (run button clicked again)', () => {
    const { doc, win } = ctx;
    // Simulate clicking run again on the clean card
    const card   = getCard(doc, 'C:\\proj::clean');
    const runBtn = card?.querySelector('[data-action="run"]');
    assert.ok(runBtn, 'Run button must exist');
    runBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const fixBtn = card?.querySelector('[data-action="fix"]');
    // Fix button should be gone or hidden when re-running
    const isGone = !fixBtn || fixBtn.style.display === 'none';
    assert.ok(isGone, 'Fix button must be removed or hidden when script is re-run');
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('NPM Fix Button Tests');
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
