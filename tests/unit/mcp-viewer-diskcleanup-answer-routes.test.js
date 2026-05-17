'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const INDEX_SRC = path.join(__dirname, '../../src/features/mcp-viewer/index.ts');
const src = fs.readFileSync(INDEX_SRC, 'utf8');

assert.ok(src.includes("'/api/diskcleanup_answers_manifest'"), 'manifest route missing');
assert.ok(src.includes("'/api/diskcleanup_answers_refresh'"), 'refresh route missing');
assert.ok(src.includes('readDiskCleanupAnswerManifest()'), 'manifest handler call missing');
assert.ok(src.includes('refreshDiskCleanupAnswerArtifacts()'), 'refresh handler call missing');

console.log('PASS: MCP viewer exposes diskcleanup answer manifest + refresh routes');
