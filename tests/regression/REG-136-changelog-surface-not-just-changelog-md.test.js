/**
 * REG-135-changelog-surface-not-just-changelog-md.test.js
 *
 * Regression test for issue #714 — "daily-audit + marketplace-compliance only
 * recognise CHANGELOG.md, so a page-based changelog reads as missing".
 *
 * `shared/changelog-freshness.ts` was the single source of truth for what counts
 * as STALE, but nothing was the source of truth for what counts as a CHANGELOG.
 * Both callers hardcoded the filename:
 *
 *   daily-audit/checks/changelog.ts:26   path.join(p.path, 'CHANGELOG.md')
 *   daily-audit/checks/marketplace.ts:31 fs.existsSync(... 'CHANGELOG.md')
 *
 * wb-starter's changelog is a page — pages/whats-new.html, fed by
 * data/fixes-cache.json — which describes itself as "the real changelog". It was
 * therefore reported as having none, and the marketplace Auto-Fix offered to
 * CREATE a second, empty, competing CHANGELOG.md beside it. That is the same
 * destructive shape as #667: a heuristic confident enough to drive a fix action
 * while being wrong about the project it is judging.
 *
 * Invariants:
 *   1. A project with no declaration resolves to CHANGELOG.md (unchanged default).
 *   2. A project that declares a surface resolves to THAT, and is found when it
 *      exists — no false "missing".
 *   3. A declared surface is never offered for generation, even when absent.
 *      Creating a competing changelog is worse than the gap.
 *   4. Staleness is measured on whatever was resolved, not on CHANGELOG.md.
 *   5. Neither check hardcodes the filename for existence any more.
 *
 * Fixtures live in os.tmpdir(); the shared repo tree is never written to
 * (REG-130 invariant 1).
 *
 * Run: node tests/regression/REG-135-changelog-surface-not-just-changelog-md.test.js
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const ts   = require('typescript');

const ROOT   = path.resolve(__dirname, '..', '..');
const SHARED = path.join(ROOT, 'src', 'shared', 'changelog-freshness.ts');

let passed = 0, failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failed++;
        console.error(`  ✗ ${name}\n      ${err && err.message}`);
    }
}

function assert(cond, message) {
    if (!cond) { throw new Error(message); }
}

// ─── Load the real module ─────────────────────────────────────────────────────

const js = ts.transpileModule(fs.readFileSync(SHARED, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const mod = (() => {
    const m = { exports: {} };
    new Function('module', 'exports', 'require', js)(m, m.exports, require);
    return m.exports;
})();

const { resolveChangelog, canGenerateChangelog, isChangelogStale, CHANGELOG_STALE_DAYS } = mod;

// ─── Sandbox ──────────────────────────────────────────────────────────────────

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'reg135-'));

function project(name, files = {}) {
    const dir = path.join(sandbox, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, body] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, body);
    }
    return dir;
}

const plain     = project('plain',     { 'CHANGELOG.md': '# Changelog\n' });
const bare      = project('bare',      {});
const pageBased = project('page-based', { 'pages/whats-new.html': '<h1>What&rsquo;s New</h1>' });
const declaredMissing = project('declared-missing', {});

console.log('\nREG-135: a changelog is not always a file called CHANGELOG.md (#714)\n');

// ─── Invariant 1 — the default is unchanged ───────────────────────────────────

test('a project with no declaration still resolves to CHANGELOG.md', () => {
    const cl = resolveChangelog(plain);
    assert(cl.relPath === 'CHANGELOG.md', `expected CHANGELOG.md, got ${cl.relPath}`);
    assert(cl.exists === true, 'did not find the CHANGELOG.md that is there');
    assert(cl.declared === false, 'a defaulted surface must not be reported as declared');
});

test('a project with neither declaration nor file reports missing', () => {
    const cl = resolveChangelog(bare);
    assert(cl.exists === false, 'reported a changelog that does not exist');
    assert(canGenerateChangelog(cl) === true,
        'a project with no changelog and no declaration is exactly the case Auto-Fix is for');
});

// ─── Invariant 2 — a declared surface is honoured ─────────────────────────────

test('a declared page-based changelog is found — the wb-starter false positive', () => {
    const cl = resolveChangelog(pageBased, 'pages/whats-new.html');
    assert(cl.relPath === 'pages/whats-new.html', `expected the declared path, got ${cl.relPath}`);
    assert(cl.exists === true,
        'a project whose changelog is a page is still reported as having none (#714)');
    assert(cl.declared === true, 'declared surface not flagged as declared');
});

// ─── Invariant 3 — never offer to create a competing changelog ────────────────

test('a declared surface is never offered for generation, even when absent', () => {
    const cl = resolveChangelog(declaredMissing, 'pages/whats-new.html');
    assert(cl.exists === false, 'fixture is wrong — the declared file should not exist');
    assert(canGenerateChangelog(cl) === false,
        'Auto-Fix would generate CHANGELOG.md beside a declared changelog, creating two '
        + 'competing changelogs — the destructive case in #714');
});

// ─── Invariant 4 — staleness follows the resolved file ────────────────────────

test('staleness is measured on the resolved changelog, not on CHANGELOG.md', () => {
    const cl = resolveChangelog(pageBased, 'pages/whats-new.html');
    const old = Date.now() - (CHANGELOG_STALE_DAYS + 5) * 24 * 60 * 60 * 1000;
    fs.utimesSync(cl.filePath, new Date(old), new Date(old));

    const mtime = fs.statSync(cl.filePath).mtimeMs;
    assert(isChangelogStale(mtime) === true,
        'an old page-based changelog is not reported stale — staleness still looks at the wrong file');

    const now = Date.now();
    fs.utimesSync(cl.filePath, new Date(now), new Date(now));
    assert(isChangelogStale(fs.statSync(cl.filePath).mtimeMs) === false,
        'a freshly-touched page-based changelog is reported stale');
});

// ─── Invariant 5 — neither caller hardcodes the filename for existence ────────

test('neither check tests existence against a hardcoded CHANGELOG.md', () => {
    for (const rel of [
        path.join('src', 'features', 'daily-audit', 'checks', 'changelog.ts'),
        path.join('src', 'features', 'daily-audit', 'checks', 'marketplace.ts'),
    ]) {
        const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const slug = rel.split(path.sep).join('/');

        assert(/resolveChangelog\s*\(/.test(text),
            `${slug} does not resolve the changelog surface — it will report a page-based `
            + 'changelog as missing (#714)');

        assert(!/existsSync\(\s*path\.join\([^)]*['"]CHANGELOG\.md['"]/.test(text),
            `${slug} still tests existence against a hardcoded CHANGELOG.md (#714)`);
    }
});

test('the marketplace check gates generation on canGenerateChangelog', () => {
    const text = fs.readFileSync(
        path.join(ROOT, 'src', 'features', 'daily-audit', 'checks', 'marketplace.ts'), 'utf8');
    assert(/canGenerateChangelog\s*\(/.test(text),
        'marketplace.ts can still push CHANGELOG.md into `missing` for a project that declared '
        + 'a changelog elsewhere, which drives Auto-Fix into creating a competing one (#714)');
});

fs.rmSync(sandbox, { recursive: true, force: true });

console.log('─'.repeat(60));
if (failed === 0) {
    console.log(`✓ All ${passed} REG-135 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n✗ ${failed} REG-135 test(s) FAILED\n`);
    process.exit(1);
}
