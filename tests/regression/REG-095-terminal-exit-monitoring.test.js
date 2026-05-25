// REG-095 — Terminal exit monitoring: bg-health-runner surfaces failed extension-launched terminals
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '../..');
const BG_SRC   = fs.readFileSync(path.join(ROOT, 'src/features/background-health-runner.ts'), 'utf8');
const TERM_SRC = fs.readFileSync(path.join(ROOT, 'src/shared/terminal-utils.ts'), 'utf8');
const PROJ_SRC = fs.readFileSync(path.join(ROOT, 'src/features/project-launcher.ts'), 'utf8');
const NPM_SRC  = fs.readFileSync(path.join(ROOT, 'src/features/npm-scripts-tree.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// ── terminal-utils: registry API ─────────────────────────────────────────────

check('terminal-utils exports registerLaunchedTerminal',
    TERM_SRC.includes('export function registerLaunchedTerminal('));

check('terminal-utils exports getLaunchedTerminal',
    TERM_SRC.includes('export function getLaunchedTerminal('));

check('terminal-utils exports clearLaunchedTerminal',
    TERM_SRC.includes('export function clearLaunchedTerminal('));

check('LaunchedTerminalInfo interface has script, command, cwd, project fields',
    TERM_SRC.includes('script:') && TERM_SRC.includes('command:') &&
    TERM_SRC.includes('cwd:')    && TERM_SRC.includes('project:'));

// ── project-launcher: registers terminals ────────────────────────────────────

check('project-launcher imports registerLaunchedTerminal',
    PROJ_SRC.includes("registerLaunchedTerminal") && PROJ_SRC.includes('terminal-utils'));

check('project-launcher calls registerLaunchedTerminal after sendText',
    PROJ_SRC.includes('registerLaunchedTerminal(name,'));

// ── npm-scripts-tree: registers terminals ────────────────────────────────────

check('npm-scripts-tree imports registerLaunchedTerminal',
    NPM_SRC.includes('registerLaunchedTerminal') && NPM_SRC.includes('terminal-utils'));

check('npm-scripts-tree calls registerLaunchedTerminal before sendText',
    NPM_SRC.includes("registerLaunchedTerminal(`npm: ${msg.script}`"));

// ── bg-health-runner: onDidCloseTerminal handler ─────────────────────────────

check('bg-health-runner imports getLaunchedTerminal and clearLaunchedTerminal',
    BG_SRC.includes('getLaunchedTerminal') && BG_SRC.includes('clearLaunchedTerminal'));

check('bg-health-runner wires onDidCloseTerminal in activate()',
    BG_SRC.includes('onDidCloseTerminal'));

check('bg-health-runner checks exitStatus.code',
    BG_SRC.includes('exitStatus?.code'));

check('bg-health-runner calls addBug on non-zero exit',
    BG_SRC.includes("checkId:        'chk-terminal-exit'"));

check('bg-health-runner clears bug on success/manual-close (code 0 or undefined)',
    BG_SRC.includes('clearBug(bugId)'));

check('bg-health-runner posts update to Fix Bugs panel after adding bug',
    BG_SRC.includes("type: 'update', state: _state"));

console.log(`\nREG-095: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
