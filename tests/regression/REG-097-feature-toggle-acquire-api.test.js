// REG-097 — feature-toggle: acquireVsCodeApi() called exactly once; log() present
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src/features/feature-toggle.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── acquireVsCodeApi called exactly once ─────────────────────────────────────

const acquireCount = (SRC.match(/acquireVsCodeApi\(\)/g) || []).length;
check('acquireVsCodeApi() appears exactly once in feature-toggle.ts', acquireCount === 1);

// ── the single call is at module scope (not inside an event listener) ─────────

// The call must NOT appear inside a function/arrow that's passed to addEventListener
// Simplest guard: the const vscode = acquireVsCodeApi() line must not be inside a listener
check('acquireVsCodeApi() assigned to module-level const in <script>',
    SRC.includes('const vscode = acquireVsCodeApi()'));

// ── log() called on panel open ────────────────────────────────────────────────

check('activate() calls log() when opening configure panel',
    SRC.includes("log(FEATURE, 'opening configure panel')") ||
    SRC.includes('log(FEATURE, "opening configure panel")'));

// ── FEATURE_REGISTRY has entries ─────────────────────────────────────────────

check('FEATURE_REGISTRY is exported and non-empty',
    SRC.includes('export const FEATURE_REGISTRY') && SRC.includes('copilotRulesEnforcer'));

// ── getFeatureToggleHtml references FEATURE_REGISTRY ─────────────────────────

check('getFeatureToggleHtml renders FEATURE_REGISTRY entries',
    SRC.includes('FEATURE_REGISTRY.map'));

console.log(`\nREG-097: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
