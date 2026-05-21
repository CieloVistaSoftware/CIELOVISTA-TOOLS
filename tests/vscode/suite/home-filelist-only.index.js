'use strict';

const path = require('path');
const Mocha = require('mocha');

exports.run = function() {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 30000,
    });

    mocha.addFile(path.join(__dirname, 'home-filelist-gui.test.js'));

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
