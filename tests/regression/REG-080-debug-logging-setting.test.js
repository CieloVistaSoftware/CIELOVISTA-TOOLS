'use strict';
/**
 * REG-080 — debug() export in output-channel.ts respects cielovista-tools.debug.enabled
 *
 * Issue #430: implement global debug logging system that honours the
 * cielovista-tools.debug.enabled VS Code setting.
 *
 * Verifies:
 *   1. package.json contributes cielovista-tools.debug.enabled as a boolean setting, default false
 *   2. The build of src/shared/output-channel.ts exports a debug function
 *   3. The real debug() reads 'debug.enabled' from the 'cielovista-tools' config
 *   4. The real debug() writes nothing when the setting is false
 *   5. The real debug() writes one [DEBUG] line when the setting is true
 * Checks 2-5 run the out-test build, not the source text or a copy (#823).
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..', '..');
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

let pkg;
try {
    pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf8'));
} catch (e) {
    console.error(`  ✗ Cannot parse ${PKG_JSON}: ${e.message}`);
    process.exit(1);
}

// ── Check 1: setting is in package.json ───────────────────────────────────────
const cfgProps = pkg &&
    pkg.contributes &&
    pkg.contributes.configuration &&
    pkg.contributes.configuration.properties;

check(
    "package.json contributes 'cielovista-tools.debug.enabled' property",
    cfgProps && Object.prototype.hasOwnProperty.call(cfgProps, 'cielovista-tools.debug.enabled')
);

const settingDef = cfgProps && cfgProps['cielovista-tools.debug.enabled'];
check(
    "'cielovista-tools.debug.enabled' is a boolean with default: false",
    settingDef &&
    settingDef.type === 'boolean' &&
    settingDef.default === false,
    settingDef ? JSON.stringify(settingDef) : 'property missing'
);

// ── Checks 2-5: the real debug(), run against the setting ────────────────────
// Loads the out-test build of src/shared/output-channel.ts with a vscode mock
// whose getConfiguration() returns the setting, and records what reaches the
// channel. Until #823 these checks ran a copy of debug()'s logic (mockDebug),
// so the real function could stop reading the setting and they stayed green.
const OUTPUT_JS = path.join(ROOT, 'out-test', 'shared', 'output-channel.js');
if (!fs.existsSync(OUTPUT_JS)) {
    // Not a skip: the runners build out-test/ first, so this is a real failure.
    console.error(`  ✗ out-test build missing: ${OUTPUT_JS}`);
    process.exit(1);
}

let debugEnabled = false;
const configReads = [];
const written = [];
const vscodeMock = {
    window: {
        createOutputChannel: () => ({ appendLine: (l) => { written.push(l); }, show: () => {}, dispose: () => {} }),
    },
    workspace: {
        getConfiguration: (section) => ({
            get: (key, dflt) => {
                configReads.push(`${section}:${key}`);
                return section === 'cielovista-tools' && key === 'debug.enabled' ? debugEnabled : dflt;
            },
        }),
    },
};
const Module   = require('module');
const origLoad = Module._load;
Module._load = function (req) { return req === 'vscode' ? vscodeMock : origLoad.apply(this, arguments); };
const { debug } = require(OUTPUT_JS);
Module._load = origLoad;

check("the build of output-channel.ts exports a debug function", typeof debug === 'function', typeof debug);
if (typeof debug !== 'function') { console.error('REG-080 FAILED'); process.exit(1); }

debugEnabled = false;
debug('test-feature', 'hello-off');
check(
    "debug() writes nothing when cielovista-tools.debug.enabled is false",
    written.length === 0,
    `got: ${JSON.stringify(written)}`
);
check(
    "debug() reads 'debug.enabled' from the 'cielovista-tools' configuration",
    configReads.includes('cielovista-tools:debug.enabled'),
    `reads: ${JSON.stringify(configReads)}`
);

debugEnabled = true;
debug('test-feature', 'hello-on');
check(
    "debug() writes one '[DEBUG]' line, tagged with the feature, when the setting is true",
    written.length === 1 && written[0].includes('[test-feature] [DEBUG] hello-on'),
    `got: ${JSON.stringify(written)}`
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (failed > 0) {
    console.error(`REG-080 FAILED: ${failed} check(s) failed`);
    process.exit(1);
} else {
    console.log(`REG-080 passed (${passed} checks)`);
}
