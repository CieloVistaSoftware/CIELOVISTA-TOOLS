/**
 * REG-150-shared-imports-no-features.test.js
 *
 * Guards #745 (and #750). CLAUDE.md: "shared/ files export pure functions only"
 * and "shared logic goes in src/shared/". shared/ sits below features/: a
 * feature may use shared/, never the other way round.
 *
 * src/shared/github-issues-view.ts was a whole feature (about 1,200 lines, its
 * own webview panel and module-level state) living in shared/, and it imported
 * from features/cvs-command-launcher. Its two commands were registered by a
 * separate src/features/github-issues.ts (#738), so the one Issue Viewer was
 * split across two places. src/shared/consolidation-plan-webview.ts was the
 * Doc Consolidator's own panel and imported its type back from that feature.
 *
 * It asserts:
 *   1. the import scanner itself catches every import form it claims to
 *      (static, type-only, re-export, require, dynamic import) and ignores
 *      comments, so check 2 cannot pass by missing an import
 *   2. no src/shared/**\/*.ts imports anything under src/features/, except the
 *      entries in ALLOW_LIST, each of which names its open issue
 *   3. every ALLOW_LIST entry is still a real offender, so a fixed one has to
 *      be removed from the list rather than silently excusing a future import
 *   4. the Issue Viewer is one folder feature: src/features/github-issues/
 *      has index.ts, feature.ts and view.ts; shared/github-issues-view.ts, the
 *      old flat features/github-issues.ts and its .README.md are gone
 *   5. the folder feature's index.ts exports what the rest of the extension
 *      uses (activate, deactivate, showGithubIssues, newIssueForProject,
 *      detectRepoFromWorkspace, fetchIssuesForRepo, newIssueForCurrentProject)
 *   6. the Home page, the Doc Catalog and Session Activity reach the viewer
 *      through that public surface, not through view.ts, and nothing in src/
 *      still imports shared/github-issues-view
 *   7. the Doc Consolidator's plan panel lives in its feature (#750)
 *
 * Read-only: it reads src/ and writes nothing.
 *
 * Run: node tests/regression/REG-150-shared-imports-no-features.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..', '..');
const SRC      = path.join(ROOT, 'src');
const SHARED   = path.join(SRC, 'shared');
const FEATURES = path.join(SRC, 'features');
const ISSUES   = path.join(FEATURES, 'github-issues');

/**
 * Known offenders, each tracked by an open issue. Key: file under src/shared/
 * (forward slashes, relative to the repo root). Value: the import specifier
 * that is excused and the issue that removes it. Check 3 fails if an entry is
 * no longer an offender, so fixing the issue forces deleting its entry here.
 */
const ALLOW_LIST = {
    // #751: sendToCopilotChat is a shared helper that lives in a feature; six
    // features import it from there too. Moving it to shared/ is its own change.
    'src/shared/show-interactive-result-webview.ts': { spec: '../features/terminal-copy-output', issue: '#751' },
};

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (err) { failed++; console.error(`  ✗ ${name}\n      → ${err && err.message}`); }
}
function assert(cond, message) { if (!cond) { throw new Error(message); } }

const rel = f => path.relative(ROOT, f).split(path.sep).join('/');

function walkTs(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walkTs(full, out); }
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) { out.push(full); }
    }
    return out;
}

/** Remove block and line comments so a comment that mentions a path is not an import. */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
}

