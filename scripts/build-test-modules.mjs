// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * build-test-modules.mjs — per-module build for unit tests (#734).
 *
 *   node scripts/build-test-modules.mjs
 *
 * The shipped build (esbuild.mjs) writes ONE bundle, out/extension.js. Unit
 * tests need the opposite: every module on its own, so a test can require
 * src/features/doc-header/feature.ts and reach its _test handle without
 * activating the whole extension.
 *
 * Until #734 the two builds were the same build. When #264 moved shipping to
 * a bundle, the per-module files the tests required stopped existing, every
 * test took its "SKIP: not compiled" branch and exited 0, and 54 test files
 * reported green for four months without running.
 *
 * So the test build is separate and goes to its own directory, out-test/,
 * which is never packaged. It transpiles without bundling: each .ts becomes
 * one .js at the same relative path, relative requires keep working, and
 * 'vscode' stays an external require for the tests to mock. Non-TypeScript
 * assets (html, css, json) are copied alongside, because modules read
 * them relative to __dirname.
 */
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC     = path.join(ROOT, 'src');
const OUT     = path.join(ROOT, 'out-test');
const ASSETS  = new Set(['.html', '.css', '.json', '.svg', '.txt']);

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full, out); }
        else { out.push(full); }
    }
    return out;
}

const files   = walk(SRC);
const sources = files.filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'));
const assets  = files.filter(f => ASSETS.has(path.extname(f)));

fs.rmSync(OUT, { recursive: true, force: true });

await esbuild.build({
    entryPoints: sources,
    outdir:      OUT,
    outbase:     SRC,
    bundle:      false,
    platform:    'node',
    target:      'node18',
    format:      'cjs',
    sourcemap:   false,
    logLevel:    'warning',
});

// A module that imports from outside src/ (registry-promote.ts shares its core
// with mcp-server/src/shared/) cannot run as a per-module transpile: the
// relative require would point back into the source tree at a .ts file. Those
// few are bundled instead, with 'vscode' still external so tests can mock it.
const IMPORT = /(?:from\s+|require\()\s*['"](\.[^'"]+)['"]/g;
const escapers = sources.filter(file => {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT)) {
        const target = path.resolve(path.dirname(file), m[1]);
        if (path.relative(SRC, target).startsWith('..')) { return true; }
    }
    return false;
});
for (const file of escapers) {
    await esbuild.build({
        entryPoints: [file],
        outfile:     path.join(OUT, path.relative(SRC, file)).replace(/\.ts$/, '.js'),
        bundle:      true,
        external:    ['vscode'],
        platform:    'node',
        target:      'node18',
        format:      'cjs',
        sourcemap:   false,
        logLevel:    'warning',
        allowOverwrite: true,
    });
}

for (const file of assets) {
    const dest = path.join(OUT, path.relative(SRC, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
}

console.log(`build-test-modules: ${sources.length} module(s), ${assets.length} asset(s) -> out-test/`);
