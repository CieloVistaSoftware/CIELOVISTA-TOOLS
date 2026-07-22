// Copyright (c) CieloVista Software. All rights reserved.
// REG-024: Issue #277 — Daily audit auditExcluded flag.
// Guards that container/umbrella folders are excluded from daily audit checks.
// Tests source-level filter contract and registry data shape.

'use strict';

const fs   = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT          = path.resolve(__dirname, '..', '..');
const REGISTRY_PATH = 'C:\\Users\\jwpmi\\Downloads\\CieloVistaStandards\\project-registry.json';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// ─── 1. runner.ts — interface has auditExcluded field ─────────────────────────

const runnerSrc = fs.readFileSync(path.join(ROOT, 'src/features/daily-audit/runner.ts'), 'utf8');

test('runner.ts ProjectEntry has auditExcluded?: boolean', () => {
  assert(runnerSrc.includes('auditExcluded?: boolean'),
    'auditExcluded?: boolean not found in ProjectEntry interface');
});

test('runner.ts strictProjects filter excludes auditExcluded', () => {
  assert(/strictProjects[\s\S]*?projects\.filter[\s\S]*?!p\.auditExcluded/.test(runnerSrc),
    'strictProjects filter does not exclude auditExcluded entries');
});

// ─── 2. run-audit.js — main() filters out auditExcluded ───────────────────────

const auditSrc = fs.readFileSync(path.join(ROOT, 'scripts/run-audit.js'), 'utf8');

test('run-audit.js filters out auditExcluded projects', () => {
  assert(auditSrc.includes('registry.projects.filter(p => !p.auditExcluded)'),
    'run-audit.js does not filter auditExcluded from registry.projects');
});

// ─── 3. project-registry.json — container folders are flagged ─────────────────
// project-registry.json is the developer's own personal project list -- it
// only ever exists on their machine, never on a CI runner. Parts 1-2 above
// (pure source-code checks) still run everywhere; only this registry-content
// check is skipped under CI.

const EXPECTED_EXCLUDED = ['VSCode-extensions', 'ai', 'company', 'language', 'protocols', 'samples', 'settings', 'tooling', 'templates'];

let registry;
if (process.env.CI) {
  console.log('  SKIP project-registry.json is valid JSON (personal file, not present on CI runners)');
} else {
  test('project-registry.json is valid JSON', () => {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    assert(Array.isArray(registry.projects), 'registry.projects is not an array');
  });
}

if (registry) {
  for (const name of EXPECTED_EXCLUDED) {
    test(`registry: "${name}" has auditExcluded: true`, () => {
      const entry = registry.projects.find(p => p.name === name);
      assert(entry, `project "${name}" not found in registry`);
      assert(entry.auditExcluded === true, `project "${name}" is missing auditExcluded: true`);
    });
  }

  test('registry: real products do NOT have auditExcluded', () => {
    const excluded = registry.projects.filter(p => p.auditExcluded && !EXPECTED_EXCLUDED.includes(p.name));
    assert(excluded.length === 0,
      `Unexpected auditExcluded projects: ${excluded.map(p => p.name).join(', ')}`);
  });

  test('registry: auditExcluded count matches expected', () => {
    const count = registry.projects.filter(p => p.auditExcluded).length;
    assert(count === EXPECTED_EXCLUDED.length,
      `Expected ${EXPECTED_EXCLUDED.length} excluded projects, found ${count}`);
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('REG-024: Daily audit auditExcluded flag');
console.log('─'.repeat(50));
if (failed === 0) {
  console.log(`✓ REG-024 passed (${passed} checks — ${EXPECTED_EXCLUDED.length} container folders excluded from audit).`);
  process.exit(0);
} else {
  console.error(`✗ REG-024 FAILED (${failed} of ${passed + failed} checks failed).`);
  process.exit(1);
}
