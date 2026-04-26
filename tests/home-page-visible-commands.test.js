// Ensures Home page command listings are filtered to runtime-registered commands.
// Run with: node tests/home-page-visible-commands.test.js

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const OUT_HOME = path.join(ROOT, 'out', 'features', 'home-page.js');
const PKG_PATH = path.join(ROOT, 'package.json');

assert.ok(fs.existsSync(OUT_HOME), 'COMPILED: out/features/home-page.js not found. Run npm run compile first.');

const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
	if (request === 'vscode') {
		return {};
	}
	return originalLoad.call(this, request, parent, isMain);
};

const { buildGroupedCommands } = require(OUT_HOME);
Module._load = originalLoad;
assert.strictEqual(typeof buildGroupedCommands, 'function', 'Expected buildGroupedCommands export in out/features/home-page.js');

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const cmds = Array.isArray(pkg.contributes && pkg.contributes.commands) ? pkg.contributes.commands : [];
const ids = cmds.map(c => c.command).filter(Boolean);

assert.ok(ids.length >= 2, 'Expected at least two contributed commands in package.json');

const includeOnly = new Set([ids[0]]);
const grouped = buildGroupedCommands(includeOnly);
const visibleIds = Object.values(grouped).flat().map(c => c.command);

assert.ok(visibleIds.length >= 1, 'Expected at least one visible command when one ID is registered');
assert.ok(visibleIds.every(id => includeOnly.has(id)), 'Home page must only include runtime-registered commands');

console.log('PASS: Home page command groups are filtered to registered commands.');
