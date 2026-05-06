// NPM Scripts card shell — source checks.
// Reads TypeScript source directly (esbuild bundles individual files away).
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '../..');
const SHELL_SRC = path.join(ROOT, 'src', 'shared', 'project-card-shell.ts');
const BUILDER_SRC = path.join(ROOT, 'src', 'shared', 'project-card-builder.ts');

let pass = 0, fail = 0;
function ok(label, value, detail) {
    if (value) { console.log(`  PASS: ${label}${detail ? ' — ' + detail : ''}`); pass++; }
    else        { console.log(`  FAIL: ${label}${detail ? ' — ' + detail : ''}`); fail++; }
}

console.log('\n-- NPM Scripts card shell source checks --\n');

const html = fs.readFileSync(SHELL_SRC, 'utf8');

ok('shell source is non-empty', html.length > 100, html.length + ' chars');
ok("init handler: m.type === 'init'",    html.includes("m.type === 'init'"));
ok("calls render(m.cards)",              html.includes('render(m.cards'));
ok("status handler: m.type === 'status'", html.includes("m.type === 'status'"));
ok("sends ready message",               html.includes("command: 'ready'"));
ok("cfg-registry handler",              html.includes("m.type === 'cfg-registry'"));
ok("window.addEventListener('message')", html.includes("window.addEventListener('message'"));
ok("listener defined before ready send",
    html.indexOf("window.addEventListener('message'") < html.indexOf("command: 'ready'"));

const builder = fs.readFileSync(BUILDER_SRC, 'utf8');
ok('buildCardFromPackageDir exported',  builder.includes('export function buildCardFromPackageDir'));
ok('card includes name field',          builder.includes('name:'));
ok('card includes scripts array',       builder.includes('scripts'));
ok('card includes rootPath',            builder.includes('rootPath'));
ok('card includes dewey',               builder.includes('dewey'));

console.log(`\n${'─'.repeat(50)}`);
console.log(`${pass + fail} checks: ${pass} passed, ${fail} failed`);
if (fail > 0) { process.exit(1); }
else          { console.log('\n*** ALL PASS ***'); process.exit(0); }
