/**
 * tests/regression/REG-187-issue-viewer-one-priority.test.js
 *
 * John, 2026-10-02, on the Issue Viewer showing a "priority:2" pill in Status
 * and a priority dropdown reading 3 on the same row: "Too many priority
 * fields. we only want one."
 *
 * The dropdown was a second, private priority (localStorage
 * cvt.issuePriorities.v1, default 3) that never read or wrote the label.
 * Now the priority:N label is the only priority: the dropdown shows it and
 * writes it (replacing any other priority:N), and the pill is not repeated in
 * the Status column. Start Work replaces the priority instead of adding a
 * second label, and in-progress means status:in-progress only.
 *
 * Run: node tests/regression/REG-187-issue-viewer-one-priority.test.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC  = path.join(ROOT, 'src', 'features', 'github-issues', 'view.ts');
const src  = fs.readFileSync(SRC, 'utf8');

let passed = 0, failed = 0;
function check(label, condition) {
    if (condition) { console.log(`  ✓ ${label}`); passed++; }
    else           { console.error(`  ✗ ${label}`); failed++; }
}

console.log('\nREG-187: Issue Viewer — one priority, the priority:N label\n' + '─'.repeat(60));

check('no private priority store (cvt.issuePriorities.v1 is only removed, never read)',
    !/getItem\(\s*STORAGE_KEY|loadPriorities\(|savePriorities\(/.test(src));
check('dropdown is rendered from the label (priorityFromLabels)',
    /const priority = priorityFromLabels\(iss\.labels\)/.test(src) && /n === priority \? ' selected' : ''/.test(src));
check('no hard-coded "3 selected" default',
    !src.includes('<option value="3" selected>'));
check('priority:N pills are filtered out of the Status column',
    /\.filter\(\(l\) => !PRIORITY_LABEL\.test\(l\.name\)\)/.test(src));
check('changing the dropdown posts setPriority to the extension',
    /type: 'setPriority'/.test(src) && /msg\.type === 'setPriority'/.test(src));
check('Start Work replaces the priority label instead of adding a second one',
    /runGh\(priorityEditArgs\(number, 1, labelNames/.test(src) && !/'--add-label', 'priority:1'/.test(src));
check('in-progress is status:in-progress only, not priority:1',
    !/l\.name === 'priority:1'/.test(src));

// Behaviour of the two pure helpers (src/shared/issue-priority.ts).
const OUT = path.join(ROOT, 'out', 'shared', 'issue-priority.js');
check('out/shared/issue-priority.js is built (npm run compile)', fs.existsSync(OUT));
if (fs.existsSync(OUT)) {
    const { priorityFromLabels, priorityEditArgs } = require(OUT);
    check('priorityFromLabels reads priority:2', priorityFromLabels([{ name: 'bug' }, { name: 'priority:2' }]) === 2);
    check('priorityFromLabels: unrated is null', priorityFromLabels([{ name: 'bug' }]) === null);
    check('priorityEditArgs removes every other priority:N and adds the new one',
        priorityEditArgs(7, 1, ['bug', 'priority:2', 'priority:4'], 'o/r').join(' ')
            === 'issue edit 7 --remove-label priority:2 --remove-label priority:4 --add-label priority:1 --repo o/r');
    check('priorityEditArgs leaves the chosen label alone',
        priorityEditArgs(7, 2, ['priority:2'], 'o/r').join(' ') === 'issue edit 7 --add-label priority:2 --repo o/r');
}

console.log('');
if (failed > 0) { console.error(`FAILED ${failed} / ${passed + failed}`); process.exit(1); }
console.log(`PASSED ${passed} / ${passed}`);
process.exit(0);
