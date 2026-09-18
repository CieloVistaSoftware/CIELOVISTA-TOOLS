// Copyright (c) CieloVista Software. All rights reserved.
// REG-143: Issue #732 — docs:check is not red on a Windows checkout
//
// Run: node tests/regression/REG-143-docs-check-ignores-line-endings.test.js
//
// scripts/docs-site.js generates docs/index.html with LF and its --check
// compared bytes. .gitattributes pinned .md/.json/.js to LF but not .html, so
// Git checked the page out with CRLF on Windows and `npm run docs:check` failed
// on every Windows machine with no content change. Running docs:sync "fixed"
// it and git diff showed nothing but a line-ending warning.
//
// Guards:
//   1. sameGenerated() treats CRLF and LF as the same content, and still sees
//      a real content change.
//   2. docs-site.js and docs-sync.js decide "out of date" with it, not !==.
//   3. .gitattributes pins *.html to LF, so the page checks out as generated.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { sameGenerated } = require(path.join(ROOT, 'scripts', 'lib', 'same-generated.js'));

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
    if (ok) { console.log(`  PASS ${name}`); passed += 1; }
    else    { console.error(`  FAIL ${name}\n       ${detail}`); failed += 1; }
}
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('REG-143: docs:check ignores line endings (#732)');
console.log('-'.repeat(64));

const lf   = '<html>\n<body>\n<p>docs</p>\n</body>\n</html>\n';
const crlf = lf.replace(/\n/g, '\r\n');
check('a CRLF checkout of a generated LF file counts as current', sameGenerated(crlf, lf), 'CRLF copy reported out of date');
check('identical content counts as current', sameGenerated(lf, lf), 'identical content reported out of date');
check('a real content change is still out of date', !sameGenerated(crlf.replace('docs', 'DOCS'), lf), 'content change missed');
check('a missing file is out of date', !sameGenerated(null, lf), 'missing file reported current');

for (const script of ['scripts/docs-site.js', 'scripts/docs-sync.js']) {
    const src = read(script);
    check(`${script} decides "out of date" with sameGenerated()`,
        src.includes("require('./lib/same-generated')") && /!sameGenerated\(/.test(src),
        'script does not use scripts/lib/same-generated.js');
}
const site = read('scripts/docs-site.js');
check('docs-site.js has no byte comparison against the generated page',
    !/current\s*!==\s*html/.test(site), 'found `current !== html`');

check('.gitattributes pins *.html to LF',
    /^\*\.html\s+text\s+eol=lf\s*$/m.test(read('.gitattributes')), '*.html text eol=lf missing');

console.log('-'.repeat(64));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
