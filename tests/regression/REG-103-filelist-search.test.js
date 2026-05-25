// REG-103 — FileList Explorer: live search input present and functional (#494)
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src/features/file-list-viewer.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── HTML: search input present ────────────────────────────────────────────────

check('search-bar div present in HTML',
    SRC.includes('id="search-bar"'));

check('search-input element present',
    SRC.includes('id="search-input"'));

check('search-clear button present',
    SRC.includes('id="search-clear"'));

check('search-count span present',
    SRC.includes('id="search-count"'));

// ── CSS: search styles defined ────────────────────────────────────────────────

check('search-bar CSS defined',
    SRC.includes('#search-bar{'));

check('search-hidden class hides non-matching rows',
    SRC.includes('search-hidden'));

// ── JS: filtering logic present ───────────────────────────────────────────────

check('applySearch function defined',
    SRC.includes('function applySearch'));

check('applySearch filters rows by name (case-insensitive)',
    SRC.includes('.toLowerCase()') && SRC.includes('.includes(q)'));

check('applySearch toggles search-hidden class on non-matching rows',
    SRC.includes("'search-hidden'") || SRC.includes('"search-hidden"'));

check('search input event listener wired',
    SRC.includes("addEventListener('input', applySearch)") ||
    SRC.includes('addEventListener("input", applySearch)'));

check('clear button resets search and refocuses input',
    SRC.includes('searchInput.value = \'\'') && SRC.includes('searchInput.focus()'));

check('applySearch re-runs after each render via __applySearch hook',
    SRC.includes('__applySearch'));

console.log(`\nREG-103: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
