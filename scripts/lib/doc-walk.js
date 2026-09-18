// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * doc-walk.js — the one markdown walk and skip list, for Node scripts (#812).
 *
 * The walk and DOC_SKIP_DIRS are written once, in TypeScript, at
 * mcp-server/src/shared/doc-walk.ts; the extension and the MCP server bundle
 * that file. A script cannot require TypeScript, so this loader bundles the
 * same source file in memory with esbuild (a devDependency) and returns its
 * exports. It reads the source every run, so there is no built or generated
 * copy that can go stale or drift from the list the extension uses, and a
 * script needs no `npm run compile` first.
 *
 * Usage:
 *   const { walkDocTree, DOC_SKIP_DIRS } = require('./lib/doc-walk');
 *   walkDocTree(root, { maxDepth: Infinity });
 */
'use strict';

const Module = require('module');
const path   = require('path');

const SOURCE = path.resolve(__dirname, '..', '..', 'mcp-server', 'src', 'shared', 'doc-walk.ts');

function load() {
    const esbuild = require('esbuild');
    const result = esbuild.buildSync({
        entryPoints: [SOURCE],
        bundle:      true,
        platform:    'node',
        format:      'cjs',
        write:       false,
        logLevel:    'silent',
    });
    const loaded = new Module(SOURCE, module);
    loaded.filename = SOURCE;
    loaded.paths    = Module._nodeModulePaths(path.dirname(SOURCE));
    loaded._compile(result.outputFiles[0].text, SOURCE);
    return loaded.exports;
}

module.exports = load();
