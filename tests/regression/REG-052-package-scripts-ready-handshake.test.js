'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '../..');
const SRC_PATH = path.join(ROOT, 'src', 'features', 'npm-command-launcher.ts');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const SHELL_PATH = path.join(ROOT, 'src', 'shared', 'project-card-shell.ts');
const SHELL_SRC = fs.readFileSync(SHELL_PATH, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  PASS ' + name);
    passed++;
  } catch (err) {
    console.error('  FAIL ' + name);
    console.error('       ' + err.message);
    failed++;
  }
}

console.log('REG-052: package.json Scripts ready/init handshake');
console.log('─'.repeat(58));

test('new panel wires onDidReceiveMessage before assigning webview.html', () => {
  const onMsgIdx = SRC.indexOf('_panel.webview.onDidReceiveMessage(async msg =>');
  const htmlIdx = SRC.indexOf('_panel.webview.html = PROJECT_CARD_SHELL_HTML;');

  assert(onMsgIdx !== -1, 'onDidReceiveMessage handler not found');
  assert(htmlIdx !== -1, 'webview.html assignment not found');
  assert(
    onMsgIdx < htmlIdx,
    'Race detected: webview.html is assigned before onDidReceiveMessage is wired, so ready/init can be missed and panel can render blank'
  );
});

test('openPanel does not rely on fixed-delay setTimeout init push', () => {
  assert(
    !/setTimeout\(\(\)\s*=>\s*\{[\s\S]{0,280}sendInit\(\)/.test(SRC),
    'Brittle timeout-based init detected; init must be driven by ready message handshake'
  );
});

test('shared project card shell does not retry ready via setTimeout fallback', () => {
  assert(
    !/setTimeout\(function\s*\(\)\s*\{[\s\S]{0,220}vsc\.postMessage\(\{\s*command:\s*'ready'\s*\}\)/.test(SHELL_SRC),
    'Timer-based ready retry fallback detected in project-card-shell; panel init must be fully reactive'
  );
});

console.log('─'.repeat(58));
if (failed === 0) {
  console.log('✓ REG-052 passed (' + passed + ' checks).');
  process.exit(0);
} else {
  console.error('✗ REG-052 FAILED (' + failed + ' of ' + (passed + failed) + ' checks failed).');
  process.exit(1);
}
