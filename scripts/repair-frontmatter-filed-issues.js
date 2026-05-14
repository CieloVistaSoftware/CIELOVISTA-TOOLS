// Copyright (c) CieloVista Software. All rights reserved.
// Repair script: rebuild Frontmatter Viewer filed-issue numbers from GitHub.
//
// Output: data/frontmatter-filed-issues.repair.json
//
// Usage:
//   node scripts/repair-frontmatter-filed-issues.js
//
// Optional env:
//   GITHUB_TOKEN=<token with repo read access>  (recommended to avoid low rate limits)

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const OWNER = 'CieloVistaSoftware';
const REPO = 'cielovista-tools';
const OUTPUT = path.join(__dirname, '..', 'data', 'frontmatter-filed-issues.repair.json');
const LABELS = 'auto-filed,area:frontmatter,area:docs';

function normalizeRelPath(p) {
    return String(p || '').replace(/\\/g, '/').trim();
}

function parsePathFromBody(body) {
    const text = String(body || '');
    // Expected shape from frontmatter-viewer issue body:
    // ## File
    // - Path: `relative/path.md`
    const m = text.match(/##\s*File[\s\S]*?-\s*Path:\s*`([^`]+)`/i);
    if (!m) { return null; }
    return normalizeRelPath(m[1]);
}

function githubGet(urlPath, token) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.github.com',
            path: urlPath,
            method: 'GET',
            headers: {
                'User-Agent': 'cielovista-tools-repair-script',
                'Accept': 'application/vnd.github+json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                if (!res.statusCode || res.statusCode >= 400) {
                    return reject(new Error(`GitHub GET failed (${res.statusCode || 'unknown'}): ${raw.slice(0, 300)}`));
                }
                try {
                    resolve(JSON.parse(raw));
                } catch {
                    reject(new Error('Failed to parse GitHub response JSON'));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function fetchAllIssues(token) {
    const all = [];
    for (let page = 1; page <= 20; page++) {
        const apiPath = `/repos/${OWNER}/${REPO}/issues?state=all&labels=${encodeURIComponent(LABELS)}&per_page=100&page=${page}`;
        const items = await githubGet(apiPath, token);
        if (!Array.isArray(items) || items.length === 0) { break; }
        all.push(...items);
        if (items.length < 100) { break; }
    }
    return all;
}

async function main() {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    const issues = await fetchAllIssues(token);

    const map = new Map();
    for (const issue of issues) {
        if (!issue || issue.pull_request) { continue; }
        const rel = parsePathFromBody(issue.body || '');
        const number = Number(issue.number);
        const url = String(issue.html_url || '').trim();
        if (!rel || !Number.isFinite(number) || number <= 0 || !url) { continue; }

        const prev = map.get(rel);
        // Keep the latest issue number for each path.
        if (!prev || number > prev.number) {
            map.set(rel, { number, url });
        }
    }

    const out = {};
    for (const [k, v] of Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        out[k] = v;
    }

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

    console.log(`Repaired ${map.size} frontmatter file mappings.`);
    console.log(`Wrote ${OUTPUT}`);
    console.log('Next: reload window, then open Frontmatter Viewer and press Rescan.');
}

main().catch((err) => {
    console.error('Repair failed:', err && err.message ? err.message : String(err));
    process.exit(1);
});
