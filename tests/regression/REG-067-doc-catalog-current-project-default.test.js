// Copyright (c) CieloVista Software. All rights reserved.
// REG-067: Doc Catalog defaults project filter from current workspace project.

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const COMMANDS_PATH = path.join(ROOT, 'src/features/doc-catalog/commands.ts');
const HTML_PATH = path.join(ROOT, 'src/features/doc-catalog/catalog.html');

const COMMANDS = fs.readFileSync(COMMANDS_PATH, 'utf8');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

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

console.log('REG-067: Doc Catalog current-project default');
console.log('─'.repeat(56));

test('commands.ts derives the current workspace project name from registry entries', () => {
  assert(COMMANDS.includes('function getCurrentWorkspaceProjectName('), 'getCurrentWorkspaceProjectName() helper not found');
  assert(COMMANDS.includes('vscode.workspace.workspaceFolders?.[0]?.uri.fsPath'), 'workspace root is not read when choosing the current project');
  assert(COMMANDS.includes('normalizedWorkspacePath === normalizedEntryPath'), 'exact workspace-to-project path match is not checked');
});

test('commands.ts posts currentProject in the catalog init payload', () => {
  assert(COMMANDS.includes("const currentProject = getCurrentWorkspaceProjectName(registryEntries);"), 'sendCatalogInit() does not resolve currentProject');
  assert(COMMANDS.includes("postMessage({ command: 'init', currentProject, ...payload })"), 'sendCatalogInit() does not include currentProject in the init payload');
});

test('catalog.html prefers currentProject over sticky localStorage state', () => {
  assert(HTML.includes("var currentProj = msg.currentProject || '';"), 'catalog.html does not read currentProject from the host init message');
  assert(HTML.includes("desiredProj = currentProj;"), 'catalog.html does not prefer currentProject when present');
  assert(HTML.includes("desiredProj = savedProj;"), 'catalog.html no longer falls back to saved project state');
});

console.log('─'.repeat(56));
if (failed === 0) {
  console.log('✓ REG-067 passed (' + passed + ' checks).');
  process.exit(0);
} else {
  console.error('✗ REG-067 FAILED (' + failed + ' of ' + (passed + failed) + ' checks failed).');
  process.exit(1);
}