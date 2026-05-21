'use strict';

const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../..');
        const extensionTestsPath       = path.resolve(__dirname, 'suite/activation-only.index.js');

        await runTests({
            version: 'insiders',
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: ['--new-window', '--disable-extensions'],
            extensionTestsEnv: {
                CVT_TEST_MODE: '1',
            },
        });
        console.log('\nActivation test PASSED');
        process.exit(0);
    } catch (err) {
        console.error('\nActivation test FAILED:', err && err.message ? err.message : err);
        process.exit(1);
    }
}

main();
