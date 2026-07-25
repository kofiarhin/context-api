'use strict';

const { DEVOPS_LOG_STATES } = require('../../src/utils/enums');
const { QUERY_SCHEMAS } = require('../../src/validation/schemas');

const REQUIRED_STATES = [
  'proposed',
  'approved',
  'running',
  'blocked',
  'failed',
  'passed',
  'deployed',
  'rolled-back',
  'resolved',
  'completed',
];

describe('DevOps operations log lifecycle states', () => {
  it('defines every required state', () => {
    for (const state of REQUIRED_STATES) {
      expect(DEVOPS_LOG_STATES).toContain(state);
    }
  });

  it('keeps every state distinct', () => {
    expect(new Set(DEVOPS_LOG_STATES).size).toBe(DEVOPS_LOG_STATES.length);
    expect(DEVOPS_LOG_STATES).toHaveLength(REQUIRED_STATES.length);
  });

  it('does not collapse the pairs that carry different meaning', () => {
    // Each pair is a distinction the audit trail depends on: an attempt that ran
    // and lost is not one that never started, and shipping is not closing out.
    const pairs = [
      ['proposed', 'approved'],
      ['running', 'blocked'],
      ['failed', 'blocked'],
      ['passed', 'completed'],
      ['deployed', 'completed'],
      ['rolled-back', 'failed'],
      ['resolved', 'completed'],
    ];

    for (const [left, right] of pairs) {
      expect(left).not.toBe(right);
      expect(DEVOPS_LOG_STATES).toContain(left);
      expect(DEVOPS_LOG_STATES).toContain(right);
    }
  });

  it('does not reuse the generic record status enum', () => {
    expect(DEVOPS_LOG_STATES).not.toContain('draft');
    expect(DEVOPS_LOG_STATES).not.toContain('archived');
    expect(DEVOPS_LOG_STATES).not.toContain('superseded');
  });

  it('exposes exactly these states as the log query filter', () => {
    expect(QUERY_SCHEMAS.operationsLog.state.values).toEqual(DEVOPS_LOG_STATES);
  });
});
