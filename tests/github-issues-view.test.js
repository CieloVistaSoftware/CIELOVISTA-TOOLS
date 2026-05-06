// Unit test for github-issues-view.
// Since esbuild bundles all modules into out/extension.js, we verify against
// the TypeScript source plus the compiled bundle.
//
// Failure modes this catches:
//   - showGithubIssues not exported from source
//   - Symbol missing from compiled bundle
//   - GitHub API returns 4xx/5xx or fails to parse

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src', 'shared', 'github-issues-view.ts');
const BUNDLE = path.join(ROOT, 'out', 'extension.js');

const src    = fs.readFileSync(SRC, 'utf8');
const bundle = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';

function pass(label) { console.log('  PASS - ' + label); }
function fail(label, detail) {
    console.log('  FAIL - ' + label + (detail ? ': ' + detail : ''));
    process.exit(1);
}

// ── Source checks ────────────────────────────────────────────────────────────
if (!src.includes('export function showGithubIssues')) {
    fail('source export', 'showGithubIssues not exported from github-issues-view.ts');
}
pass('source exports showGithubIssues');

if (!src.includes('ViewColumn')) {
    fail('source ViewColumn', 'showGithubIssues must accept a ViewColumn parameter');
}
pass('showGithubIssues accepts ViewColumn parameter');

if (!src.includes('createWebviewPanel')) {
    fail('source webview', 'showGithubIssues must call createWebviewPanel');
}
pass('showGithubIssues creates a webview panel');

// ── Bundle checks ────────────────────────────────────────────────────────────
if (bundle.length === 0) { fail('bundle', 'out/extension.js not found — run npm run compile'); }

if (!bundle.includes('showGithubIssues')) {
    fail('bundle symbol', 'showGithubIssues missing from compiled bundle');
}
pass('bundle contains showGithubIssues');

// ── Network check — exercise the same GitHub API the real code calls ─────────
const https = require('https');

function fetchIssuePage(page, perPage) {
    return new Promise((resolve, reject) => {
        const opts = {
            hostname: 'api.github.com',
            path:     `/repos/CieloVistaSoftware/cielovista-tools/issues?state=open&per_page=${perPage}&sort=updated&page=${page}`,
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
    try { raw = await fetchIssuePage(1, 50); }
    catch (err) { fail('GitHub API fetch', err.message); }

    pass(`GitHub API responded — ${raw.length} entries`);

    if (!Array.isArray(raw)) { fail('shape', 'response is not an array'); }

    const issues = raw.filter(i => !i.pull_request);
    pass(`Paged query returned ${issues.length} actual issues`);

    if (issues.length > 0) {
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
    }

    console.log('');
    console.log('=== ALL INTEGRATION TESTS PASSED ===');
    process.exit(0);
})();
