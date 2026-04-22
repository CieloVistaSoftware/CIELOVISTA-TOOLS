#!/usr/bin/env node

// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Runs a reliable, folder-focused verification suite for src/features/doc-catalog.

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

const steps = [
    { name: 'Compile TypeScript', cmd: 'npm', args: ['run', 'compile'] },
    { name: 'Doc Catalog Shell/Init Tests', cmd: 'node', args: ['tests/doc-catalog.test.js'] },
    { name: 'Doc Catalog Projects Runtime Tests', cmd: 'node', args: ['tests/doc-catalog.add-project.test.js'] },
    { name: 'View Doc Integration Tests', cmd: 'node', args: ['tests/view-doc-integration.test.js'] },
    { name: 'View Doc Server Tests', cmd: 'node', args: ['tests/view-doc-server.test.js'] },
    { name: 'View Doc Functional Tests', cmd: 'node', args: ['tests/view-doc-functional.test.js'] },
];

let failed = 0;

console.log('\nDoc Catalog Folder Test Suite\n');

for (const step of steps) {
    console.log(`\n=== ${step.name} ===`);
    const r = spawnSync(step.cmd, step.args, {
        cwd: root,
        stdio: 'inherit',
        shell: false,
    });

    if (r.status !== 0) {
        failed++;
        console.error(`\nFAILED: ${step.name} (exit ${r.status})`);
        break;
    }
}

if (failed > 0) {
    console.error('\nDoc Catalog folder suite FAILED.');
    process.exit(1);
}

console.log('\nDoc Catalog folder suite PASSED.');
