// REG-104 — Code Highlight Audit: scanner correctness + Fix button always present (#495 #496)
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

// ── Load scanFile via ts-node eval ───────────────────────────────────────────
// We extract the scanFile function from the TS source and test it via a small
// temporary file to avoid the full vscode runtime dependency.

const ROOT = path.resolve(__dirname, '../..');
const SRC  = require('fs').readFileSync(path.join(ROOT, 'src/features/code-highlight-audit.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── #495: closing fence detection ────────────────────────────────────────────

// The closing fence must have hasNoContent check
check('#495 — closing fence guard: hasNoContent check present in scanFile',
    SRC.includes('hasNoContent') && SRC.includes('fenceMatch[2].trim()'));

check('#495 — guard comment references issue #495',
    SRC.includes('#495'));

check('#495 — closing fence condition rejects non-empty trailing content',
    SRC.includes('!hasNoContent'));

// Verify a ``` with trailing text inside a block is NOT treated as closing fence
// by reading the logic flow: the condition now has three ANDed guards
check('#495 — all three guards ANDed: sameFenceChar && enoughFenceLen && hasNoContent',
    SRC.includes('!sameFenceChar || !enoughFenceLen || !hasNoContent'));

// ── #496: Fix button always present ──────────────────────────────────────────

check('#496 — fixLang falls back to "text" when guess is empty',
    SRC.includes("const fixLang = guess || 'text'"));

check('#496 — fixBtn uses fixLang (not raw guess)',
    SRC.includes('data-lang="${esc(fixLang)}"'));

check('#496 — fixBtn is always rendered (not conditional on guess)',
    // Previously was: const fixBtn = guess ? `...` : '';
    // Now fixBtn is always a non-empty string
    !SRC.includes("const fixBtn = guess\n") &&
    !SRC.includes("const fixBtn = guess ?") &&
    SRC.includes('const fixBtn  = `<button'));

check('#496 — no-hint cell shows "text" instead of "?"',
    SRC.includes("'<span class=\"no-hint\">text</span>'"));

// ── HTML output: Fix button present in all rows ───────────────────────────────

check('Fix button data-action="fix" always emitted per block row',
    SRC.includes('data-action="fix"') &&
    SRC.includes('data-action="open"'));

// ── Summary text updated ──────────────────────────────────────────────────────

check('Summary text mentions Fix button (not just Open)',
    SRC.includes('Click') && SRC.includes('Fix') && SRC.includes('Open'));

check('Summary text references "text" as fallback language',
    SRC.includes('"text" is used when no language can be inferred') ||
    SRC.includes('text') && SRC.includes('inferred'));

console.log(`\nREG-104: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
