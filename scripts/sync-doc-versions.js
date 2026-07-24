'use strict';
// Copyright (c) CieloVista Software. All rights reserved.
//
// Keeps the version number, VSIX filename, and command/feature counts shown
// in docs/_today/*.html and the repo-root index.html (the actual live .io
// landing page — GitHub Pages serves branch=main, path=/) in sync with
// package.json/src, so a version bump or new feature can't leave stale
// numbers behind again (this has happened three times by hand now — see
// #658/#659/#660, plus the 128/40+/69 landing-page stats caught in review).
//
// Deliberately narrow: only unambiguous, cheaply-derivable values are
// touched (VSIX filename, version labels, command count, feature count).
// docs/_today/console.html lists several *other* mock tools with their own
// independent demo version numbers (File List, Copilot Rules, MCP Viewer,
// ...) that must never be clobbered by a blanket "vX.Y.Z" replacement.
// Regression test count is NOT auto-synced here — it changes with nearly
// every PR and computing it live would mean running the full suite inside
// this lightweight doc step; review "Tests Green" by hand each release.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS_TODAY = path.join(ROOT, 'docs', '_today');

// Anchored so only this extension's own hero label ever matches — never a
// bare "vX.Y.Z" anywhere else in the page.
const HERO_LABEL_RE = /(CieloVista Tools<\/h2>\s*<p[^>]*>)v\d+\.\d+\.\d+(?=\s|&nbsp;)/;
const NAV_BADGE_RE = /(<span class="nav-badge">)v\d+\.\d+\.\d+(<\/span>)/;
const COMMANDS_STAT_RE = /(<span class="stat-n">)\d+(<\/span><span class="stat-l">Commands<\/span>)/;
const FEATURES_STAT_RE = /(<span class="stat-n">)\d+\+?(<\/span><span class="stat-l">Features<\/span>)/;

function countFeatures() {
    const featuresDir = path.join(ROOT, 'src', 'features');
    const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
    const flatFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.ts')).length;
    const subFeatures = entries.filter(
        (e) => e.isDirectory() && (fs.existsSync(path.join(featuresDir, e.name, 'index.ts')) || fs.existsSync(path.join(featuresDir, e.name, 'feature.ts')))
    ).length;
    return flatFiles + subFeatures;
}

/**
 * @param {string} filePath
 * @param {{version: string, commandCount: number, featureCount: number}} facts
 */
function syncFile(filePath, facts) {
    const before = fs.readFileSync(filePath, 'utf8');
    const after = before
        .replace(/cielovista-tools-\d+\.\d+\.\d+\.vsix/g, `cielovista-tools-${facts.version}.vsix`)
        .replace(HERO_LABEL_RE, `$1v${facts.version}`)
        .replace(NAV_BADGE_RE, `$1v${facts.version}$2`)
        .replace(COMMANDS_STAT_RE, `$1${facts.commandCount}$2`)
        .replace(FEATURES_STAT_RE, `$1${facts.featureCount}+$2`);
    if (after !== before) {
        fs.writeFileSync(filePath, after, 'utf8');
        return true;
    }
    return false;
}

function main() {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const version = pkg.version;
    if (!version) {
        throw new Error('package.json has no version field');
    }
    const facts = {
        version,
        commandCount: pkg.contributes.commands.length,
        featureCount: countFeatures(),
    };

    const files = [
        path.join(ROOT, 'index.html'),
        ...fs.readdirSync(DOCS_TODAY).filter((f) => f.endsWith('.html')).map((f) => path.join(DOCS_TODAY, f)),
    ].filter((f) => fs.existsSync(f));

    let changedCount = 0;
    for (const full of files) {
        if (syncFile(full, facts)) {
            changedCount++;
            console.log(`  updated ${path.relative(ROOT, full)}`);
        }
    }

    console.log(`\nsync-doc-versions: v${facts.version}, ${facts.commandCount} commands, ${facts.featureCount} features — ${changedCount} file(s) updated, ${files.length} scanned`);
}

main();
