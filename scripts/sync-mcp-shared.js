// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * sync-mcp-shared.js
 *
 * Copies the dependency-free shared modules from src/shared/ into
 * mcp-server/src/shared/ so both TypeScript programs can compile the same
 * logic.
 *
 * #696 -- the extension and mcp-server each pin `rootDir` to their own `src`,
 * so neither can import across the boundary (tsc TS6059). Widening either root
 * is not free: mcp-server's dist/index.js entry is named by its package.json
 * main+bin, by mcp-server-status.ts and by the packaging tests.
 *
 * A copy is therefore unavoidable. What IS avoidable is the copy silently
 * drifting from the original -- which is the actual failure mode behind
 * "no duplicate code". So:
 *
 *   npm run sync:mcp-shared            regenerates the copy
 *   npm run sync:mcp-shared -- --check  fails if it has drifted
 *
 * The --check form runs in the preflight gate, so a change to the source that
 * is not synced cannot reach a build.
 *
 * Only dependency-free modules belong in this list. Anything importing from
 * ../shared/* would not resolve on the mcp-server side.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'src', 'shared');
const TARGET_DIR = path.join(ROOT, 'mcp-server', 'src', 'shared');

/** Modules copied verbatim. Keep this list short and dependency-free. */
const MODULES = ['registry-promote-core.ts'];

const BANNER = [
    '// ==========================================================================',
    '// GENERATED FILE -- DO NOT EDIT.',
    '//',
    '// Copied from src/shared/ by scripts/sync-mcp-shared.js. Edit the original',
    '// and re-run `npm run sync:mcp-shared`; the preflight gate rejects a build',
    '// whose copy has drifted. See #696 for why a copy exists at all.',
    '// ==========================================================================',
    '',
].join('\n');

const check = process.argv.includes('--check');

let drifted = 0;
let written = 0;

if (!fs.existsSync(TARGET_DIR)) {
    if (check) {
        console.error('[sync-mcp-shared] mcp-server/src/shared/ does not exist -- run without --check first.');
        process.exit(1);
    }
    fs.mkdirSync(TARGET_DIR, { recursive: true });
}

for (const file of MODULES) {
    const sourcePath = path.join(SOURCE_DIR, file);
    const targetPath = path.join(TARGET_DIR, file);

    if (!fs.existsSync(sourcePath)) {
        console.error(`[sync-mcp-shared] missing source: ${sourcePath}`);
        process.exit(1);
    }

    // Read both fully before writing anything.
    const expected = BANNER + fs.readFileSync(sourcePath, 'utf8');
    const actual = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;

    if (actual === expected) {
        continue;
    }

    if (check) {
        drifted++;
        console.error(
            `[sync-mcp-shared] DRIFT: mcp-server/src/shared/${file} does not match src/shared/${file}.\n` +
            '                  Run `npm run sync:mcp-shared` and commit the result.',
        );
        continue;
    }

    fs.writeFileSync(targetPath, expected, 'utf8');
    written++;
    console.log(`[sync-mcp-shared] wrote mcp-server/src/shared/${file}`);
}

if (check) {
    if (drifted > 0) {
        process.exit(1);
    }
    console.log(`[sync-mcp-shared] ${MODULES.length} module(s) in sync.`);
} else if (written === 0) {
    console.log(`[sync-mcp-shared] already in sync (${MODULES.length} module(s)).`);
}
