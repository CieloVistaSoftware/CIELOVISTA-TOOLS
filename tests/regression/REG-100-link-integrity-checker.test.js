// REG-100 — Link Integrity Checker: cvs.links.check structure and wiring (#484)
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '../..');
const SRC     = fs.readFileSync(path.join(ROOT, 'src/features/link-integrity-checker.ts'), 'utf8');
const EXT_SRC = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const PKG     = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const CAT_SRC = fs.readFileSync(path.join(ROOT, 'src/features/cvs-command-launcher/catalog.ts'), 'utf8');
const TOG_SRC = fs.readFileSync(path.join(ROOT, 'src/features/feature-toggle.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── link-integrity-checker.ts: structure ─────────────────────────────────────

check('exports activate()',
    SRC.includes('export function activate('));

check('exports deactivate()',
    SRC.includes('export function deactivate()'));

check('registers cvs.links.check command',
    SRC.includes("'cvs.links.check'"));

check('validates command: links against package.json',
    SRC.includes('command:') && SRC.includes('commandIds'));

check('validates relative file links (checks fs.existsSync)',
    SRC.includes('validateFileLink') && SRC.includes('fs.existsSync'));

check('validates anchor links against headings',
    SRC.includes('validateAnchorLink') && SRC.includes('extractHeadings'));

check('HEAD-checks external URLs (warn-only)',
    SRC.includes('headCheck') && SRC.includes("status === 'warn'"));

check('collectMdFiles walks registered project roots',
    SRC.includes('collectMdFiles'));

check('report webview has BROKEN / warn / ok sections',
    SRC.includes('Broken Links') && SRC.includes('pill-broken') && SRC.includes('pill-ok'));

check('calls log() on scan complete',
    SRC.includes('Scan complete') && SRC.includes('log(FEATURE,'));

// ── extension.ts wiring ───────────────────────────────────────────────────────

check('extension.ts imports linkIntegrityActivate',
    EXT_SRC.includes('linkIntegrityActivate'));

check('extension.ts calls activateIfEnabled for linkIntegrityChecker',
    EXT_SRC.includes("activateIfEnabled('linkIntegrityChecker'"));

check('extension.ts calls linkIntegrityDeactivate in deactivate()',
    EXT_SRC.includes('linkIntegrityDeactivate()'));

// ── package.json ──────────────────────────────────────────────────────────────

const cmds = PKG.contributes?.commands ?? [];
check('package.json declares cvs.links.check',
    cmds.some(c => c.command === 'cvs.links.check'));

const settings = PKG.contributes?.configuration?.properties ?? {};
check('package.json has linkIntegrityChecker feature toggle setting',
    'cielovistaTools.features.linkIntegrityChecker' in settings);

// ── catalog.ts ────────────────────────────────────────────────────────────────

check('catalog.ts includes cvs.links.check entry',
    CAT_SRC.includes("'cvs.links.check'"));

// ── feature-toggle.ts ─────────────────────────────────────────────────────────

check('feature-toggle FEATURE_REGISTRY includes linkIntegrityChecker',
    TOG_SRC.includes("'linkIntegrityChecker'"));

console.log(`\nREG-100: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
