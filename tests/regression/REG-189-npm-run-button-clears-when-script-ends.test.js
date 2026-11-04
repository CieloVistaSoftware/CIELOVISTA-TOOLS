// REG-189 — NPM Scripts Run button leaves "running" when the script ends, not when its tab closes
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src/features/npm-scripts-tree.ts'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

const start = SRC.indexOf('onDidEndTerminalShellExecution?.(');
const handler = start === -1 ? '' : SRC.slice(start, SRC.indexOf('onDidCloseTerminal', start));

check('listens for the script ending, guarded for older VS Code', start !== -1);
check('only reacts to terminals this panel opened', handler.includes('_termMap.get(event.terminal)'));
check('a non-zero exit shows error', handler.includes("'ok' : 'error'") && handler.includes('event.exitCode === 0'));
check('posts run-state to the panel', handler.includes("type: 'run-state'"));
check('keeps the terminal mapped so Run reuses the same tab', !handler.includes('_termMap.delete'));
check('the close event remains as the fallback', SRC.includes('onDidCloseTerminal('));

console.log(`\nnpm-run-state: ${pass} passed, ${fail} failed`);
if (fail > 0) { process.exit(1); }
