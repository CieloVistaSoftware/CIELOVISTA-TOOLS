// REG-102 — worktree-cleaner: uses workspace root, not extensionPath; has timeout (#492)
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src/features/worktree-cleaner.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── root must be workspace folder, NOT extensionPath ─────────────────────────

check('cleanWorktrees does NOT use context.extensionPath as git root',
    !SRC.includes('context.extensionPath') || !SRC.includes('listClaudeWorktrees(context.extensionPath'));

check('cleanWorktrees uses workspaceFolders as git root',
    SRC.includes('workspaceFolders') && SRC.includes('uri.fsPath'));

// ── timeout guards the run() function ────────────────────────────────────────

check('run() has a timeout to prevent infinite hang',
    SRC.includes('RUN_TIMEOUT_MS') || SRC.includes('setTimeout'));

// ── progress notification shown while scanning ────────────────────────────────

check('cleanWorktrees shows withProgress notification while listing',
    SRC.includes('withProgress') && SRC.includes('listClaudeWorktrees'));

// ── log call includes root path for diagnostics ───────────────────────────────

check('log call includes the root path being scanned',
    SRC.includes('Listing Claude worktrees in:') || SRC.includes('root}'));

console.log(`\nREG-102: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