/** Every module specifier a TypeScript source imports, in any form. */
function importSpecifiers(src) {
    const code = stripComments(src);
    const specs = [];
    const patterns = [
        /\b(?:import|export)\s+(?:type\s+)?[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g, // import x from / import type / export ... from
        /\bimport\s*['"]([^'"]+)['"]/g,                                       // side-effect import
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,                             // dynamic import()
        /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,                            // require()
    ];
    for (const re of patterns) { for (const m of code.matchAll(re)) { specs.push(m[1]); } }
    return [...new Set(specs)];
}

/** True when a relative specifier written in fromFile resolves into src/features/. */
function pointsIntoFeatures(fromFile, spec) {
    if (!spec.startsWith('.')) { return false; }
    const target = path.resolve(path.dirname(fromFile), spec);
    return target === FEATURES || target.startsWith(FEATURES + path.sep);
}

function sharedOffenders() {
    const found = [];
    for (const file of walkTs(SHARED)) {
        for (const spec of importSpecifiers(fs.readFileSync(file, 'utf8'))) {
            if (pointsIntoFeatures(file, spec)) { found.push({ file: rel(file), spec }); }
        }
    }
    return found;
}

console.log('\nREG-150: nothing in src/shared/ imports from src/features/; the Issue Viewer is one feature (#745)\n');

// 1 ─────────────────────────────────────────────────────────────────────────
test('the import scanner catches every import form and ignores comments', () => {
    const fake = path.join(SHARED, 'fake.ts');
    const sample = [
        "import { a } from '../features/one';",
        "import type { B } from '../features/two/feature';",
        "export { c } from '../features/three';",
        "import '../features/four';",
        "const d = require('../features/five');",
        "async function e() { return import('../features/six'); }",
        "import {\n    f,\n    g,\n} from '../features/seven';",
        "import { ok } from './output-channel';",
        "import * as vscode from 'vscode';",
        "// import { h } from '../features/in-a-comment';",
        "/* import { i } from '../features/in-a-block'; */",
    ].join('\n');
    const hits = importSpecifiers(sample).filter(s => pointsIntoFeatures(fake, s)).sort();
    const want = ['../features/five', '../features/four', '../features/one', '../features/seven',
                  '../features/six', '../features/three', '../features/two/feature'];
    assert(JSON.stringify(hits) === JSON.stringify(want),
        `scanner found [${hits.join(', ')}], expected [${want.join(', ')}]`);
});

// 2 ─────────────────────────────────────────────────────────────────────────
test('no src/shared/**/*.ts imports from src/features/ (outside the allow-list)', () => {
    const bad = sharedOffenders().filter(o => !(ALLOW_LIST[o.file] && ALLOW_LIST[o.file].spec === o.spec));
    assert(bad.length === 0,
        `${bad.length} shared→features import(s): ${bad.map(o => `${o.file} imports '${o.spec}'`).join('; ')}`);
});

// 3 ─────────────────────────────────────────────────────────────────────────
test('every allow-list entry is still an offender (remove it once its issue is fixed)', () => {
    const offenders = sharedOffenders();
    const stale = Object.entries(ALLOW_LIST)
        .filter(([file, { spec }]) => !offenders.some(o => o.file === file && o.spec === spec))
        .map(([file, { spec, issue }]) => `${file} no longer imports '${spec}' (${issue}): delete the entry`);
    assert(stale.length === 0, stale.join('; '));
});

// 4 ─────────────────────────────────────────────────────────────────────────
test('the Issue Viewer is one folder feature under src/features/github-issues/', () => {
    const problems = [];
    for (const f of ['index.ts', 'feature.ts', 'view.ts', 'README.md']) {
        if (!fs.existsSync(path.join(ISSUES, f))) { problems.push(`missing src/features/github-issues/${f}`); }
    }
    for (const gone of ['src/shared/github-issues-view.ts', 'src/features/github-issues.ts', 'src/features/github-issues.README.md']) {
        if (fs.existsSync(path.join(ROOT, gone))) { problems.push(`${gone} still exists`); }
    }
    assert(problems.length === 0, problems.join('; '));
});

// 5 ─────────────────────────────────────────────────────────────────────────
test('github-issues/index.ts exports the public surface the extension uses', () => {
    const idx = stripComments(fs.readFileSync(path.join(ISSUES, 'index.ts'), 'utf8'));
    const names = ['activate', 'deactivate', 'newIssueForCurrentProject', 'showGithubIssues',
                   'newIssueForProject', 'detectRepoFromWorkspace', 'fetchIssuesForRepo'];
    const exported = new Set();
    for (const m of idx.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim();
            if (name) { exported.add(name); }
        }
    }
    const missing = names.filter(n => !exported.has(n));
    assert(missing.length === 0, `index.ts does not export: ${missing.join(', ')}`);
    const view = fs.readFileSync(path.join(ISSUES, 'view.ts'), 'utf8');
    const feat = fs.readFileSync(path.join(ISSUES, 'feature.ts'), 'utf8');
    assert(/registerCommand\(\s*'cvs\.issues\.openViewer'/.test(feat) && /registerCommand\(\s*'cvs\.issues\.newIssue'/.test(feat),
        'feature.ts must register cvs.issues.openViewer and cvs.issues.newIssue');
    assert(!/registerCommand\(/.test(stripComments(view)), 'view.ts must not register commands; feature.ts owns registration');
});

// 6 ─────────────────────────────────────────────────────────────────────────
test('consumers reach the viewer through the feature, not view.ts or shared/', () => {
    const problems = [];
    const consumers = ['src/features/home-page.ts', 'src/features/doc-catalog/commands.ts', 'src/features/session-activity.ts'];
    for (const c of consumers) {
        const file = path.join(ROOT, c);
        const targets = importSpecifiers(fs.readFileSync(file, 'utf8'))
            .filter(s => s.startsWith('.'))
            .map(s => path.resolve(path.dirname(file), s));
        if (!targets.includes(ISSUES)) { problems.push(`${c} does not import the github-issues feature`); }
        if (targets.includes(path.join(ISSUES, 'view'))) { problems.push(`${c} imports github-issues/view directly`); }
    }
    for (const file of walkTs(SRC)) {
        if (importSpecifiers(fs.readFileSync(file, 'utf8')).some(s => /github-issues-view$/.test(s))) {
            problems.push(`${rel(file)} still imports github-issues-view`);
        }
    }
    assert(problems.length === 0, problems.join('; '));
});

// 7 ─────────────────────────────────────────────────────────────────────────
test('the Doc Consolidator plan panel lives in its feature (#750)', () => {
    assert(!fs.existsSync(path.join(SHARED, 'consolidation-plan-webview.ts')), 'src/shared/consolidation-plan-webview.ts still exists');
    const panel = path.join(FEATURES, 'doc-consolidator', 'plan-webview.ts');
    assert(fs.existsSync(panel), 'src/features/doc-consolidator/plan-webview.ts is missing');
    const feat = fs.readFileSync(path.join(FEATURES, 'doc-consolidator', 'feature.ts'), 'utf8');
    assert(importSpecifiers(feat).includes('./plan-webview'), 'doc-consolidator/feature.ts must import ./plan-webview');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
