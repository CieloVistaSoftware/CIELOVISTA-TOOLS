// Copyright (c) CieloVista Software. All rights reserved.
// REG-066: Frontmatter scanner scope excludes foreign unpacked artifacts.
//
// Recreates all currently open frontmatter issue paths (#393-#400) and verifies
// they are excluded from audit-frontmatter-by-filename scan results.
//
// Isolation (issue #700, same class as #697)
// ------------------------------------------
// This test used to build those fixtures at repo-relative paths in the REAL
// working tree, back up and rewrite data/frontmatter-audit-by-filename.json,
// and unlink report files under docs/_today/ — all while ~144 sibling tests ran
// concurrently against that one tree. REG-023, REG-027, REG-033, REG-111 and
// the doc-catalog tests all walk docs/, so any of them could list a REG-066
// fixture and then die with ENOENT the moment REG-066 removed it — and the
// failure landed on the innocent sibling, not here.
//
// The scenario now runs inside a temp sandbox. audit-frontmatter-by-filename.js
// derives its ROOT from `path.resolve(__dirname, '..')`, so dropping a copy of
// the real script into <sandbox>/scripts/ makes the sandbox its entire world:
// it scans the sandbox and writes its reports there. The script under test is
// still byte-for-byte the production one, and the repo tree is never touched.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const REAL_SCRIPT = path.join(ROOT, 'scripts', 'audit-frontmatter-by-filename.js');
const REAL_REPORT = path.join(ROOT, 'data', 'frontmatter-audit-by-filename.json');
const REAL_TODAY_DIR = path.join(ROOT, 'docs', '_today');

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

function writeFixture(absPath, body) {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, body, 'utf8');
}

function hashIfPresent(filePath) {
    try {
        return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    } catch {
        return null;
    }
}

function listTodayReports() {
    try {
        return new Set(fs.readdirSync(REAL_TODAY_DIR)
            .filter((n) => /^frontmatter-audit-\d{4}-\d{2}-\d{2}\.md$/i.test(n)));
    } catch {
        return new Set();
    }
}

console.log('REG-066: Frontmatter scan scope excludes foreign unpacked artifacts');
console.log('─'.repeat(72));

// Witnesses for the #700 invariant: the real tree must come out of this test
// exactly as it went in.
const realReportBefore = hashIfPresent(REAL_REPORT);
const realTodayBefore = listTodayReports();

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reg066-'));
// realpath so the comparison against the script's reported ROOT survives the
// Windows short-path form of %TEMP%.
const sandboxReal = fs.realpathSync(sandbox);

try {
    if (!fs.existsSync(REAL_SCRIPT)) {
        fail('Script under test not found: scripts/audit-frontmatter-by-filename.js');
    } else {
        const sandboxScript = path.join(sandbox, 'scripts', 'audit-frontmatter-by-filename.js');
        fs.mkdirSync(path.dirname(sandboxScript), { recursive: true });
        fs.copyFileSync(REAL_SCRIPT, sandboxScript);
        pass('Production audit script copied into the sandbox unmodified');

        for (const rp of ISSUE_PATHS) {
            writeFixture(path.join(sandbox, rp), '# temp fixture\n');
        }
        writeFixture(path.join(sandbox, CONTROL_INCLUDE_PATH),
            '---\ndocid: reg-066.scope.control\n---\n# Control\n');
        pass('Issue fixture files created in the sandbox');

        cp.execFileSync(process.execPath, [sandboxScript], {
            cwd: sandbox,
            stdio: 'pipe',
        });
        pass('Frontmatter audit script completed');

        const reportPath = path.join(sandbox, 'data', 'frontmatter-audit-by-filename.json');
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

        // If this fails, the run scanned the repo rather than the sandbox and
        // every assertion below would be meaningless.
        const reportedRoot = fs.realpathSync(report.root);
        if (reportedRoot === sandboxReal) {
            pass('Audit scanned the sandbox root, not the repository');
        } else {
            fail(`Audit scanned ${reportedRoot}, expected sandbox ${sandboxReal}`);
        }

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
    }
} catch (err) {
    fail(`Unexpected test error: ${err && err.message ? err.message : String(err)}`);
} finally {
    // A dying child can still hold a handle on the sandbox; on Windows that
    // makes rmSync fail with EPERM.
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            fs.rmSync(sandbox, { recursive: true, force: true });
            break;
        } catch {
            const until = Date.now() + 50;
            while (Date.now() < until) { /* spin */ }
        }
    }
}

// ── The #700 invariant itself ────────────────────────────────────────────────
//
// Stated as an assertion rather than left to a cleanup block: a fixture that
// escapes into the repo tree fails REG-066 here, instead of surfacing later as
// a random ENOENT in whichever sibling happened to be walking docs/.

const leaked = ISSUE_PATHS.concat([CONTROL_INCLUDE_PATH])
    .filter((rp) => fs.existsSync(path.join(ROOT, rp)));
if (leaked.length === 0) {
    pass('No fixture was written into the repository tree');
} else {
    for (const rp of leaked) {
        fail(`Fixture leaked into the repository tree: ${rp}`);
    }
}

if (hashIfPresent(REAL_REPORT) === realReportBefore) {
    pass('data/frontmatter-audit-by-filename.json is untouched');
} else {
    fail('data/frontmatter-audit-by-filename.json was rewritten by this test');
}

const realTodayAfter = listTodayReports();
const addedReports = [...realTodayAfter].filter((n) => !realTodayBefore.has(n));
const removedReports = [...realTodayBefore].filter((n) => !realTodayAfter.has(n));
if (addedReports.length === 0 && removedReports.length === 0) {
    pass('docs/_today/ audit reports are untouched');
} else {
    fail(`docs/_today/ changed: +[${addedReports.join(', ')}] -[${removedReports.join(', ')}]`);
}

console.log('─'.repeat(72));
console.log(`${passed + failed} checks: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
