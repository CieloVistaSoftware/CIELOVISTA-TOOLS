// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
'use strict';
/**
 * tests/npm-send-to-claude.test.js
 *
 * Tests for the "Copy to Chat" button on npm run job output.
 *
 * Root cause logged in #258: test was written for old design
 *   (btn-ask / ask-claude / sendToClaude) renamed during a UX refactor to
 *   (btn-chat / copy-to-chat). The JS template extraction via `const JS = \``
 *   also no longer applies — the script lives inside buildOutputShellHtml().
 *
 * What this file tests:
 *   Part 0 — Static: btn-chat class, copy-to-chat command, extension host
 *             handler, clipboard.writeText, showInformationMessage
 *   Part 1 — DOM: btn-chat appears after job done, click posts copy-to-chat
 *
 * Run: node tests/npm-send-to-claude.test.js
 */

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { JSDOM } = require('jsdom');

const SOURCE_NPM   = path.join(__dirname, '..', 'src', 'features', 'npm-command-launcher.ts');
const COMPILED_NPM = path.join(__dirname, '..', 'out', 'features', 'npm-command-launcher.js');

const src      = fs.readFileSync(SOURCE_NPM, 'utf8').replace(/\r\n/g, '\n');
const compiled = fs.existsSync(COMPILED_NPM) ? fs.readFileSync(COMPILED_NPM, 'utf8') : '';

// Resolve installed extension path dynamically — no hardcoded version
const extDir       = path.join(process.env.USERPROFILE || 'C:\\Users\\jwpmi', '.vscode-insiders', 'extensions');
const installedExt = fs.existsSync(extDir)
    ? fs.readdirSync(extDir).find(d => d.startsWith('cielovistasoftware.cielovista-tools-'))
    : null;
const installedNpmPath = installedExt
    ? path.join(extDir, installedExt, 'out', 'features', 'npm-command-launcher.js')
    : null;
const installedSrc = (installedNpmPath && fs.existsSync(installedNpmPath))
    ? fs.readFileSync(installedNpmPath, 'utf8')
    : '';

let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
    try { fn(); passed++; results.push({ ok: true, name }); }
    catch(e) { failed++; results.push({ ok: false, name, err: e.message }); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Part 0 — Static source checks
// ─────────────────────────────────────────────────────────────────────────────

test('SOURCE: btn-chat class present (replaces old btn-ask)', () => {
    assert.ok(src.includes('btn-chat'), 'btn-chat missing from source');
    assert.ok(!src.includes('btn-ask'), 'old btn-ask still in source — should be btn-chat');
});

test('SOURCE: copy-to-chat command posted on click (replaces old sendToClaude)', () => {
    assert.ok(
        src.includes("command:'copy-to-chat'") || src.includes("command: 'copy-to-chat'"),
        'copy-to-chat command missing from source JS'
    );
    assert.ok(!src.includes("'sendToClaude'"), 'old sendToClaude still present — should be copy-to-chat');
});

test('SOURCE: extension host has copy-to-chat handler', () => {
    assert.ok(
        src.includes("msg.command === 'copy-to-chat'") || src.includes("case 'copy-to-chat'"),
        'copy-to-chat handler missing from extension host'
    );
});

test('SOURCE: copy-to-chat handler calls sendToCopilotChat (which writes to clipboard)', () => {
    // clipboard.writeText is inside the imported sendToCopilotChat helper
    assert.ok(
        src.includes('sendToCopilotChat') || src.includes('clipboard.writeText') || src.includes('env.clipboard'),
        'Extension host must call sendToCopilotChat or clipboard.writeText to copy text'
    );
});

test('SOURCE: copy-to-chat handler shows showInformationMessage', () => {
    assert.ok(
        src.includes('showInformationMessage'),
        'Extension host must confirm the copy with showInformationMessage'
    );
});

test('SOURCE: btn-chat gets .show class after job done', () => {
    assert.ok(
        src.includes("classList.add('show')") || src.includes(".classList.add('show')"),
        'btn-chat must get .show class when a job completes'
    );
});

test('SOURCE: btn-chat is display:none by default', () => {
    assert.ok(
        src.includes('.btn-chat{display:none') || (src.includes('btn-chat') && src.includes('display:none')),
        'btn-chat must start hidden'
    );
});

test('COMPILED: copy-to-chat present in compiled output', () => {
    assert.ok(compiled.length > 0, `Compiled launcher not found at ${COMPILED_NPM} — run npm run compile`);
    assert.ok(compiled.includes('copy-to-chat'), 'copy-to-chat missing from compiled output — rebuild needed');
});

test('INSTALLED: copy-to-chat present in installed extension', () => {
    if (!installedSrc) {
        console.log('    (SKIP: installed extension not found)');
        return;
    }
    assert.ok(installedSrc.includes('copy-to-chat'), 'copy-to-chat missing from installed launcher — rebuild needed');
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — DOM: extract shell HTML from compiled launcher and run it
// ─────────────────────────────────────────────────────────────────────────────

function extractOutputShellHtml(compiledSrc) {
    const fnIdx = compiledSrc.indexOf('function buildOutputShellHtml()');
    if (fnIdx === -1) { return null; }
    const btStart = compiledSrc.indexOf('`', fnIdx);
    if (btStart === -1) { return null; }
    let i = btStart + 1;
    while (i < compiledSrc.length) {
        if (compiledSrc[i] === '`' && compiledSrc[i-1] !== '\\') { break; }
        i++;
    }
    return compiledSrc.slice(btStart + 1, i);
}

const shellHtml = compiled ? extractOutputShellHtml(compiled) : null;

function makeOutputDom(html) {
    const messages = [];
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>' + bodyContent + '</body></html>', {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(win) {
            win.acquireVsCodeApi = () => ({
                postMessage: (m) => messages.push(m),
                getState:    () => null,
                setState:    () => {},
            });
            win.requestAnimationFrame = (fn) => setTimeout(fn, 0);
        },
    });
    return { dom, win: dom.window, doc: dom.window.document, messages };
}

