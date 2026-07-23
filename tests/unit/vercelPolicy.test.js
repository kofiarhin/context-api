'use strict';

const { createPolicy, requireProductionApproval } = require('../../src/services/vercelPolicy');
const { VercelForbiddenError } = require('../../src/utils/errors');

const source = {
  VERCEL_TOKEN: 'vercel-token-for-tests',
  ZORO_VERCEL_API_KEY: 'zoro-vercel-test-key-that-is-at-least-32-characters',
  VERCEL_TEAM_ID: 'team_test',
  VERCEL_PROJECT_ALLOWLIST: 'allowed-project,prj_123',
  VERCEL_DOMAIN_ALLOWLIST: 'example.com',
  VERCEL_REPOSITORY_ALLOWLIST: 'kofiarhin/context-api',
  VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS: 'true',
};

describe('Vercel gateway policy', () => {
  const policy = createPolicy({}, { source });

  it('enforces configured resource allowlists', () => {
    expect(() => policy.assertProjectAllowed('allowed-project')).not.toThrow();
    expect(() => policy.assertDomainAllowed('example.com')).not.toThrow();
    expect(() => policy.assertRepositoryAllowed('kofiarhin/context-api')).not.toThrow();
    expect(() => policy.assertProjectAllowed('other-project')).toThrow(VercelForbiddenError);
  });

  it('requires explicit production approval', () => {
    expect(() => requireProductionApproval(undefined, 'project')).toThrow(VercelForbiddenError);
    expect(() =>
      requireProductionApproval(
        { confirmed: true, scope: 'production', reason: 'User approved production promotion.' },
        'project'
      )
    ).not.toThrow();
  });

  it('requires an exact destructive confirmation', () => {
    expect(() =>
      policy.requireDestructiveConfirmation(
        {
          confirmed: true,
          resourceType: 'project',
          resourceId: 'prj_123',
          expectedName: 'allowed-project',
          reason: 'User explicitly approved project deletion.',
        },
        { resourceType: 'project', resourceId: 'prj_123', expectedName: 'allowed-project' }
      )
    ).not.toThrow();

    expect(() =>
      policy.requireDestructiveConfirmation(
        {
          confirmed: true,
          resourceType: 'project',
          resourceId: 'wrong',
          reason: 'User explicitly approved project deletion.',
        },
        { resourceType: 'project', resourceId: 'prj_123' }
      )
    ).toThrow(VercelForbiddenError);
  });

  it('never permits destructive operations when disabled', () => {
    const disabled = createPolicy({}, { source: { ...source, VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS: 'false' } });
    expect(() =>
      disabled.requireDestructiveConfirmation(
        {
          confirmed: true,
          resourceType: 'project',
          resourceId: 'prj_123',
          reason: 'User explicitly approved project deletion.',
        },
        { resourceType: 'project', resourceId: 'prj_123' }
      )
    ).toThrow('Destructive Vercel operations are disabled.');
  });
});
