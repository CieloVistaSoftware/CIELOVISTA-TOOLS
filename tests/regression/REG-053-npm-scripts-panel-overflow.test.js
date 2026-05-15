/**
 * REG-053-npm-scripts-panel-overflow.test.js
 *
 * Regression guard for the package.json Scripts panel classification layout.
 * Ensures a large script surface still renders all scripts while keeping the
 * card compact via Primary, Secondary, and More commands sections.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SHELL_SRC = path.resolve(__dirname, '..', '..', 'src', 'shared', 'project-card-shell.ts');

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) { throw new Error(`Missing function ${name}`); }
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') { depth++; }
        else if (ch === '}') {
            depth--;
            if (depth === 0) { return source.slice(start, i + 1); }
        }
    }
    throw new Error(`Could not extract function ${name}`);
}

const shell = fs.readFileSync(SHELL_SRC, 'utf8');
const classifySource = extractFunction(shell, 'classifyScripts');
const classifyScripts = vm.runInNewContext(`${classifySource}; classifyScripts;`);

const scripts = [
    'rebuild', 'start', 'dev', 'build', 'compile', 'test', 'lint', 'clean',
    'watch', 'package', 'format', 'coverage', 'docs', 'docs:build',
    'docs:serve', 'test:unit', 'test:e2e', 'test:watch', 'release', 'deploy',
    'db:migrate', 'db:seed',
].map((name, index) => ({
    name,
    primary: name === 'rebuild' || name === 'start',
    dewey: `100.${String(index + 1).padStart(3, '0')}`,
    doc: { what: '', when: '', where: '', how: '', why: '', expectedOutput: '', docFile: false, sourceLabel: '' },
}));

const layout = classifyScripts(scripts);
const primaryNames = Array.from(layout.primary, script => script.name);
const secondaryNames = Array.from(layout.secondary, script => script.name);
const moreScripts = Array.from(Object.values(layout.moreGroups), group => Array.from(group)).flat();
const renderedNames = [
    ...primaryNames,
    ...secondaryNames,
    ...moreScripts.map(script => script.name),
];

assert.ok(shell.includes('<details class="pc-more"'), 'More commands details element must exist in shell');
assert.deepStrictEqual(
    primaryNames,
    ['rebuild', 'start', 'dev', 'build'],
    'Primary section should show the four highest-priority scripts first'
);
assert.ok(secondaryNames.length > 0, 'Secondary section should retain common non-primary scripts');
assert.ok(secondaryNames.length <= 8, 'Secondary section should stay compact and leave room for overflow');
assert.ok(layout.moreCount > 0, 'Large script sets must overflow into the More commands section');
assert.ok(layout.moreGroups.Docs?.some(script => script.name === 'docs:build'), 'Namespaced docs scripts should be grouped under Docs');
assert.ok(layout.moreGroups.Test?.some(script => script.name === 'test:e2e'), 'Namespaced test scripts should be grouped under Test');
assert.strictEqual(renderedNames.length, scripts.length, 'Every script should be rendered exactly once across all sections');
assert.strictEqual(new Set(renderedNames).size, scripts.length, 'No script should appear more than once');

console.log('REG-053 PASSED — npm scripts panel keeps all scripts visible with overflow grouping');
