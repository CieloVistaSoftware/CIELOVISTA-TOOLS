// REG-094 — NPM Scripts Run button has in-depth hover tooltip
'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const ROOT = path.resolve(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'src/features/npm-scripts-tree.html'), 'utf8');

let pass = 0, fail = 0;
function check(desc, cond) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}`); fail++; }
}

// CHECK 1: SCRIPT_DESCRIPTIONS map exists
check('SCRIPT_DESCRIPTIONS lookup map defined',
    HTML.includes('var SCRIPT_DESCRIPTIONS'));

// CHECK 2: runBtnTitle function defined
check('runBtnTitle() function defined',
    HTML.includes('function runBtnTitle('));

// CHECK 3: Run button uses runBtnTitle in its title attribute
check('btn-run title attribute uses runBtnTitle()',
    HTML.includes("title=\"' + esc(runBtnTitle(s.name, s.cmd)) + '\""));

// CHECK 4: known scripts have descriptions
const knownScripts = [
    'compile', 'rebuild', 'package', 'watch',
    'test:regression', 'test:activation', 'clean:project:apply',
];
for (const name of knownScripts) {
    check(`SCRIPT_DESCRIPTIONS has entry for '${name}'`,
        HTML.includes(`'${name}'`));
}

// CHECK 5: ⚠ warnings present for slow/destructive scripts
check('rebuild entry includes ⚠ slow warning',
    HTML.includes('rebuild') && HTML.includes('⚠'));

check('clean:project:apply entry includes ⚠ destructive warning',
    HTML.includes('clean:project:apply') && HTML.includes('irreversible'));

// CHECK 6: full command always shown (prefix changed from "Command: " to "Run: " for clarity)
check('runBtnTitle() always appends "Run: " + cmd',
    HTML.includes("'Run: ' + cmd"));

console.log(`\nREG-094: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
