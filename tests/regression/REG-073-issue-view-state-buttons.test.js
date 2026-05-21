// Copyright (c) 2026 CieloVista Software. All rights reserved.
'use strict';

const fs   = require('fs');
const path = require('path');

// REG-073: Ensure the Issue Viewer UI includes "Open" and "Closed" state toggle buttons.
// This test was created to prevent a regression where these buttons were accidentally
// removed during a UI refactor (commit 2a6308a0, issue #23).

const SRC = path.join(__dirname, '..', '..', 'src', 'shared', 'github-issues-view.ts');

let pass = 0;
let fail = 0;

function ok(label, condition) {
    if (condition) { console.log(`PASS: ${label}`); pass++; }
    else           { console.log(`FAIL: ${label}`); fail++; }
}

console.log('Running test: REG-073-issue-view-state-buttons.test.js');

const src = fs.readFileSync(SRC, 'utf8');

ok('Open state button exists in buildHtml',   /<button[^>]*id=.state-open/.test(src));
ok('Closed state button exists in buildHtml', /<button[^>]*id=.state-closed/.test(src));

console.log(`${pass + fail} checks: ${pass} passed, ${fail} failed`);

if (fail > 0) {
    console.error('REG-073 FAILED');
    process.exit(1);
}

console.log('REG-073 PASSED: Issue viewer contains state toggle buttons.');
