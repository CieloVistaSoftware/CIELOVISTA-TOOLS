'use strict';

const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'src', 'features', 'doc-catalog');

function read(name) {
    return fs.readFileSync(path.join(BASE, name), 'utf8');
}

const htmlSrc = read('html.ts');
const commandsSrc = read('commands.ts');
const shellSrc = read('catalog.html');
const projectsSrc = read('projects.ts');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log('  PASS:', name);
        passed++;
    } catch (error) {
        console.error('  FAIL:', name, '-', error.message);
        failed++;
    }
}

function includes(source, needle, message) {
    if (!source.includes(needle)) {
        throw new Error(message || `Missing ${needle}`);
    }
}

console.log('\nRunning Doc Catalog Tests...\n');

test('html.ts exposes buildCatalogInitPayload', () => {
    includes(htmlSrc, 'export function buildCatalogInitPayload(', 'Expected buildCatalogInitPayload export');
});

test('commands.ts sends init payload after setting webview HTML', () => {
    includes(commandsSrc, "command: 'init'", 'Doc Catalog must post init payload to the shell');
    includes(commandsSrc, 'sendCatalogInit(_catalogPanel, cards, projectInfos, registry?.projects ?? []);', 'openCatalog must send init payload');
});

test('deserializeCatalogPanel also resends init payload', () => {
    includes(commandsSrc, 'sendCatalogInit(_catalogPanel!, cards, projectInfos, registry?.projects ?? []);', 'restored panel must resend init payload');
});

test('catalog shell listens for init message', () => {
    includes(shellSrc, "if (msg.command === 'init')", 'catalog shell must handle init message');
    includes(shellSrc, "document.getElementById('catalog').innerHTML = msg.html;", 'catalog shell must render init HTML');
});

test('catalog shell forwards project button actions', () => {
    includes(shellSrc, "a === 'open-npm-scripts'", 'open-npm-scripts action must be wired');
    includes(shellSrc, "a === 'open-folder'", 'open-folder action must be wired');
    includes(shellSrc, "a === 'open-claude'", 'open-claude action must be wired');
    includes(shellSrc, "a === 'create-tests'", 'create-tests action must be wired');
});

test('projects section renders launch button for NPM Scripts panel', () => {
    includes(projectsSrc, 'data-action="open-npm-scripts"', 'projects section must expose the NPM Scripts launch button');
    includes(projectsSrc, 'Open NPM Scripts', 'projects section must label the launch button clearly');
});

test('card-title has tooltip title attribute with Where/When/Why/How', () => {
    includes(htmlSrc, 'title="${esc(tooltipText)}"', 'card-title must have a title attribute bound to tooltipText');
    includes(htmlSrc, '`Where:', 'tooltip must contain Where section');
    includes(htmlSrc, '`When:', 'tooltip must contain When section');
    includes(htmlSrc, '`Why:', 'tooltip must contain Why section');
    includes(htmlSrc, '`How:', 'tooltip must contain How section');
    includes(htmlSrc, '`Dewey:', 'tooltip must include Dewey number');
});

test('card-title tooltip uses deweyNum in footer line', () => {
    includes(htmlSrc, 'Dewey: ${deweyNum}', 'tooltip footer must embed the computed deweyNum');
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exit(1);
}
