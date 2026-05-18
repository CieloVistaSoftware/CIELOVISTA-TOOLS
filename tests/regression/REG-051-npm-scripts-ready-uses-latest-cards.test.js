'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src', 'features', 'npm-command-launcher.ts');

let pass = 0;
let fail = 0;

function ok(label, condition, detail) {
  if (condition) {
    console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`);
    pass++;
    return;
  }
  console.log(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  fail++;
}

console.log('REG-051: NPM Scripts ready/init must use latest cards (no stale closure)');
console.log('────────────────────────────────────────────────────────────────────');

const src = fs.readFileSync(SRC, 'utf8');

ok('webview shell HTML is assigned to the panel', /_panel\.webview\.html\s*=\s*PROJECT_CARD_SHELL_HTML\s*;/.test(src));
ok('module-level latest cards cache exists', /let\s+_latestCards\s*:\s*ProjectCardData\[\]\s*=\s*\[\]/.test(src));
ok('sendInit posts _latestCards payload', /postMessage\(\{\s*type:\s*'init'[\s\S]*cards:\s*_latestCards/.test(src));
ok('ready handler pushes latest cards to the shell', /case\s+'ready'\s*:\s*\{[\s\S]{0,320}postMessage\(\{\s*type:\s*'init'[\s\S]*cards:\s*_latestCards/.test(src));

console.log('────────────────────────────────────────────────────────────────────');
console.log(`${pass + fail} checks: ${pass} passed, ${fail} failed`);

if (fail > 0) {
  process.exit(1);
}

console.log('REG-051 PASSED — NPM Scripts shell is loaded and init uses latest cards.');
