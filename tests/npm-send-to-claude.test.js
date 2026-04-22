'use strict';
/**
 * tests/npm-send-to-claude.test.js
 *
 * Tests for the "Send to Claude" button on failed npm run cards.
 *
 * Requirements:
 *   - After a failed run, a "📤 Ask Claude" button appears
 *   - Clicking it posts { command:'sendToClaude', id, text } to the extension host
 *   - Extension host copies text to clipboard AND opens Claude chat
 *   - Button only appears after failure (not on exit 0)
 *   - Button disappears when script is re-run
 *
 * Run: node tests/npm-send-to-claude.test.js
 */

'use strict';
const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const { JSDOM } = require('jsdom');

const SOURCE_NPM = path.join(__dirname, '..', 'src', 'features', 'npm-command-launcher.ts');
const INST_NPM   = path.join(
    process.env.USERPROFILE || 'C:\\Users\\jwpmi',
    '.vscode-insiders', 'extensions',
    'cielovistasoftware.cielovista-tools-1.0.0',
    'out', 'features', 'npm-command-launcher.js'
);

const src      = fs.readFileSync(SOURCE_NPM, 'utf8');
const compiled = fs.existsSync(INST_NPM) ? fs.readFileSync(INST_NPM, 'utf8') : '';

function extractNpmJsTemplate(src) {
    const marker = 'const JS = `';
    const idx    = src.indexOf(marker);
    if (idx === -1) { return null; }
    let i = idx + marker.length, out = '';
    while (i < src.length) {
        if (src[i] === '`' && src[i-1] !== '\\') break;
        out += src[i++];
    }
    return out;
}

const jsTemplate = extractNpmJsTemplate(src);

// ── Test runner ───────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Static source checks
// ═══════════════════════════════════════════════════════════════════════════

test('SOURCE: btn-ask or data-action="ask-claude" present in source', () => {
    assert.ok(
        src.includes('btn-ask') || src.includes('ask-claude') || src.includes('sendToClaude'),
        'Ask Claude button missing from source — add btn-ask or data-action="ask-claude"'
    );
});

test('SOURCE: sendToClaude command posted on click', () => {
    assert.ok(
        src.includes("'sendToClaude'") || src.includes('"sendToClaude"'),
        'sendToClaude command missing from source JS — button must post this to extension host'
    );
});

test('SOURCE: sendToClaude handler in extension host (onDidReceiveMessage)', () => {
    assert.ok(
        src.includes("msg.command === 'sendToClaude'") ||
        src.includes('sendToClaude'),
        'sendToClaude handler missing from extension host onDidReceiveMessage'
    );
});

test('SOURCE: handler copies to clipboard (env.clipboard.writeText)', () => {
    assert.ok(
        src.includes('clipboard.writeText') || src.includes('env.clipboard'),
        'Extension host must copy error text to clipboard via vscode.env.clipboard.writeText'
    );
});

test('SOURCE: handler opens Copilot Chat (workbench.action.chat.open)', () => {
    assert.ok(
        src.includes('workbench.action.chat.open') || src.includes('chat.open'),
        'Extension host must open Copilot Chat via vscode.commands.executeCommand("workbench.action.chat.open")'
    );
});

test('COMPILED: sendToClaude present in installed output', () => {
    assert.ok(compiled.length > 0, 'Installed npm-command-launcher.js not found — rebuild needed');
    assert.ok(
        compiled.includes('sendToClaude'),
        'sendToClaude missing from compiled output — rebuild after adding feature'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// DOM behavior tests
// ═══════════════════════════════════════════════════════════════════════════

const TEST_ID = 'ask-claude-test-001';

function makeDom(rc) {
    if (!jsTemplate) { throw new Error('Could not extract JS template'); }
    const rendered = jsTemplate
        .replace(/\$\{scriptsJson\}/g, JSON.stringify([{
            id: TEST_ID, folder: 'proj', scriptName: 'test:ui:cards',
            cmd: 'playwright test', packageJsonPath: 'C:\\proj\\package.json'
        }]))
        .replace(/\$\{total\}/g, '1');

    const html = `<!DOCTYPE html><html><head></head><body>
<input id="search" type="text"><span id="stat"></span><div id="empty"></div>
<div class="folder-section"><div class="folder-cards">
  <div class="script-card" data-id="${TEST_ID}" data-name="test:ui:cards" data-folder="proj">
    <div class="sc-header"><div class="sc-name">test:ui:cards</div><div class="sc-cmd">playwright test</div></div>
    <div class="sc-btns">
      <button class="btn-run"  data-action="run"  data-id="${TEST_ID}">Run</button>
      <button class="btn-stop" data-action="stop" data-id="${TEST_ID}" style="display:none">Stop</button>
      <button class="btn-fix"  data-action="fix"  data-id="${TEST_ID}" data-pkg="C:\\proj\\package.json" style="display:none">Fix</button>
      <button class="btn-copy" data-action="copy" data-id="${TEST_ID}" style="display:none">Copy</button>
      <button class="btn-ask"  data-action="ask-claude" data-id="${TEST_ID}" style="display:none">Ask Claude</button>
    </div>
    <div class="sc-output" style="display:none">
      <pre class="sc-pre">Error: All CieloVista Tools card buttons open a webview\n  at tests/ui/all-cards-webview.spec.ts:14:5</pre>
      <div class="sc-rc"></div>
    </div>
  </div>
</div></div>
<script>${rendered}</script></body></html>`;

    const messages = [];
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({ postMessage: m => messages.push(m), getState: () => null, setState: () => {} });
            win.CSS = { escape: s => String(s) };
            win.requestAnimationFrame = fn => setTimeout(fn, 0);
        },
    });
    // Simulate the run completing
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
        data: { type: 'done', id: TEST_ID, rc }
    }));
    return { dom, messages, doc: dom.window.document, win: dom.window };
}

