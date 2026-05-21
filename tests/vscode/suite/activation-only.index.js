'use strict';

const path = require('path');
const Mocha = require('mocha');

exports.run = function() {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 20000,
    });

    mocha.addFile(path.join(__dirname, 'activation.test.js'));

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
