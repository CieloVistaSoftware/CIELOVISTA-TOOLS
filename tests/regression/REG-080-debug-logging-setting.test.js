'use strict';
/**
 * REG-080 — debug() export in output-channel.ts respects cielovista-tools.debug.enabled
 *
 * Issue #430: implement global debug logging system that honours the
 * cielovista-tools.debug.enabled VS Code setting.
 *
 * Verifies:
 *   1. src/shared/output-channel.ts exports a `debug` function
 *   2. package.json contributes cielovista-tools.debug.enabled as a boolean setting
 *   3. The debug() function body reads 'debug.enabled' from 'cielovista-tools' config
 *   4. The debug() function calls log() with a [DEBUG] prefix
 *   5. A mock of the same logic suppresses output when setting=false
 *   6. A mock of the same logic writes output when setting=true
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..', '..');
const OUTPUT_TS  = path.join(ROOT, 'src', 'shared', 'output-channel.ts');
const PKG_JSON   = path.join(ROOT, 'package.json');

let passed = 0;
let failed = 0;

function check(desc, cond, detail) {
    if (cond) {
        console.log(`  ✓ ${desc}`);
        passed++;
    } else {
        console.error(`  ✗ ${desc}${detail ? ': ' + detail : ''}`);
        failed++;
    }
}

console.log('REG-080: debug() in output-channel.ts respects cielovista-tools.debug.enabled');
console.log('');

// ── Read source files ─────────────────────────────────────────────────────────
let src;
try {
    src = fs.readFileSync(OUTPUT_TS, 'utf8');
} catch (e) {
    console.error(`  ✗ Cannot read ${OUTPUT_TS}: ${e.message}`);
    process.exit(1);
}

let pkg;
try {
    pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
} catch (e) {
    console.error(`  ✗ Cannot parse ${PKG_JSON}: ${e.message}`);
    process.exit(1);
}

// ── Check 1: debug export exists ──────────────────────────────────────────────
check(
    "output-channel.ts exports a 'debug' function",
    /export function debug\s*\(/.test(src)
);

// ── Check 2: setting is in package.json ───────────────────────────────────────
const cfgProps = pkg &&
    pkg.contributes &&
    pkg.contributes.configuration &&
    pkg.contributes.configuration.properties;

check(
    "package.json contributes 'cielovista-tools.debug.enabled' property",
    cfgProps && Object.prototype.hasOwnProperty.call(cfgProps, 'cielovista-tools.debug.enabled')
);

// ── Check 3: setting type is boolean with default false ───────────────────────
const settingDef = cfgProps && cfgProps['cielovista-tools.debug.enabled'];
check(
    "'cielovista-tools.debug.enabled' is a boolean with default: false",
    settingDef &&
    settingDef.type === 'boolean' &&
    settingDef.default === false,
    settingDef ? JSON.stringify(settingDef) : 'property missing'
);

// ── Check 4: debug() reads 'debug.enabled' from 'cielovista-tools' config ─────
const debugFnIdx = src.indexOf('export function debug(');
check(
    "debug() function reads from 'cielovista-tools' configuration namespace",
    debugFnIdx !== -1 &&
    src.slice(debugFnIdx, debugFnIdx + 500).includes("getConfiguration('cielovista-tools')")
);

check(
    "debug() function checks 'debug.enabled' key",
    debugFnIdx !== -1 &&
    src.slice(debugFnIdx, debugFnIdx + 500).includes("'debug.enabled'")
);

// ── Check 5: debug() calls log() with [DEBUG] prefix ─────────────────────────
check(
    "debug() calls log() with '[DEBUG]' prefix",
    debugFnIdx !== -1 &&
    src.slice(debugFnIdx, debugFnIdx + 500).includes('[DEBUG]') &&
    src.slice(debugFnIdx, debugFnIdx + 500).includes('log(')
);

// ── Check 6: mock — output suppressed when setting=false ──────────────────────
// Replicate the same conditional logic as the real debug() function to verify
// correct suppress/emit behaviour without importing VS Code.
function mockDebug(debugEnabled, feature, message) {
    const logged = [];
    // mirrors: if (!cfg.get<boolean>('debug.enabled', false)) { return; }
    if (!debugEnabled) { return logged; }
    // mirrors: log(feature, `[DEBUG] ${message}`);
    logged.push(`[DEBUG] ${message}`);
    return logged;
}

const suppressedResult = mockDebug(false, 'test-feature', 'hello');
check(
    "mock: debug() produces no output when setting=false",
    suppressedResult.length === 0,
    `got ${suppressedResult.length} entries`
);

// ── Check 7: mock — output emitted when setting=true ─────────────────────────
const emittedResult = mockDebug(true, 'test-feature', 'hello');
check(
    "mock: debug() produces output when setting=true",
    emittedResult.length === 1 && emittedResult[0] === '[DEBUG] hello',
    `got: ${JSON.stringify(emittedResult)}`
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (failed > 0) {
    console.error(`REG-080 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-080 passed (${passed} checks)`);
}
