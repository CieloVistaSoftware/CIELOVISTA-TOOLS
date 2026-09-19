// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * test-data-dir.js — a data directory of its own for every test process (#825).
 *
 * The modules keep their data files (the error log, bg-health state, reports)
 * in path.join(__dirname, '..', 'data'). For every test process that is the
 * same directory: out-test/data/ or out/data/. The runners start tests in
 * parallel, so a test that logged an error rewrote out-test/data/
 * cielovista-errors.json while error-log-utils.test.js was reading or
 * deleting it, and on Windows the reader failed with EPERM.
 *
 * src/shared/data-dir.ts reads CVT_DATA_DIR. Each runner starts each test with
 * CVT_DATA_DIR pointing at a fresh temp directory and removes it when the test
 * exits, so no two test processes ever share a data file, and nothing a test
 * logs lands in the build output.
 *
 *   const { testDataEnv } = require('./lib/test-data-dir');
 *   const data = testDataEnv('error-log-utils');
 *   const child = spawn(node, [...data.execArgv, file], { env: data.env });
 *   child.on('close', () => { const writes = data.buildWrites(); data.dispose(); });
 *
 * The same call also starts the test with build-write-guard.js preloaded and a
 * log of its own (#832). buildWrites() lists every write the test made under
 * out/ or out-test/, and the runners fail a test that made any.
 *
 * A test that reads or clears a data file itself (error-log-utils.test.js)
 * also works when run directly with node, outside any runner. It calls
 * useOwnDataDir() before it loads the module, so its data file is its own
 * either way.
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { LOG_ENV: BUILD_WRITE_LOG_ENV } = require('./build-write-guard');

const BUILD_WRITE_GUARD = path.join(__dirname, 'build-write-guard.js');

/** Must match DATA_DIR_ENV in src/shared/data-dir.ts. */
const DATA_DIR_ENV = 'CVT_DATA_DIR';

/**
 * A fresh data directory for one test process.
 * @param {string} label  Readable part of the temp directory name
 * @param {NodeJS.ProcessEnv} [baseEnv]  Environment to extend (default process.env)
 * @returns {{ dir: string, env: NodeJS.ProcessEnv, execArgv: string[], buildWrites: () => string[], dispose: () => void }}
 *   execArgv: node arguments that preload build-write-guard.js; pass them before the test file.
 *   buildWrites(): the writes the test made under out/ or out-test/, one "fn path" line each.
 *   Read it before dispose(), which removes the log.
 */
function testDataEnv(label, baseEnv = process.env) {
    const safe = String(label).replace(/[^\w.-]+/g, '-').slice(0, 40) || 'test';
    const dir  = fs.mkdtempSync(path.join(os.tmpdir(), `cvt-data-${safe}-`));
    // Beside the data directory, not in it: a test may clear its data directory.
    const writeLog = `${dir}.build-writes.log`;
    return {
        dir,
        env: { ...baseEnv, [DATA_DIR_ENV]: dir, [BUILD_WRITE_LOG_ENV]: writeLog },
        execArgv: ['--require', BUILD_WRITE_GUARD],
        buildWrites: () => {
            try { return fs.readFileSync(writeLog, 'utf8').split(/\r?\n/).filter(Boolean); } catch { return []; }
        },
        dispose: () => {
            fs.rmSync(dir, { recursive: true, force: true });
            fs.rmSync(writeLog, { force: true });
        },
    };
}

/**
 * The failure a runner reports for a test that wrote under out/ or out-test/.
 * @param {string[]} writes  Lines from buildWrites()
 * @returns {string}
 */
function buildWriteFailure(writes) {
    const shown = writes.slice(0, 10).map(w => `    ${w}`).join('\n');
    const more  = writes.length > 10 ? `\n    ... and ${writes.length - 10} more` : '';
    return `wrote ${writes.length} time(s) under out/ or out-test/, the build every other test reads (#832). `
        + `Build fixtures in a temp directory of the test's own:\n${shown}${more}`;
}

/**
 * Points this process at a fresh data directory of its own, removed when the
 * process exits. Call it before requiring the module under test: the modules
 * resolve their data paths when they load.
 * @param {string} label  Readable part of the temp directory name
 * @returns {string} The data directory
 */
function useOwnDataDir(label) {
    const data = testDataEnv(label);
    process.env[DATA_DIR_ENV] = data.dir;
    process.on('exit', data.dispose);
    return data.dir;
}

module.exports = { DATA_DIR_ENV, BUILD_WRITE_LOG_ENV, testDataEnv, buildWriteFailure, useOwnDataDir };
