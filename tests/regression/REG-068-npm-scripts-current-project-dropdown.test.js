// Copyright (c) CieloVista Software. All rights reserved.
// REG-068: NPM Scripts defaults to current project and exposes others via dropdown.

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST_PATH = path.join(ROOT, 'src/features/npm-command-launcher.ts');
const SHELL_PATH = path.join(ROOT, 'src/shared/project-card-shell.ts');

const HOST = fs.readFileSync(HOST_PATH, 'utf8');
const SHELL = fs.readFileSync(SHELL_PATH, 'utf8');

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

console.log('REG-068: NPM Scripts current-project dropdown default');
console.log('─'.repeat(62));

test('host resolves current project path from active editor/workspace', () => {
  assert(HOST.includes('function resolveCurrentProjectPath(cards: ProjectCardData[]): string {'), 'resolveCurrentProjectPath() helper missing');
  assert(HOST.includes('vscode.window.activeTextEditor?.document?.uri'), 'active editor path is not used for current project detection');
  assert(HOST.includes('vscode.workspace.workspaceFolders?.[0]?.uri.fsPath'), 'workspace fallback path is not used for current project detection');
});

test('host includes currentProjectPath in init payload', () => {
  assert(HOST.includes('currentProjectPath,'), 'initial init payload does not include currentProjectPath');
  assert(HOST.includes('currentProjectPath: currentProjectPath2,'), 'ready/init payload does not include currentProjectPath');
});

test('host sorts cards deterministically before rendering', () => {
  assert(HOST.includes('cards.sort((left, right) => {'), 'cards are not deterministically sorted');
  assert(HOST.includes('left.name.localeCompare(right.name)'), 'sort by project name is missing');
  assert(HOST.includes('left.rootPath.localeCompare(right.rootPath)'), 'sort by project path tie-breaker is missing');
});

test('shell exposes project dropdown and defaults to current project', () => {
  assert(SHELL.includes('id="project-filter"'), 'project dropdown is missing from shell');
  assert(SHELL.includes('refreshProjectDropdown(_allCards, currentProjectPath);'), 'shell does not initialize project dropdown using currentProjectPath');
  assert(SHELL.includes('if (hasCurrent) {'), 'shell does not prefer current project when present');
});

test('shell filters cards by selected project dropdown value', () => {
  assert(SHELL.includes("selectedProject === '__all__' || normalizePath(c.dataset.path) === selectedProject"), 'project-based filtering logic is missing');
  assert(SHELL.includes('projectFilter.addEventListener(\'change\''), 'dropdown change handler is missing');
});

console.log('─'.repeat(62));
if (failed === 0) {
  console.log('✓ REG-068 passed (' + passed + ' checks).');
  process.exit(0);
} else {
  console.error('✗ REG-068 FAILED (' + failed + ' of ' + (passed + failed) + ' checks failed).');
  process.exit(1);
}
