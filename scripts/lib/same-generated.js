// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * same-generated.js — is a generated file on disk current? (#732)
 *
 * The generators write LF. Git checks a file out with CRLF on Windows
 * (core.autocrlf) unless .gitattributes pins it, and docs/index.html was not
 * pinned. A byte comparison therefore called the page "out of date" on every
 * Windows checkout, and running the generator "fixed" it with no content
 * change. A check that is red for no reason teaches people to ignore it.
 *
 * Line endings are not content. Everything else is compared exactly.
 */
'use strict';

/** True when `onDisk` holds the same content as freshly generated `generated`. */
function sameGenerated(onDisk, generated) {
    if (onDisk === null || onDisk === undefined) { return false; }
    return onDisk.replace(/\r\n/g, '\n') === generated.replace(/\r\n/g, '\n');
}

module.exports = { sameGenerated };
