'use strict';

const path = require('path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../..');
        const extensionTestsPath = path.resolve(__dirname, 'suite/home-filelist-only.index.js');

        await runTests({
            version: 'insiders',
            extensionDevelopmentPath,
            extensionTestsPath,
            // Open with a real workspace root so FileList has a folder context.
            launchArgs: [extensionDevelopmentPath, '--new-window', '--disable-extensions'],
            extensionTestsEnv: {
                CVT_TEST_MODE: '1',
            },
        });

        console.log('\nHome->FileList GUI test PASSED');
        process.exit(0);
    } catch (err) {
        console.error('\nHome->FileList GUI test FAILED:', err && err.message ? err.message : err);
        process.exit(1);
    }
}

main();
