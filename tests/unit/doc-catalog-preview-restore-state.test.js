// Run with: node tests/unit/doc-catalog-preview-restore-state.test.js
// Verifies doc-catalog preview Back button restores the catalog.

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const catalogHtmlPath = path.join(__dirname, '../../src/features/doc-catalog/catalog.html');
const commandsPath    = path.join(__dirname, '../../src/features/doc-catalog/commands.ts');
const indexPath       = path.join(__dirname, '../../src/features/doc-catalog/index.ts');
const previewPath     = path.join(__dirname, '../../src/shared/doc-preview.ts');

for (const p of [catalogHtmlPath, commandsPath, indexPath, previewPath]) {
    assert.ok(fs.existsSync(p), 'Missing file: ' + p);
}

const commandsSrc = fs.readFileSync(commandsPath, 'utf8');
const indexSrc    = fs.readFileSync(indexPath, 'utf8');
const previewSrc  = fs.readFileSync(previewPath, 'utf8');

// doc-preview.ts tracks the source command that opened the preview
assert.ok(
    previewSrc.includes('_currentSourceCmdId'),
    'doc-preview.ts must track _currentSourceCmdId so Back can re-open the source catalog.'
);

// doc-preview.ts Back button calls executeCommand with the source cmd
assert.ok(
    previewSrc.includes('executeCommand(_currentSourceCmdId)'),
    'Back action must call executeCommand(_currentSourceCmdId) to return to catalog.'
);

// cvs.catalog.open is registered
assert.ok(
    indexSrc.includes("registerCommand('cvs.catalog.open'"),
    'cvs.catalog.open command must be registered in doc-catalog/index.ts.'
);

// openCatalog is exported from commands.ts
assert.ok(
    commandsSrc.includes('export async function openCatalog'),
    'openCatalog must be exported from doc-catalog/commands.ts.'
);

console.log('PASS: Doc Catalog preview Back button is wired to return to catalog.');