test('DOM: Ask Claude button hidden before run completes', () => {
    if (!jsTemplate) { throw new Error('No JS template'); }
    const rendered = jsTemplate
        .replace(/\$\{scriptsJson\}/g, JSON.stringify([{id:TEST_ID, folder:'proj', scriptName:'build', cmd:'tsc', packageJsonPath:'C:\\proj\\package.json'}]))
        .replace(/\$\{total\}/g, '1');
    const html = `<!DOCTYPE html><html><head></head><body>
<input id="search" type="text"><span id="stat"></span><div id="empty"></div>
<div class="folder-section"><div class="folder-cards">
  <div class="script-card" data-id="${TEST_ID}" data-name="build" data-folder="proj">
    <div class="sc-btns">
      <button class="btn-run" data-action="run" data-id="${TEST_ID}">Run</button>
      <button class="btn-stop" data-action="stop" data-id="${TEST_ID}" style="display:none">Stop</button>
      <button class="btn-fix" data-action="fix" data-id="${TEST_ID}" data-pkg="C:\\proj\\package.json" style="display:none">Fix</button>
      <button class="btn-copy" data-action="copy" data-id="${TEST_ID}" style="display:none">Copy</button>
      <button class="btn-ask" data-action="ask-claude" data-id="${TEST_ID}" style="display:none">Ask Claude</button>
    </div>
    <div class="sc-output" style="display:none"><pre class="sc-pre"></pre><div class="sc-rc"></div></div>
  </div>
</div></div>
<script>${rendered}</script></body></html>`;
    const dom = new JSDOM(html, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({ postMessage: () => {}, getState: () => null, setState: () => {} });
            win.CSS = { escape: s => String(s) };
        },
    });
    const btn = dom.window.document.querySelector('[data-action="ask-claude"]');
    assert.ok(!btn || btn.style.display === 'none', 'Ask Claude button must be hidden before any run');
});

test('DOM: Ask Claude button NOT shown after exit 0 (success)', () => {
    const { doc } = makeDom(0);
    const btn = doc.querySelector('[data-action="ask-claude"]');
    assert.ok(
        !btn || btn.style.display === 'none',
        'Ask Claude button must NOT appear after successful run (exit 0)'
    );
});

test('DOM: Ask Claude button IS shown after exit 1 (failure)', () => {
    const { doc } = makeDom(1);
    const btn = doc.querySelector('[data-action="ask-claude"]');
    assert.ok(btn, 'Ask Claude button must exist in DOM');
    assert.ok(
        btn.style.display !== 'none',
        'Ask Claude button must be VISIBLE after failed run (exit 1)'
    );
});

test('DOM: Clicking Ask Claude posts sendToClaude with error text', () => {
    const { doc, win, messages } = makeDom(1);
    messages.length = 0;
    const btn = doc.querySelector('[data-action="ask-claude"]');
    assert.ok(btn, 'Ask Claude button must exist');
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const msg = messages.find(m => m.command === 'sendToClaude');
    assert.ok(msg, `No sendToClaude message posted. Got: ${JSON.stringify(messages)}`);
    assert.ok(msg.id === TEST_ID, `Wrong id in sendToClaude message: ${msg.id}`);
    assert.ok(msg.text && msg.text.length > 0, 'sendToClaude message must include the error text');
    assert.ok(
        msg.text.includes('Error') || msg.text.includes('error') || msg.text.length > 10,
        'sendToClaude text should contain the error output from sc-pre'
    );
});

test('DOM: Ask Claude button hidden after re-run starts', () => {
    const { doc, win, messages } = makeDom(1);
    // Now simulate re-run
    const runBtn = doc.querySelector('[data-action="run"]');
    assert.ok(runBtn, 'Run button must exist for re-run test');
    runBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const askBtn = doc.querySelector('[data-action="ask-claude"]');
    assert.ok(
        !askBtn || askBtn.style.display === 'none',
        'Ask Claude button must be hidden when script is re-run'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(60));
console.log('NPM "Ask Claude" Button Tests');
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
