// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.

/**
 * data-dir.ts
 * Where a module keeps its data/ files (error log, bg-health state, reports).
 *
 * Every module that stores a JSON or report file under a data/ directory
 * resolves that directory here, so one setting moves all of them at once.
 *
 * CVT_DATA_DIR, when set, is the data directory for the whole process. The
 * unit and regression runners give each test process a directory of its own
 * through it (#825). Before that, every test that loaded the error log wrote
 * out-test/data/cielovista-errors.json, the same file for every test process
 * the runner started in parallel, and on Windows a read that overlapped
 * another process's unlink failed with EPERM.
 *
 * Unset (the installed extension), the module's own default is used unchanged.
 */
import * as path from 'path';

/** The environment variable that overrides every module's data directory. */
export const DATA_DIR_ENV = 'CVT_DATA_DIR';

/**
 * The data directory to use: CVT_DATA_DIR when it is set, otherwise the
 * caller's default (normally path.join(__dirname, '..', 'data')).
 *
 * @param defaultDir  The directory the module uses when nothing overrides it
 * @returns           An absolute directory path
 */
export function dataDir(defaultDir: string): string {
    const override = process.env[DATA_DIR_ENV];
    return override && override.trim() ? path.resolve(override.trim()) : defaultDir;
}
