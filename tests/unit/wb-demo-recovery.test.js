// Run with: node tests/unit/wb-demo-recovery.test.js
// Verifies that the wb-demo message handler guards openExternal behind a
// confirmed-server-ready check and provides a recovery path on failure.

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const commandsPath = path.join(__dirname, '../../src/features/doc-catalog/commands.ts');

assert.ok(fs.existsSync(commandsPath), 'Missing file: ' + commandsPath);

const src = fs.readFileSync(commandsPath, 'utf8');

// Module-level port-check helper must exist
assert.ok(
    src.includes('function checkDemoPort(port: number)'),
    'commands.ts must export checkDemoPort — a module-level TCP port check function.'
);

// Polling retry helper must exist
assert.ok(
    src.includes('function pollUntilDemoReady(port: number'),
    'commands.ts must define pollUntilDemoReady to retry the port check instead of a fixed sleep.'
);

// The wb-demo handler must use the module-level checker (not an inline checkPort)
assert.ok(
    src.includes('await checkDemoPort(demoPort)'),
    'wb-demo handler must call checkDemoPort to verify the server is up.'
);

// pollUntilDemoReady must be called after spawning the server
assert.ok(
    src.includes('await pollUntilDemoReady(demoPort'),
    'wb-demo handler must call pollUntilDemoReady after spawning the server.'
);

// openExternal must be guarded behind the serverReady check — i.e. it must NOT
// appear before the "if (!serverReady)" guard block in the wb-demo case.
const wbDemoStart = src.indexOf("case 'wb-demo':");
const wbDemoEnd   = src.indexOf('break;\n            }', wbDemoStart);
assert.ok(wbDemoStart !== -1, 'wb-demo case must exist in commands.ts');
assert.ok(wbDemoEnd   !== -1, 'wb-demo case closing break must exist');

const wbDemoBlock = src.slice(wbDemoStart, wbDemoEnd);

assert.ok(
    wbDemoBlock.includes('if (!serverReady)'),
    'wb-demo handler must guard against the server being unavailable with if (!serverReady).'
);

// Recovery path: showErrorMessage with Retry/Dismiss options
assert.ok(
    wbDemoBlock.includes("'Retry'") && wbDemoBlock.includes("'Dismiss'"),
    'wb-demo handler must offer Retry and Dismiss options when the server is unavailable.'
);

// openExternal must only be reached when the server is confirmed ready
// (i.e. there should be no openExternal call before the serverReady guard)
const beforeGuard = wbDemoBlock.slice(0, wbDemoBlock.indexOf('if (!serverReady)'));
assert.ok(
    !beforeGuard.includes('openExternal'),
    'openExternal must not be called before the serverReady guard in the wb-demo handler.'
);

// The old fixed-sleep of 1200 ms must be gone
assert.ok(
    !wbDemoBlock.includes('setTimeout(r, 1200)'),
    'wb-demo handler must not use a fixed 1200 ms sleep; it must use pollUntilDemoReady instead.'
);

// pollUntilDemoReady must be called with the expected retry parameters (10 attempts, 500 ms)
assert.ok(
    wbDemoBlock.includes('pollUntilDemoReady(demoPort, 10, 500)'),
    'wb-demo handler must call pollUntilDemoReady with 10 attempts at 500 ms intervals.'
);

console.log('PASS: wb-demo recovery — server check, polling, and Retry/Dismiss flow are all in place.');
