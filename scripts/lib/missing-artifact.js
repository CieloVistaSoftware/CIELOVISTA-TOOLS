// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Unauthorized copying or distribution of this file is strictly prohibited.
/**
 * missing-artifact.js — what a test prints when its build input is missing (#734).
 *
 * For four months 54 test files printed "SKIP: not compiled" (or a variant) and
 * exited 0, and every runner counted that as a pass. Both runners —
 * run-unit-tests.js and run-regression-tests.js — use this one pattern to turn
 * that output into a failure, so the wording a test happens to use cannot
 * decide whether it is checked.
 */
'use strict';

/** Output meaning "my input was not built", however a given test words it. */
const MISSING_ARTIFACT = /skip\w*\b[^\n]*(not compiled|not found|not built|compiled output|npm run compile)/i;

/** True when a test that exited 0 actually skipped for a missing build artifact. */
function skippedForMissingArtifact(output) {
    return MISSING_ARTIFACT.test(output);
}

module.exports = { MISSING_ARTIFACT, skippedForMissingArtifact };
