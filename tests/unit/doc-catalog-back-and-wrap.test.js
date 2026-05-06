// Run with: node tests/unit/doc-catalog-back-and-wrap.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DOC_PREVIEW_SRC = path.join(__dirname, '../../src/shared/doc-preview.ts');
const CATALOG_HTML_SRC = path.join(__dirname, '../../src/features/doc-catalog/catalog.html');

assert.ok(fs.existsSync(DOC_PREVIEW_SRC), 'Missing src/shared/doc-preview.ts');
assert.ok(fs.existsSync(CATALOG_HTML_SRC), 'Missing src/features/doc-catalog/catalog.html');

const previewSrc = fs.readFileSync(DOC_PREVIEW_SRC, 'utf8');
const catalogSrc = fs.readFileSync(CATALOG_HTML_SRC, 'utf8');

assert.ok(
  previewSrc.includes('id="btn-back-source"') && previewSrc.includes("command: 'navigate-source'"),
  'Doc preview must include a Back button that posts navigate-source.'
);

assert.ok(
  previewSrc.includes('buildPreviewHtml(title, filePath, rendered, _history, Boolean(_currentSourceCmdId))'),
  'Doc preview must pass hasSource state into buildPreviewHtml.'
);

assert.ok(
  catalogSrc.includes('overflow-wrap:anywhere') && catalogSrc.includes('word-break:break-word'),
  'Catalog cards must force-wrap long text with overflow-wrap:anywhere and word-break:break-word.'
);

assert.ok(
  catalogSrc.includes('.card-path{white-space:normal;text-overflow:clip}'),
  'Card path field must wrap (white-space normal) instead of single-line ellipsis.'
);

console.log('PASS: Doc Catalog preview back button and card text wrapping are in place.');
