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
        const msg = err && err.message ? err.message : String(err);
        if (/vscodeinsiders-updating|currently being updated/i.test(msg)) {
            console.warn('\nSKIP: VS Code Insiders is updating — wait for the update to finish, then re-run.');
            process.exit(0);
        }
        console.error('\nActivation test FAILED:', msg);
        process.exit(1);
    }
}

main();
