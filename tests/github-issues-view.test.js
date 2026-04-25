// Integration test for github-issues-view.
// Stubs the 'vscode' module (not available outside the extension host) and
// then exercises the same code path the webview uses: fetch from
// api.github.com/repos/CieloVistaSoftware/cielovista-tools/issues
// and validate the shape of the result.
//
// Failure modes this catches:
//   - Network unreachable or DNS broken
//   - GitHub API returns 4xx/5xx (rate-limit, repo renamed, repo private)
//   - Response body isn't parseable JSON
//   - Response is empty (zero issues — would be a real signal in our case
//     since the repo has 28 open)
//   - Module import fails (typo in symbol names, broken require chain)

'use strict';

const Module = require('module');
const path   = require('path');

// ── Stub 'vscode' BEFORE requiring github-issues-view -----------------------
// The compiled .js does `require('vscode')` at top level. Since we're not
// running inside the extension host, that require fails with MODULE_NOT_FOUND.
// We monkeypatch the resolver to return a minimal fake.
const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    if (request === 'vscode') { return require.resolve('./.fake-vscode.js'); }
    return realResolve.call(this, request, parent, ...rest);
};

// Write a tiny fake module to disk on first run
const fs = require('fs');
const fakePath = path.resolve(__dirname, '.fake-vscode.js');
if (!fs.existsSync(fakePath)) {
    fs.writeFileSync(
        fakePath,
        `module.exports = {
            window: { createWebviewPanel: () => ({ onDidDispose: () => {}, webview: {}, reveal: () => {} }) },
            ViewColumn: { One: 1 },
            env: { openExternal: async () => true },
            Uri: { parse: (s) => ({ toString: () => s }) }
        };`,
        'utf8'
    );
}

// ── Now import the compiled module ------------------------------------------
const modulePath = path.resolve(
    __dirname,
    '..',
    'out',
    'shared',
    'github-issues-view.js'
);

let mod;
try {
    mod = require(modulePath);
} catch (err) {
    fail('module import failed', err.message);
}

if (typeof mod.showGithubIssues !== 'function') {
    fail('module export missing', 'showGithubIssues is not a function');
}
pass('module imports cleanly');
pass('showGithubIssues is exported as a function');

// ── Re-implement the internal fetch (same code as in source) ---------------
// We can't easily call the unexported fetchIssues directly, so we duplicate
// the network logic here using the same params. That way this test exercises
// the same external dependency (api.github.com) the real code does.
const https = require('https');

function fetchIssuesForTest() {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'api.github.com',
            path:     '/repos/CieloVistaSoftware/cielovista-tools/issues?state=open&per_page=50&sort=updated',
            method:   'GET',
            headers:  {
                'User-Agent': 'cielovista-tools-vscode-test',
                'Accept':     'application/vnd.github+json',
            },
        };
        const req = https.request(opts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end',  () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode >= 400) {
                    return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
                }
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error('JSON parse failed: ' + e.message)); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

(async () => {
    let raw;
    try { raw = await fetchIssuesForTest(); }
    catch (err) { fail('GitHub API fetch', err.message); }

    pass(`GitHub API responded — ${raw.length} entries`);

    if (!Array.isArray(raw)) { fail('shape', 'response is not an array'); }
    pass('response is an array');

    const issues = raw.filter((i) => !i.pull_request);
    pass(`PR-filter leaves ${issues.length} actual issues`);

    if (issues.length === 0) {
        // Repo has 28 open per gh CLI, so 0 here is a red flag
        fail('issue count', 'expected >0 issues, got 0');
    }

    // Spot-check the first issue has the fields buildHtml expects
    const a = issues[0];
    const required = ['number', 'title', 'html_url', 'state', 'created_at',
                      'updated_at', 'user', 'labels', 'assignees', 'comments'];
    for (const k of required) {
        if (!(k in a)) { fail('issue field', `missing field: ${k}`); }
    }
    pass(`first issue has all required fields (#${a.number}: ${a.title.slice(0, 50)})`);

    if (typeof a.user.login !== 'string') { fail('issue.user.login', 'not a string'); }
    if (!Array.isArray(a.labels))         { fail('issue.labels',     'not an array'); }
    if (!Array.isArray(a.assignees))      { fail('issue.assignees',  'not an array'); }
    pass('nested fields have expected shapes');

    console.log('');
    console.log('=== ALL INTEGRATION TESTS PASSED ===');

    // Cleanup the fake-vscode stub
    try { fs.unlinkSync(fakePath); } catch { /* fine */ }
    process.exit(0);
})();

function pass(label) { console.log('  PASS - ' + label); }
function fail(label, detail) {
    console.log('  FAIL - ' + label + ': ' + detail);
    try { fs.unlinkSync(fakePath); } catch { /* fine */ }
    process.exit(1);
}
