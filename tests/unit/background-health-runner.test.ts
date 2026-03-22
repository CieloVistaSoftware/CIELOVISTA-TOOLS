// background-health-runner.test.ts
// Unit tests for background-health-runner feature

import * as fs from 'fs';
import * as path from 'path';
import * as bgHealth from '../../../src/features/background-health-runner';

describe('background-health-runner', () => {
  const testFile = path.join(__dirname, '../../../data/bg-health.json');
  const sampleBug = {
    id: 'bug-test',
    checkId: 'chk-test',
    title: 'Test Bug',
    detail: 'A test bug',
    priority: 'high' as const,
    category: 'test',
    fixCommandId: 'fix.test',
    fixLabel: 'Fix Test',
  };

  beforeEach(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    // Reset state
    (bgHealth as any)._state = {
      lastRun: '', totalChecks: 0, bugs: [], checkIndex: 0,
    };
  });

  it('should add a bug and persist state', () => {
    (bgHealth as any).addBug(sampleBug);
    (bgHealth as any).saveState();
    expect(fs.existsSync(testFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    expect(data.bugs.length).toBe(1);
    expect(data.bugs[0].id).toBe('bug-test');
    expect(data.bugs[0].fixed).toBe(false);
  });

  it('should clear a bug', () => {
    (bgHealth as any).addBug(sampleBug);
    (bgHealth as any).clearBug('bug-test');
    expect((bgHealth as any)._state.bugs[0].fixed).toBe(true);
  });

  it('should not duplicate bugs with same id', () => {
    (bgHealth as any).addBug(sampleBug);
    (bgHealth as any).addBug({ ...sampleBug, title: 'Updated' });
    expect((bgHealth as any)._state.bugs.length).toBe(1);
    expect((bgHealth as any)._state.bugs[0].title).toBe('Updated');
  });
});
