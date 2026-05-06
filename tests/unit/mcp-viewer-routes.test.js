// Copyright (c) 2026 CieloVista Software. All rights reserved.
// tests/unit/mcp-viewer-routes.test.js
//
// Regression test: every endpoint tab declared in html.ts must have a
// matching /api/<endpoint> route handler in index.ts.
//
// Run with: node tests/unit/mcp-viewer-routes.test.js

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const HTML_SRC  = path.join(__dirname, '../../src/features/mcp-viewer/html.ts');
const INDEX_SRC = path.join(__dirname, '../../src/features/mcp-viewer/index.ts');

assert.ok(fs.existsSync(HTML_SRC),  `Source not found: ${HTML_SRC}`);
assert.ok(fs.existsSync(INDEX_SRC), `Source not found: ${INDEX_SRC}`);

const htmlSrc  = fs.readFileSync(HTML_SRC,  'utf8');
const indexSrc = fs.readFileSync(INDEX_SRC, 'utf8');

// Extract every endpoint name from the render dispatch in html.ts.
// Pattern: currentEndpoint === 'endpoint_name'
const matches  = [...htmlSrc.matchAll(/currentEndpoint === '([a-z_]+)'/g)];
const endpoints = [...new Set(matches.map(m => m[1]))];

assert.ok(endpoints.length > 0, 'No endpoints found in html.ts — pattern match failed');

// Each endpoint must have a route handler: if (p === '/api/<endpoint>')
const missing = endpoints.filter(ep => !indexSrc.includes(`'/api/${ep}'`));

assert.deepStrictEqual(
    missing,
    [],
    `Missing HTTP route handlers in index.ts for: ${missing.join(', ')}`
);

console.log(`PASS: All ${endpoints.length} MCP viewer endpoint tabs have matching HTTP route handlers.`);
console.log(`      Verified: ${endpoints.join(', ')}`);
