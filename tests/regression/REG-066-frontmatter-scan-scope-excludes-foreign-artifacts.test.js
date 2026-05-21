// Copyright (c) CieloVista Software. All rights reserved.
// REG-066: Frontmatter scanner scope excludes foreign unpacked artifacts.
//
// Recreates all currently open frontmatter issue paths (#393-#400) and verifies
// they are excluded from audit-frontmatter-by-filename scan results.

'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_PATH = path.join(ROOT, 'data', 'frontmatter-audit-by-filename.json');
const TODAY_DIR = path.join(ROOT, 'docs', '_today');

const ISSUE_PATHS = [
    'cielovistasoftware.cielovista-tools-1.0.2/.tmp_issue_349_comment.md',
    'cielovistasoftware.cielovista-tools-1.0.2/.tmp_issue_350_comment.md',
    'dbaeumer.vscode-eslint-3.0.24/agents.md',
    'wb-component-navigator/ARCHITECTURE.md',
    'wb-component-navigator/wb-component-navigator/ARCHITECTURE.md',
    'wb-component-navigator/BEFORE-AFTER.md',
    'wb-component-navigator/wb-component-navigator/BEFORE-AFTER.md',
    'github.vscode-github-actions-0.31.5/.github/ISSUE_TEMPLATE/bug-report.md',
];

const CONTROL_INCLUDE_PATH = 'docs/_today/REG-066-frontmatter-scope-control.md';

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  PASS ${msg}`); passed += 1; }
function fail(msg) { console.error(`  FAIL ${msg}`); failed += 1; }

function rel(p) {
    return p.replace(/\\/g, '/');
}

function removeEmptyParents(startPath, stopAt) {
    let current = path.dirname(startPath);
    const stop = path.resolve(stopAt);
    while (current.startsWith(stop) && current !== stop) {
        try {
            const entries = fs.readdirSync(current);
            if (entries.length > 0) {
                break;
            }
            fs.rmdirSync(current);
        } catch {
            break;
        }
        current = path.dirname(current);
    }
}

console.log('REG-066: Frontmatter scan scope excludes foreign unpacked artifacts');
console.log('─'.repeat(72));

const created = [];
const beforeTodayReports = fs.existsSync(TODAY_DIR)
    ? new Set(fs.readdirSync(TODAY_DIR).filter((n) => /^frontmatter-audit-\d{4}-\d{2}-\d{2}\.md$/i.test(n)))
    : new Set();
const reportBackup = fs.existsSync(REPORT_PATH) ? fs.readFileSync(REPORT_PATH, 'utf8') : null;

try {
    for (const rp of ISSUE_PATHS) {
        const abs = path.join(ROOT, rp);
        const existed = fs.existsSync(abs);
        if (!existed) {
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, '# temp fixture\n', 'utf8');
            created.push(abs);
        }
    }

    const controlAbs = path.join(ROOT, CONTROL_INCLUDE_PATH);
    const controlExisted = fs.existsSync(controlAbs);
    if (!controlExisted) {
        fs.mkdirSync(path.dirname(controlAbs), { recursive: true });
        fs.writeFileSync(controlAbs, '---\ndocid: reg-066.scope.control\n---\n# Control\n', 'utf8');
        created.push(controlAbs);
    }

    pass('Issue fixture files recreated on disk');

    cp.execFileSync(process.execPath, ['scripts/audit-frontmatter-by-filename.js'], {
        cwd: ROOT,
        stdio: 'pipe',
    });
    pass('Frontmatter audit script completed');

    const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    const scanned = new Set((report.files || []).map((r) => rel(String(r.path || ''))));

    for (const rp of ISSUE_PATHS) {
        if (scanned.has(rel(rp))) {
            fail(`Excluded issue fixture was scanned: ${rp}`);
        } else {
            pass(`Excluded issue fixture not scanned: ${rp}`);
        }
    }

    if (scanned.has(CONTROL_INCLUDE_PATH)) {
        pass(`Control project markdown path is scanned: ${CONTROL_INCLUDE_PATH}`);
    } else {
        fail(`Control project markdown path missing from scan: ${CONTROL_INCLUDE_PATH}`);
    }
} catch (err) {
    fail(`Unexpected test error: ${err && err.message ? err.message : String(err)}`);
} finally {
    for (const abs of created) {
        try {
            if (fs.existsSync(abs)) {
                fs.unlinkSync(abs);
            }
            removeEmptyParents(abs, ROOT);
        } catch {
            // best-effort cleanup
        }
    }

    try {
        if (reportBackup !== null) {
            fs.writeFileSync(REPORT_PATH, reportBackup, 'utf8');
        }
    } catch {
        // best-effort restore
    }

    try {
        if (fs.existsSync(TODAY_DIR)) {
            const nowTodayReports = fs.readdirSync(TODAY_DIR).filter((n) => /^frontmatter-audit-\d{4}-\d{2}-\d{2}\.md$/i.test(n));
            for (const name of nowTodayReports) {
                if (!beforeTodayReports.has(name)) {
                    fs.unlinkSync(path.join(TODAY_DIR, name));
                }
            }
        }
    } catch {
        // best-effort cleanup
    }
}

console.log('─'.repeat(72));
console.log(`${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
