// Copyright (c) CieloVista Software. All rights reserved.
// REG-163: Issue #790 — the generated pages are committed current
//
// Run: node tests/regression/REG-163-generated-pages-current.test.js
//
// npm run rebuild runs docs:marketplace and docs:sync-versions, which rewrite
// docs/_today/marketplace.html, the other docs/_today/*.html pages and the
// repo-root index.html from catalog.ts, package.json and src/features. The
// committed copies were stale (131 commands vs 128, 63+ features vs 61), so
// every deploy left the tree dirty and the live site, which GitHub Pages serves
// from main at /, showed old numbers. They stay tracked because Pages serves
// them; this test makes a stale copy impossible to merge.
//
// Guards:
//   1. Both generators have a --check mode that writes nothing, and
//      npm run docs:check runs it.
//   2. The generated output is deterministic: rendering twice gives the same
//      bytes, and it embeds no absolute path or timestamp.
//   3. Every generated page in the git index (what is committed, or about to
//      be) is exactly what the generators produce now, line endings ignored.
//      CI runs this inside npm run rebuild, AFTER the generators have
//      rewritten the working tree, so comparing the working tree alone would
//      always pass there; the index copy is the one that goes stale.
//   4. The working-tree copy matches too, and git reports no change to any
//      generated page: a rebuild leaves git status clean.
//   5. --check exits 0 on the current tree, and the pure transforms still
//      notice a stale count.

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const { sameGenerated } = require(path.join(ROOT, 'scripts', 'lib', 'same-generated.js'));
const market = require(path.join(ROOT, 'scripts', 'generate-marketplace-features.js'));
const versions = require(path.join(ROOT, 'scripts', 'sync-doc-versions.js'));

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed += 1; }
    else    { console.error(`  FAIL ${name}\n       ${detail}`); failed += 1; }
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rel = abs => path.relative(ROOT, abs).replace(/\\/g, '/');

function git(args) {
    return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** The first line that differs, for a readable failure. */
function firstDiff(a, b) {
    const x = a.replace(/\r\n/g, '\n').split('\n');
    const y = b.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if (x[i] !== y[i]) {
            return `line ${i + 1}: committed ${JSON.stringify((x[i] || '').trim().slice(0, 110))} / generated ${JSON.stringify((y[i] || '').trim().slice(0, 110))}`;
        }
    }
    return 'no line differs';
}

console.log('REG-163: generated pages are committed current (#790)');
console.log('-'.repeat(64));

