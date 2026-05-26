// REG-101 — Command Validator: validate + syncTags structure and wiring (#483)
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '../..');
const SRC     = fs.readFileSync(path.join(ROOT, 'src/features/command-validator.ts'), 'utf8');
const EXT_SRC = fs.readFileSync(path.join(ROOT, 'src/extension.ts'), 'utf8');
const PKG     = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const CAT_SRC = fs.readFileSync(path.join(ROOT, 'src/features/cvs-command-launcher/catalog.ts'), 'utf8');
const TOG_SRC = fs.readFileSync(path.join(ROOT, 'src/features/feature-toggle.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── command-validator.ts: structure ──────────────────────────────────────────

check('exports activate()', SRC.includes('export function activate('));
check('exports deactivate()', SRC.includes('export function deactivate()'));

check('registers cvs.commands.validate',    SRC.includes("'cvs.commands.validate'"));
check('registers cvs.commands.syncTags',    SRC.includes("'cvs.commands.syncTags'"));
check('registers cvs.commands.syncTagsDry', SRC.includes("'cvs.commands.syncTagsDry'"));

check('extractCommandIds parses cvs.* IDs from Commands section',
    SRC.includes('extractCommandIds'));

check('runValidation checks package.json IDs',
    SRC.includes('loadPackageCommandIds') && SRC.includes('inPkg'));

check('runValidation detects missing-pkg status',
    SRC.includes("'missing-pkg'"));

check('runValidation detects orphan commands',
    SRC.includes("'orphan'"));

check('syncTagsForFile merges tags without removing existing ones',
    SRC.includes('syncTagsForFile') && SRC.includes('existingTags.push'));

check('syncTagsForFile supports dry-run (no file write)',
    SRC.includes('dryRun'));

// ── extension.ts wiring ───────────────────────────────────────────────────────

check('extension.ts imports commandValidatorActivate',
    EXT_SRC.includes('commandValidatorActivate'));

check("extension.ts activateIfEnabled('commandValidator'…)",
    EXT_SRC.includes("activateIfEnabled('commandValidator'"));

check('extension.ts calls commandValidatorDeactivate()',
    EXT_SRC.includes('commandValidatorDeactivate()'));

// ── package.json ──────────────────────────────────────────────────────────────

const cmds = (PKG.contributes?.commands ?? []).map(c => c.command);
check('package.json has cvs.commands.validate',    cmds.includes('cvs.commands.validate'));
check('package.json has cvs.commands.syncTags',    cmds.includes('cvs.commands.syncTags'));
check('package.json has cvs.commands.syncTagsDry', cmds.includes('cvs.commands.syncTagsDry'));

const settings = PKG.contributes?.configuration?.properties ?? {};
check('package.json has commandValidator feature-toggle setting',
    'cielovistaTools.features.commandValidator' in settings);

// ── catalog.ts ────────────────────────────────────────────────────────────────

check('catalog.ts has cvs.commands.validate entry',    CAT_SRC.includes("'cvs.commands.validate'"));
check('catalog.ts has cvs.commands.syncTags entry',    CAT_SRC.includes("'cvs.commands.syncTags'"));
check('catalog.ts has cvs.commands.syncTagsDry entry', CAT_SRC.includes("'cvs.commands.syncTagsDry'"));

// ── feature-toggle.ts ─────────────────────────────────────────────────────────

check('feature-toggle FEATURE_REGISTRY includes commandValidator',
    TOG_SRC.includes("'commandValidator'"));

console.log(`\nREG-101: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
