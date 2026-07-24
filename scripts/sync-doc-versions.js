'use strict';
// Copyright (c) CieloVista Software. All rights reserved.
//
// Keeps the VSIX filename and the extension's own version label shown in
// docs/_today/*.html demo pages in sync with package.json, so a version bump
// can't leave a stale "cielovista-tools-X.Y.Z.vsix" download link behind
// again (this has happened twice by hand — see #658/#659).
//
// Deliberately narrow: only the VSIX filename (always unambiguous — this
// extension is the only thing named cielovista-tools-*.vsix) and the
// marketplace hero's own version label are touched. docs/_today/console.html
// lists several *other* mock tools with their own independent demo version
// numbers (File List, Copilot Rules, MCP Viewer, ...) that must never be
// clobbered by a blanket "vX.Y.Z" replacement.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS_TODAY = path.join(ROOT, 'docs', '_today');

// Anchored so only this extension's own hero label ever matches — never a
// bare "vX.Y.Z" anywhere else in the page.
const HERO_LABEL_RE = /(CieloVista Tools<\/h2>\s*<p[^>]*>)v\d+\.\d+\.\d+(?=\s|&nbsp;)/;

/** @param {string} version */
function syncFile(filePath, version) {
    const before = fs.readFileSync(filePath, 'utf8');
    const after = before
        .replace(/cielovista-tools-\d+\.\d+\.\d+\.vsix/g, `cielovista-tools-${version}.vsix`)
        .replace(HERO_LABEL_RE, `$1v${version}`);
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

    const htmlFiles = fs.readdirSync(DOCS_TODAY).filter((f) => f.endsWith('.html'));
    let changedCount = 0;
    for (const file of htmlFiles) {
        const full = path.join(DOCS_TODAY, file);
        if (syncFile(full, version)) {
            changedCount++;
            console.log(`  updated ${path.relative(ROOT, full)}`);
        }
    }

    console.log(`\nsync-doc-versions: ${version} — ${changedCount} file(s) updated, ${htmlFiles.length} scanned`);
}

main();
