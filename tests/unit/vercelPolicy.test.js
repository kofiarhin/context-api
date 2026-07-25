'use strict';

const {
  assertPreviewBranchAllowed,
  assertPreviewBranchNamed,
  assertPreviewDeploymentResult,
  createPolicy,
  deploymentBranches,
  normalizeDeploymentTarget,
  requireProductionApproval,
} = require('../../src/services/vercelPolicy');
const {
  ValidationError,
  VercelConflictError,
  VercelForbiddenError,
} = require('../../src/utils/errors');

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

  it('defaults an absent deployment target to preview', () => {
    expect(normalizeDeploymentTarget(undefined)).toBe('preview');
    expect(normalizeDeploymentTarget(null)).toBe('preview');
    expect(normalizeDeploymentTarget('')).toBe('preview');
    expect(normalizeDeploymentTarget(' Preview ')).toBe('preview');
    expect(normalizeDeploymentTarget('PRODUCTION')).toBe('production');
  });

  it('rejects any deployment target outside the gateway vocabulary', () => {
    expect(() => normalizeDeploymentTarget('staging')).toThrow(ValidationError);
    expect(() => normalizeDeploymentTarget(['preview'])).toThrow(ValidationError);
    expect(() => normalizeDeploymentTarget(true)).toThrow(ValidationError);
  });

  it('reads every branch a deployment body can name', () => {
    expect(
      deploymentBranches({
        gitSource: { ref: 'refs/heads/feature/menu' },
        meta: { githubCommitRef: 'feature/menu' },
        gitMetadata: { commitRef: 'other' },
      })
    ).toEqual(['feature/menu', 'other']);

    expect(deploymentBranches({})).toEqual([]);
    expect(deploymentBranches({ gitSource: { ref: '  ' } })).toEqual([]);
  });

  it('requires a Git-connected Preview deployment to name its branch', () => {
    expect(() => assertPreviewBranchNamed({ gitSource: { type: 'github', repo: 'shop' } }, [])).toThrow(
      ValidationError
    );
    expect(() => assertPreviewBranchNamed({ gitMetadata: { commitSha: 'abc123' } }, [])).toThrow(
      ValidationError
    );
  });

  it('requires no branch from a deployment that names no Git source', () => {
    // File uploads and redeploys of an existing deployment have no branch to name.
    expect(() => assertPreviewBranchNamed({ files: [] }, [])).not.toThrow();
    expect(() => assertPreviewBranchNamed({ deploymentId: 'dpl_1' }, [])).not.toThrow();
    expect(() =>
      assertPreviewBranchNamed({ gitSource: { ref: 'feature/menu' } }, ['feature/menu'])
    ).not.toThrow();
  });

  it('refuses a Preview deployment on the production branch', () => {
    expect(() => assertPreviewBranchAllowed(['main'], 'main')).toThrow(VercelForbiddenError);
    expect(() => assertPreviewBranchAllowed(['MAIN'], 'refs/heads/main')).toThrow(
      VercelForbiddenError
    );
    expect(() => assertPreviewBranchAllowed(['feature/menu'], 'main')).not.toThrow();
  });

  it('cannot refuse a branch when the production branch is unknown', () => {
    expect(() => assertPreviewBranchAllowed(['main'], null)).not.toThrow();
    expect(() => assertPreviewBranchAllowed(['main'], '')).not.toThrow();
  });

  it('exposes the configured production branch to the service', () => {
    expect(policy.configuredProductionBranch()).toBeNull();
    expect(
      createPolicy(
        {},
        { source: { ...source, VERCEL_PRODUCTION_BRANCH: ' refs/heads/main ' } }
      ).configuredProductionBranch()
    ).toBe('main');
  });

  it('rejects an upstream deployment that came back as Production', () => {
    expect(() => assertPreviewDeploymentResult({ uid: 'dpl_1', target: 'production' })).toThrow(
      VercelConflictError
    );
    expect(() => assertPreviewDeploymentResult({ uid: 'dpl_1', production: true })).toThrow(
      VercelConflictError
    );
  });

  it('accepts an upstream deployment that is not Production', () => {
    expect(() => assertPreviewDeploymentResult({ uid: 'dpl_1', target: null })).not.toThrow();
    expect(() => assertPreviewDeploymentResult({ uid: 'dpl_1', target: 'staging' })).not.toThrow();
    expect(() => assertPreviewDeploymentResult({})).not.toThrow();
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