// ── 1. --check mode exists and is wired ─────────────────────────────────────
const pkg = JSON.parse(read('package.json'));
const docsCheck = pkg.scripts['docs:check'] || '';
for (const script of ['scripts/generate-marketplace-features.js', 'scripts/sync-doc-versions.js']) {
    const src = read(script);
    check(`${script} has a --check mode`, src.includes("process.argv.includes('--check')"), 'no --check handling');
    check(`${script} decides "out of date" with sameGenerated()`,
        src.includes("require('./lib/same-generated')") && /sameGenerated\(/.test(src),
        'does not use scripts/lib/same-generated.js');
    check(`npm run docs:check runs ${script} --check`, docsCheck.includes(`node ${script} --check`),
        `docs:check is: ${docsCheck}`);
}
const rebuild = pkg.scripts.rebuild || '';
check('rebuild still regenerates the pages before the regression suite',
    rebuild.indexOf('docs:marketplace') !== -1 && rebuild.indexOf('docs:sync-versions') !== -1 &&
    rebuild.indexOf('docs:sync-versions') < rebuild.indexOf('test:regression'),
    'rebuild order changed; guard 3 relies on reading the index copy after regeneration');

// ── 2. deterministic output ─────────────────────────────────────────────────
const catalogSrc = fs.readFileSync(market.CATALOG_PATH, 'utf8');
const facts = versions.collectFacts();
const marketPath = market.MARKETPLACE_HTML;

/** Everything rebuild does to one page, in rebuild order. */
function generate(abs, content) {
    const afterMarket = abs === marketPath ? market.renderMarketplace(catalogSrc, content).html : content;
    return versions.syncContent(afterMarket, facts);
}

const marketDisk = fs.readFileSync(marketPath, 'utf8');
const once = generate(marketPath, marketDisk);
check('rendering twice gives identical output', generate(marketPath, marketDisk) === once, 'output differs between runs');
check('generation is idempotent (running it on its own output changes nothing)', generate(marketPath, once) === once,
    'second pass changed the page');
const rootFwd = ROOT.replace(/\\/g, '/');
check('generated page embeds no absolute path', !once.includes(ROOT) && !once.includes(rootFwd),
    `found ${ROOT} in the output`);
const todayIso = new Date().toISOString().slice(0, 10);
check('generated page embeds no run-time date', !once.includes(todayIso),
    `found ${todayIso} in the output`);

// ── 3 + 4. index and working tree are both current ──────────────────────────
const pages = versions.targetFiles();
check('marketplace.html is one of the synced pages', pages.includes(marketPath), 'marketplace.html not found');
check('root index.html is one of the synced pages', pages.includes(path.join(ROOT, 'index.html')), 'index.html not found');

const inRepo = git(['rev-parse', '--is-inside-work-tree']);
check('git is available to read the committed copies', inRepo.status === 0 && inRepo.stdout.trim() === 'true',
    `git rev-parse failed: ${inRepo.stderr || inRepo.error}`);

if (inRepo.status === 0) {
    for (const abs of pages) {
        const r = rel(abs);
        const shown = git(['show', `:${r}`]);
        if (shown.status !== 0) {
            check(`${r} is tracked`, false, `git show :${r} failed: ${shown.stderr.trim()}`);
            continue;
        }
        const committed = shown.stdout;
        const expected = generate(abs, committed);
        check(`committed ${r} is what the generators produce now`, sameGenerated(committed, expected),
            `${firstDiff(committed, expected)} — run npm run docs:marketplace && npm run docs:sync-versions, then commit`);
        const disk = fs.readFileSync(abs, 'utf8');
        check(`working-tree ${r} is current`, sameGenerated(disk, generate(abs, disk)),
            firstDiff(disk, generate(abs, disk)));
    }
    const status = git(['status', '--porcelain', '--', ...pages.map(rel)]);
    const dirty = status.stdout.split('\n').filter(l => l.trim() && !/^[MADRC] /.test(l));
    check('git status shows no unstaged change to any generated page', status.status === 0 && dirty.length === 0,
        `unstaged: ${dirty.join(' | ')}`);
}

// ── 5. the CLI check and the transforms really detect drift ─────────────────
for (const script of ['scripts/generate-marketplace-features.js', 'scripts/sync-doc-versions.js']) {
    const before = fs.readFileSync(marketPath, 'utf8');
    const r = spawnSync(process.execPath, [path.join(ROOT, script), '--check'], { cwd: ROOT, encoding: 'utf8' });
    check(`${script} --check exits 0 on the current tree`, r.status === 0, (r.stderr || r.stdout).trim().split('\n').pop());
    check(`${script} --check writes nothing`, fs.readFileSync(marketPath, 'utf8') === before, 'marketplace.html changed');
}
const staleStats = '<span class="stat-n">1</span><span class="stat-l">Commands</span><span class="stat-n">1+</span><span class="stat-l">Features</span>';
check('a stale command/feature count is out of date',
    !sameGenerated(staleStats, versions.syncContent(staleStats, facts)), 'stale counts not detected');
const staleCard = once.replace(/(&nbsp;·&nbsp; )\d+( command)/, '$19999$2');
check('a stale feature card count is out of date, and regenerating repairs it',
    staleCard !== once && !sameGenerated(staleCard, generate(marketPath, staleCard)) &&
        generate(marketPath, staleCard) === once,
    'stale card count not detected or not repaired');

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
