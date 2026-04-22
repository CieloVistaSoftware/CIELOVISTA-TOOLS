w// Copyright (c) 2026 CieloVista Software. All rights reserved.
// Test: Execute Accepted in Doc Intelligence

import assert from 'assert';
import { executeAcceptedFindings, getFindings, clearFindings, addFinding } from '../src/features/doc-intelligence/engine.js';

// Mock finding with a create action
const finding = {
  id: 'test-1',
  kind: 'missing-readme',
  severity: 'red',
  title: 'Missing README: test-app',
  reason: 'No README.md in test-app',
  recommendation: 'Create README.md',
  action: 'create',
  paths: ['C:/Users/jwpmi/Downloads/VSCode/projects/test-app/README.md'],
  decision: 'accepted',
};

describe('Doc Intelligence: Execute Accepted', function() {
  beforeEach(() => { clearFindings(); });

  it('should execute all accepted findings', async function() {
    addFinding(finding);
    const before = getFindings().filter(f => f.decision === 'accepted').length;
    assert.strictEqual(before, 1, 'Should have 1 accepted finding before execution');
    await executeAcceptedFindings();
    const after = getFindings().filter(f => f.decision === 'accepted').length;
    assert.strictEqual(after, 0, 'Should have 0 accepted findings after execution');
  });
});
