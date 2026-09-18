// REG-093 — the header scan judges docs by the three-field contract; scanAuto rewrites to it
//
// History: REG-093 first guarded #527's rule that frontmatter goes at the
// BOTTOM, and scanAuto moved every header in every registered project there.
// #708 reversed that rule (three fields, at the TOP), and #730 brought this
// command in line. So the rule guarded here is the opposite of the original.
//
// Behavioural: runs the real scan and fix from the out-test/ build on files
// in a temp directory.
//
// Run: node tests/regression/REG-093-header-scan-position-check.test.js
'use strict';

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '../..');
const OUT  = path.join(ROOT, 'out-test', 'features', 'doc-header-scan.js');
const PKG  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let pass = 0, fail = 0;
function check(desc, cond, detail) {
    if (cond) { console.log(`  ✓ ${desc}`); pass++; }
    else       { console.error(`  ✗ ${desc}${detail ? `\n      ${detail}` : ''}`); fail++; }
}

console.log('\nREG-093: header scan follows the three-field contract (#730)\n' + '─'.repeat(60));

if (!fs.existsSync(OUT)) {
    console.error(`  ✗ ${OUT} missing — the regression runner builds out-test/ before every run`);
    process.exit(1);
}

const registered = new Map();
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
    if (req === 'vscode') {
        return {
            commands: { registerCommand(n, h) { registered.set(n, h); return { dispose() {} }; } },
            window:   { showErrorMessage() {}, createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }) },
            ProgressLocation: { Notification: 15 },
        };
    }
    return origLoad.call(this, req, parent, isMain);
};
const mod = require(OUT);
Module._load = origLoad;
const t = mod._test;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reg093-'));
const write = (name, text) => { const f = path.join(TMP, name); fs.writeFileSync(f, text, 'utf8'); return f; };

// A doc on the retired contract: a horizontal rule in the body and a 13-field
// trailer. The old scan called this CORRECT; the old parsers lost its prose.
const PROSE = ['Intro.', '## Architecture', 'Step one: build it.', '## Notes', 'Last words.'];
const OLD = ['# Guide', '', PROSE[0], '', '---', '', PROSE[1], '', PROSE[2], '', PROSE[3], '', PROSE[4], '',
    '---', 'docid: 150.1.guide', 'id: guide', 'title: Guide', 'description: A guide.', 'status: active', '---', ''].join('\n');
const oldFile  = write('old.md', OLD);
const goodFile = write('good.md', '---\nid: good\ntitle: Good\ndescription: Fine.\n---\n\n# Good\n');
const bareText = '# Bare\n\nNo header here.\n';
const bareFile = write('bare.md', bareText);

const reports = t.scanDirectory(TMP, 'p', TMP);
const r = name => reports.find(x => x.relativePath === name);

check('a top three-field header is compliant', r('good.md') && r('good.md').violations.length === 0,
    r('good.md') && r('good.md').violations.join('; '));
check('a bottom 13-field trailer is NOT compliant', r('old.md') && r('old.md').violations.includes('frontmatter at the bottom'),
    r('old.md') && r('old.md').violations.join('; '));
check('a doc with no header is reported as position "none"', r('bare.md') && r('bare.md').position === 'none');

const outcome = t.fixToContract(r('old.md'));
const after = fs.readFileSync(oldFile, 'utf8');
check('fixing rewrites the header to the top and verifies it', outcome.success && outcome.verified, JSON.stringify(outcome));
check('fixing keeps id, title and description', after.startsWith('---\nid: guide\ntitle: Guide\ndescription: A guide.\n---\n'), after.slice(0, 90));
check('fixing drops the retired fields', !/docid|status:/.test(after));
const lost = PROSE.filter(line => !after.includes(line));
check('fixing keeps every line of prose, including below the horizontal rule', lost.length === 0, `lost: ${lost.join(' | ')}`);

const src = fs.readFileSync(path.join(ROOT, 'src', 'features', 'doc-header-scan.ts'), 'utf8');
check('scanAuto only rewrites docs that already have a header',
    /position\s*!==\s*'none'\s*&&\s*r\.violations\.length\s*>\s*0/.test(src));
check('headerless doc untouched by the scan', fs.readFileSync(bareFile, 'utf8') === bareText);
check('nothing moves headers to the bottom any more',
    !/moveFrontmatterToBottom/.test(src) && !PKG.contributes.commands.some(c => c.command === 'cvs.headers.moveToBottom'));

mod.activate({ subscriptions: [] });
check('cvs.headers.scan and cvs.headers.scanAuto are registered',
    registered.has('cvs.headers.scan') && registered.has('cvs.headers.scanAuto'));
const cmd = id => PKG.contributes.commands.find(c => c.command === id);
check('package.json no longer describes scanAuto as moving headers to the bottom',
    cmd('cvs.headers.scanAuto') && !/bottom/i.test(`${cmd('cvs.headers.scanAuto').title} ${cmd('cvs.headers.scanAuto').description || ''}`),
    cmd('cvs.headers.scanAuto') && JSON.stringify(cmd('cvs.headers.scanAuto')));

fs.rmSync(TMP, { recursive: true, force: true });
console.log('─'.repeat(60));
if (fail) { console.error(`✗ REG-093 FAILED (${fail} of ${pass + fail} checks failed).`); process.exit(1); }
console.log(`✓ REG-093 passed (${pass} checks).`);
