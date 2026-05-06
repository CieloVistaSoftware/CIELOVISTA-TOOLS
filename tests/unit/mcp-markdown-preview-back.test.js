// Run with: node tests/unit/mcp-markdown-preview-back.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../src/features/mcp-viewer/index.ts');
assert.ok(fs.existsSync(SRC), 'Source file not found: src/features/mcp-viewer/index.ts');

const src = fs.readFileSync(SRC, 'utf8');

assert.ok(
  src.includes('id="btn-back"') || src.includes("id='btn-back'"),
  'Markdown preview page must include a back button with id="btn-back".'
);

assert.ok(
  src.includes("window.location.href = backUrl"),
  'Back button must navigate to backUrl when provided.'
);

assert.ok(
  src.includes("url.searchParams.get('back')") && src.includes('buildMarkdownPreviewHtml(filePath, md, backUrl)'),
  'md-preview route must read back query param and pass it to preview renderer.'
);

console.log('PASS: md-preview page supports back navigation to the MCP viewer.');
