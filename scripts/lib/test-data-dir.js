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
 *   const child = spawn(node, [file], { env: data.env });
 *   child.on('close', () => data.dispose());
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

/** Must match DATA_DIR_ENV in src/shared/data-dir.ts. */
const DATA_DIR_ENV = 'CVT_DATA_DIR';

/**
 * A fresh data directory for one test process.
 * @param {string} label  Readable part of the temp directory name
 * @param {NodeJS.ProcessEnv} [baseEnv]  Environment to extend (default process.env)
 * @returns {{ dir: string, env: NodeJS.ProcessEnv, dispose: () => void }}
 */
function testDataEnv(label, baseEnv = process.env) {
    const safe = String(label).replace(/[^\w.-]+/g, '-').slice(0, 40) || 'test';
    const dir  = fs.mkdtempSync(path.join(os.tmpdir(), `cvt-data-${safe}-`));
    return {
        dir,
        env: { ...baseEnv, [DATA_DIR_ENV]: dir },
        dispose: () => { fs.rmSync(dir, { recursive: true, force: true }); },
    };
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

module.exports = { DATA_DIR_ENV, testDataEnv, useOwnDataDir };
