/**
 * tests/vscode/suite/index.js
 *
 * Mocha test suite entry point — runs inside the VS Code extension host.
 * @vscode/test-electron calls this file after activating the extension.
 */
'use strict';

const path  = require('path');
const Mocha = require('mocha');
const fs    = require('fs');

exports.run = function() {
    const mocha = new Mocha({
        ui:      'tdd',
        color:   true,
        timeout: 20000,
    });

    const suiteDir = __dirname;
    // GUI tests require a live VS Code workspace with a rendered panel.
    // They are excluded from the default suite to prevent timeouts in CI.
    // Run them manually via: npx vscode-test --extensionTestsPath=tests/vscode/suite/gui-only.index.js
    const GUI_TESTS = new Set(['home-filelist-gui.test.js']);

    fs.readdirSync(suiteDir)
        .filter(f => f.endsWith('.test.js') && !GUI_TESTS.has(f))
        .forEach(f => mocha.addFile(path.join(suiteDir, f)));

    return new Promise((resolve, reject) => {
        mocha.run(failures => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed`));
            } else {
                resolve();
            }
        });
    });
};
