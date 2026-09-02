/**
 * source-tree-walk.js
 *
 * Race-safe source-tree walking for the regression suite (#697).
 *
 * A directory walk is not atomic: readdirSync() takes a snapshot, and the
 * readFileSync() that consumes it happens later. On a live working tree the
 * snapshot can go stale between the two — an editor save, a git checkout, or a
 * sibling test process removing its own fixture. When that happens a plain
 * readFileSync() throws ENOENT and the scan reports a bogus assertion failure
 * against a completely unrelated file.
 *
 * That is exactly what made REG-001 fail intermittently under the full suite
 * while passing standalone: REG-015 created and deleted
 * src/features/__reg015_test_feature.ts while REG-001 was mid-scan.
 *
 * Every source scan in the suite must therefore treat "the file vanished
 * between listing and reading" as "this file is not part of the tree", not as
 * a failure. Pure functions only — no state, no logging.
 *
 * Usage:
 *   const { walkFiles, readSources } = require('./source-tree-walk');
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['node_modules', '.git']);

/** Errors that mean "the path is gone / not readable as a file right now". */
const VANISHED = new Set(['ENOENT', 'ENOTDIR', 'EPERM', 'EBUSY']);

function isVanished(err) {
  return err !== null && typeof err === 'object' && VANISHED.has(err.code);
}

/**
 * Recursively list files under `dir`.
 *
 * @param {string}   dir        Directory to walk.
 * @param {object}   [options]
 * @param {string[]} [options.extensions] Extensions to keep, e.g. ['.ts'].
 *                                        Omit to keep every file.
 * @returns {string[]} Absolute file paths.
 */
function walkFiles(dir, options = {}) {
  const extensions = options.extensions ?? null;
  const results    = [];

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // A directory that disappeared mid-walk contributes no files.
    if (isVanished(err)) { return results; }
    throw err;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) { continue; }
      results.push(...walkFiles(full, options));
    } else if (entry.isFile()) {
      if (extensions && !extensions.some(ext => entry.name.endsWith(ext))) { continue; }
      results.push(full);
    }
  }

  return results;
}

/**
 * Read a file, returning null instead of throwing when it has vanished since
 * the directory listing that produced its path.
 *
 * @param {string} file Absolute path.
 * @returns {string|null} File contents, or null if the path is gone.
 */
function readIfPresent(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (isVanished(err)) { return null; }
    throw err;
  }
}

/**
 * Read every path in `files`, silently dropping the ones that vanished.
 *
 * @param {string[]} files Absolute paths, typically from walkFiles().
 * @param {string}   [root] When given, `file` is made relative to it.
 * @returns {{ file: string, src: string }[]}
 */
function readSources(files, root) {
  const out = [];
  for (const full of files) {
    const src = readIfPresent(full);
    if (src === null) { continue; }
    out.push({ file: root ? path.relative(root, full) : full, src });
  }
  return out;
}

/**
 * Walk `dir` and read everything under it in one call.
 *
 * @param {string} dir
 * @param {object} [options] Passed through to walkFiles(); `root` is used for
 *                           the relative paths in the result.
 * @returns {{ file: string, src: string }[]}
 */
function walkAndReadSources(dir, options = {}) {
  return readSources(walkFiles(dir, options), options.root);
}

module.exports = { walkFiles, readIfPresent, readSources, walkAndReadSources, isVanished };
