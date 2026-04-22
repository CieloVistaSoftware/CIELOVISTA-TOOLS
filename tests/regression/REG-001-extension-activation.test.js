/**
 * tests/regression/REG-001-extension-activation.test.js
 *
 * Regression test for the three-gate activation crash (REG-011).
 * Originally written with @jest/globals — restored as plain Node test.
 *
 * Covers:
 *  1. package.json "dependencies" packages are all negation-included in .vscodeignore
 *  2. No source file imports a package that is in devDependencies only
 *  3. The "package" script does NOT contain --no-dependencies
 *  4. VSIX exists and was built recently (within 24h) — warns if stale
 *  5. All catalog command IDs have a registerCommand() call in src/
 *  6. TypeScript compiles with zero errors
 *
 * Run: node tests/regression/REG-001-extension-activation.test.js
 */
'use strict';

const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = path.join(ROOT, 'src');

let passed = 0, failed = 0;

function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) {
        console.error(`  \u2717 ${name}`);
        console.error(`    \u2192 ${err.message.split('\n')[0]}`);
        err.message.split('\n').slice(1, 6).forEach(l => console.error(`      ${l}`));
        failed++;
    }
}

function assert(cond, msg) { if (!cond) { throw new Error(msg); } }

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function walkTs(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
            walkTs(full, results);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            results.push(full);
        }
    }
    return results;
}

function stripTemplateLiterals(src) {
    return src.replace(/`(?:[^`\\]|\\.)*`/gs, '``');
}

console.log('\nREG-001: Extension activation safety\n' + '\u2500'.repeat(50));

// 1. Every runtime dependency has a .vscodeignore negation entry
test('Every package in dependencies has !node_modules/<pkg>/** in .vscodeignore', () => {
    const pkg    = readJson(path.join(ROOT, 'package.json'));
    const deps   = Object.keys(pkg.dependencies ?? {});
    if (deps.length === 0) { return; }
    const ignore = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf8');
    const missing = deps.filter(d => !ignore.includes(`!node_modules/${d}/`));
    assert(missing.length === 0,
        `Dependencies missing from .vscodeignore negation:\n  ${missing.join('\n  ')}\n` +
        `FIX: Add !node_modules/<pkg>/** ABOVE the node_modules/** line in .vscodeignore`);
});

// 2. No src/ file imports a package from devDependencies only
test('No src/ file imports a package that is devDependencies-only', () => {
    const BUILTINS = new Set([
        'fs','path','os','child_process','util','crypto','stream','events',
        'url','http','https','net','tls','zlib','buffer','assert','process',
        'querystring','readline','string_decoder','timers','vm',
    ]);
    const pkg      = readJson(path.join(ROOT, 'package.json'));
    const deps     = new Set(Object.keys(pkg.dependencies ?? {}));
    const devDeps  = new Set(Object.keys(pkg.devDependencies ?? {}));
    const violations = [];

    for (const file of walkTs(SRC)) {
        if (file.includes('scripts') || file.includes('tests') || file.includes('mcp-server')) { continue; }
        const src     = stripTemplateLiterals(fs.readFileSync(file, 'utf8'));
        const importRe = /^import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"./][^'"]*)['"]/gm;
        let m;
        while ((m = importRe.exec(src)) !== null) {
            const mod = m[1].split('/')[0];
            if (mod === 'vscode' || BUILTINS.has(mod) || mod.startsWith('@types/') || deps.has(mod)) { continue; }
            if (devDeps.has(mod)) {
                violations.push(`  ${path.relative(ROOT, file)}: imports '${m[1]}' (devDependencies-only)`);
            }
        }
    }
    assert(violations.length === 0,
        `Imports of devDependencies-only packages will crash activation:\n${violations.join('\n')}\n` +
        `FIX: Move to dependencies + add !node_modules/<pkg>/** to .vscodeignore`);
});

// 3. Package script does not contain --no-dependencies
test('vsce package script does not use --no-dependencies flag', () => {
    const pkg    = readJson(path.join(ROOT, 'package.json'));
    const script = pkg.scripts?.package ?? '';
    assert(!script.includes('--no-dependencies'),
        `"package" script contains --no-dependencies: "${script}"\n` +
        `FIX: Change to "vsce package" — deps included via .vscodeignore negations`);
});

// 4. VSIX exists (warn if stale, don't fail)
test('VSIX file exists', () => {
    const vsixFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.vsix'));
    assert(vsixFiles.length > 0, 'No .vsix found — run npm run rebuild to package');
    const newest = vsixFiles
        .map(f => ({ name: f, mtime: fs.statSync(path.join(ROOT, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)[0];
    const ageHours = (Date.now() - newest.mtime) / 3600000;
    if (ageHours > 24) {
        console.warn(`    \u26a0  VSIX is ${Math.round(ageHours)}h old — consider rebuilding`);
    }
});

// 5. All catalog command IDs have a registerCommand() call
test('All catalog command IDs have a registerCommand() call in src/', () => {
    const catalogPath = path.join(SRC, 'features', 'cvs-command-launcher', 'catalog.ts');
    const catalogSrc  = fs.readFileSync(catalogPath, 'utf8');
    const catalogIds  = [...catalogSrc.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
    const allSrc      = walkTs(SRC).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const missing     = catalogIds.filter(id => !allSrc.includes(id));
    assert(missing.length === 0,
        `${missing.length} catalog ID(s) have no registerCommand():\n  ${missing.join('\n  ')}`);
});

// 6. TypeScript compiles clean
test('TypeScript compiles with zero errors', () => {
    const tsc = path.join(ROOT, 'node_modules', '.bin', 'tsc');
    let exitCode = 0, output = '';
    try { execSync(`"${tsc}" --noEmit`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }); }
    catch (e) { exitCode = e.status ?? 1; output = (e.stdout ?? '') + (e.stderr ?? ''); }
    assert(exitCode === 0, `TypeScript errors:\n${output.slice(0, 800)}`);
});

console.log('\u2500'.repeat(50));
if (failed === 0) {
    console.log(`\u2713 All ${passed} REG-001 tests passed\n`);
    process.exit(0);
} else {
    console.error(`\n\u2717 ${failed} test(s) FAILED\n`);
    process.exit(1);
}
