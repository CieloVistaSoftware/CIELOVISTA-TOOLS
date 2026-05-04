'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

const vscodeMock = {
    window: {
        createWebviewPanel: () => ({
            onDidDispose: () => {},
            reveal: () => {},
            webview: {
                html: '',
                onDidReceiveMessage: () => {},
            },
        }),
    },
    ViewColumn: { One: 1 },
    env: { openExternal: async () => true },
    Uri: { parse: (s) => ({ toString: () => s }) },
};

const _origResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = (req, ...args) => req === 'vscode' ? '__vs_issues_ui__' : _origResolve(req, ...args);
require.cache.__vs_issues_ui__ = {
    id: '__vs_issues_ui__',
    filename: '__vs_issues_ui__',
    loaded: true,
    exports: vscodeMock,
    parent: null,
    children: [],
    path: '',
    paths: [],
};

const outPath = path.join(__dirname, '../../out/shared/github-issues-view.js');
if (!fs.existsSync(outPath)) {
    console.error('SKIP: not compiled');
    process.exit(0);
}

const mod = require(outPath);
if (!mod || !mod._test || typeof mod._test.buildHtml !== 'function') {
    console.error('FAIL: _test.buildHtml export missing');
    process.exit(1);
}

const buildHtml = mod._test.buildHtml;
const formatIssuesForClipboard = mod._test.formatIssuesForClipboard;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS - ${name}`);
    } catch (err) {
        failed++;
        console.log(`  FAIL - ${name}: ${err.message}`);
    }
}

function has(haystack, needle, label) {
    assert.ok(String(haystack).includes(needle), label || `Expected to include: ${needle}`);
}

const sampleIssues = [{
    number: 123,
    title: 'Issue viewer row renders correctly',
    html_url: 'https://github.com/CieloVistaSoftware/cielovista-tools/issues/123',
    state: 'open',
    created_at: '2026-04-26T12:00:00.000Z',
    updated_at: '2026-04-27T12:00:00.000Z',
    user: { login: 'john' },
    labels: [{ name: 'bug', color: 'd73a4a' }],
    assignees: [{ login: 'alice' }],
    body: 'Details',
    comments: 2,
}];

console.log('\ngithub-issues-view UI unit tests\n' + '-'.repeat(40));

test('header has clickable GitHub repo anchor', () => {
    const html = buildHtml(false, sampleIssues, null);
    has(html, '<a id="repo-link" href="https://github.com/CieloVistaSoftware/cielovista-tools" class="repo-link"', 'repo anchor missing or malformed');
    has(html, "var repo = document.getElementById('repo-link');", 'repo-link JS lookup missing');
    has(html, "repo.addEventListener('click'", 'repo-link click handler missing');
    has(html, "if (href) { vsc.postMessage({ type: 'open', url: href }); }", 'repo-link open message missing');
});

test('header includes copy-all button and message handler', () => {
    const html = buildHtml(false, sampleIssues, null);
    has(html, 'id="copy-all"', 'copy-all button missing');
    has(html, 'Copy All', 'copy-all label missing');
    has(html, "var copyAll = document.getElementById('copy-all');", 'copy-all JS lookup missing');
    has(html, "vsc.postMessage({ type: 'copyAll' });", 'copy-all postMessage missing');
});

test('full-width CSS rules are present', () => {
    const html = buildHtml(false, sampleIssues, null);
    has(html, 'html,body{width:100% !important;max-width:none !important}', 'root full-width css missing');
    has(html, '#body{padding:14px 20px;width:100% !important;max-width:none !important;', 'body container full-width css missing');
    has(html, '.table-wrap{', 'table wrapper css missing');
    has(html, 'width:100%;max-width:none', 'table wrapper width css missing');
});

test('issue rows render clickable title buttons with URLs', () => {
    const html = buildHtml(false, sampleIssues, null);
    has(html, 'class="title-btn"', 'title button missing');
    has(html, 'data-url="https://github.com/CieloVistaSoftware/cielovista-tools/issues/123"', 'issue URL binding missing');
    has(html, "vsc.postMessage({ type: 'open', url: url });", 'open message handler missing');
});

test('empty state renders explicit no-open-issues message', () => {
    const html = buildHtml(false, [], null);
    has(html, 'No open issues.', 'empty-state text missing');
});

test('error state renders fetch failure panel', () => {
    const html = buildHtml(false, null, 'boom');
    has(html, "Couldn't fetch issues.", 'error-state heading missing');
    has(html, 'boom', 'error detail missing');
});

test('clipboard formatter includes key issue fields', () => {
    const text = formatIssuesForClipboard(sampleIssues);
    has(text, '#123 Issue viewer row renders correctly', 'issue heading missing from clipboard text');
    has(text, 'URL: https://github.com/CieloVistaSoftware/cielovista-tools/issues/123', 'issue URL missing from clipboard text');
    has(text, 'Labels: bug', 'labels missing from clipboard text');
    has(text, 'Assignees: @alice', 'assignees missing from clipboard text');
});

console.log('');
if (failed > 0) {
    console.log(`FAILED: ${failed} test(s) failed, ${passed} passed`);
    process.exit(1);
}

console.log(`PASSED: ${passed} test(s)`);
process.exit(0);
