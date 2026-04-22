/**
 * tests/vscode/runTests.js
 *
 * Launches VS Code Insiders with the extension loaded and runs the
 * activation test suite inside the real extension host.
 *
 * Run: node tests/vscode/runTests.js
 * npm:  npm run test:vscode
 */
'use strict';

const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../..');
        const extensionTestsPath       = path.resolve(__dirname, 'suite/index.js');

        await runTests({
            // Use VS Code Insiders — same version John runs
            version: 'insiders',

            extensionDevelopmentPath,
            extensionTestsPath,

            // Open a throwaway empty folder — no workspace needed
            launchArgs: ['--new-window', '--disable-extensions'],

            // Don't reuse an existing instance
            extensionTestsEnv: {
                CVT_TEST_MODE: '1',
            },
        });
        console.log('\nVSCode integration test PASSED');
        process.exit(0);
    } catch (err) {
        console.error('\nVSCode integration test FAILED:', err.message ?? err);
        process.exit(1);
    }
}

main();