test('DOM: shell HTML extracted from compiled launcher', () => {
    assert.ok(shellHtml && shellHtml.length > 500, 'Could not extract buildOutputShellHtml output');
    assert.ok(shellHtml.includes('btn-chat'), 'btn-chat must be in shell HTML');
});

test('DOM: btn-chat not visible before any job completes', () => {
    if (!shellHtml) { throw new Error('Shell HTML not available'); }
    const { doc } = makeOutputDom(shellHtml);
    assert.strictEqual(doc.querySelectorAll('.btn-chat.show').length, 0, 'btn-chat must not be visible before any job');
});

test('DOM: btn-chat.show appears after job-done message', () => {
    if (!shellHtml) { throw new Error('Shell HTML not available'); }
    const { win, doc } = makeOutputDom(shellHtml);
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'job-start', jobKey: 'test::build', script: 'build', folder: '/proj', time: '12:00:00' }
    }));
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'done', jobKey: 'test::build', rc: 0, time: '12:00:05' }
    }));
    const chatBtn = doc.querySelector('.btn-chat.show');
    assert.ok(chatBtn, 'btn-chat must have .show class after job done');
});

test('DOM: clicking btn-chat posts copy-to-chat with job output text', () => {
    if (!shellHtml) { throw new Error('Shell HTML not available'); }
    const { win, doc, messages } = makeOutputDom(shellHtml);
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'job-start', jobKey: 'test::build', script: 'build', folder: '/proj', time: '12:00:00' }
    }));
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'output', jobKey: 'test::build', text: 'Build failed: missing module\n' }
    }));
    win.dispatchEvent(new win.MessageEvent('message', {
        data: { type: 'done', jobKey: 'test::build', rc: 1, time: '12:00:05' }
    }));
    messages.length = 0;
    const chatBtn = doc.querySelector('.btn-chat.show');
    assert.ok(chatBtn, 'btn-chat.show must exist after done');
    chatBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const msg = messages.find(m => m.command === 'copy-to-chat');
    assert.ok(msg, `copy-to-chat not posted. Messages: ${JSON.stringify(messages)}`);
    assert.ok(msg.text && msg.text.includes('Build failed'), 'copy-to-chat must include job output text');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log('NPM "Copy to Chat" Button Tests');
console.log('='.repeat(60));
for (const r of results) {
    const icon = r.ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${icon}  ${r.name}`);
    if (!r.ok) console.log(`         \x1b[31m→ ${r.err}\x1b[0m`);
}
console.log('='.repeat(60));
const failStr = failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed';
console.log(`${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, ${failStr}\n`);
if (failed > 0) { process.exit(1); }
