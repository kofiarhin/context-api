'use strict';

const { createService } = require('../../src/services/vercel.service');
const { createDispatcher } = require('../../src/services/vercelDispatcher');
const { createPolicy } = require('../../src/services/vercelPolicy');
const {
  ValidationError,
  VercelConflictError,
  VercelForbiddenError,
} = require('../../src/utils/errors');

// Fabricated gateway configuration. Never put a real Vercel token here.
const SOURCE = {
  VERCEL_TOKEN: 'vercel-token-for-tests',
  ZORO_VERCEL_API_KEY: 'zoro-vercel-test-key-that-is-at-least-32-characters',
  VERCEL_TEAM_ID: 'team_test',
};

const APPROVAL = {
  confirmed: true,
  scope: 'production',
  reason: 'Kofi approved this production deployment.',
};

/**
 * A client whose responses are keyed by `METHOD /path`. An unexpected upstream
 * call rejects rather than returning a benign default, so a test that claims no
 * deployment was created is actually proving it.
 */
function createClient(handlers = {}) {
  return {
    request: jest.fn((method, path, options = {}) => {
      const key = `${method} ${path}`;
      if (!Object.prototype.hasOwnProperty.call(handlers, key)) {
        return Promise.reject(new Error(`unexpected upstream call ${key}`));
      }

      const handler = handlers[key];
      return Promise.resolve(typeof handler === 'function' ? handler(options) : handler);
    }),
  };
}

function createSubject({ handlers, source = SOURCE } = {}) {
  const client = createClient(handlers);
  const service = createService({ client, env: {}, policy: createPolicy({}, { source }) });
  return { client, service };
}

function upstreamBody(client) {
  const call = client.request.mock.calls.find(
    ([method, path]) => method === 'POST' && path === '/v13/deployments'
  );
  return call ? call[2].body : null;
}

const PREVIEW_RESULT = {
  uid: 'dpl_preview_1',
  name: 'coffee-shop',
  url: 'coffee-shop-git-feature.vercel.app',
  projectId: 'prj_123',
  readyState: 'QUEUED',
  target: null,
};

describe('Vercel deployment creation target handling', () => {
  it('never forwards the literal preview target that Vercel rejects', async () => {
    const { client, service } = createSubject({
      handlers: { 'POST /v13/deployments': PREVIEW_RESULT },
    });

    const result = await service.createDeployment({ project: 'coffee-shop', name: 'coffee-shop' });

    expect(upstreamBody(client)).toEqual({ project: 'coffee-shop', name: 'coffee-shop' });
    expect(Object.keys(upstreamBody(client))).not.toContain('target');
    expect(result.target).toBe('preview');
  });

  it('omits the target even when Preview is requested explicitly', async () => {
    const { client, service } = createSubject({
      handlers: { 'POST /v13/deployments': PREVIEW_RESULT },
    });

    await service.createDeployment({ project: 'coffee-shop', target: 'preview' });

    expect(upstreamBody(client)).toEqual({ project: 'coffee-shop' });
  });

  it('strips the gateway approval envelope from the upstream body', async () => {
    const { client, service } = createSubject({
      handlers: { 'POST /v13/deployments': { ...PREVIEW_RESULT, target: 'production' } },
    });

    await service.createDeployment({
      project: 'coffee-shop',
      target: 'production',
      approval: APPROVAL,
    });

    expect(upstreamBody(client)).toEqual({ project: 'coffee-shop', target: 'production' });
  });

  it('rejects an unsupported target without calling Vercel', async () => {
    const { client, service } = createSubject({ handlers: {} });

    await expect(
      service.createDeployment({ project: 'coffee-shop', target: 'staging' })
    ).rejects.toThrow(ValidationError);
    expect(client.request).not.toHaveBeenCalled();
  });

  it('still requires explicit production approval for a Production target', async () => {
    // Restricted mode pinned explicitly: Full Operator mode defaults to enabled
    // and stands this approval down, which is asserted separately in
    // tests/unit/zoroFullOperator.test.js.
    const { client, service } = createSubject({
      handlers: {},
      source: { ...SOURCE, ZORO_FULL_OPERATOR_MODE: 'false' },
    });

    await expect(
      service.createDeployment({ project: 'coffee-shop', target: 'production' })
    ).rejects.toThrow(VercelForbiddenError);
    expect(client.request).not.toHaveBeenCalled();
  });
});

describe('Preview deployments and the production branch', () => {
  it('refuses a Preview deployment on the configured production branch', async () => {
    const { client, service } = createSubject({
      handlers: {},
      source: { ...SOURCE, VERCEL_PRODUCTION_BRANCH: 'main' },
    });

    await expect(
      service.createDeployment({
        project: 'coffee-shop',
        gitSource: { type: 'github', repo: 'coffee-shop', org: 'kofiarhin', ref: 'main' },
      })
    ).rejects.toThrow(/production branch/i);
    expect(client.request).not.toHaveBeenCalled();
  });

  it("refuses a Preview deployment on the project's linked production branch", async () => {
    const { client, service } = createSubject({
      handlers: {
        'GET /v9/projects/coffee-shop': { id: 'prj_123', link: { productionBranch: 'release' } },
      },
    });

    await expect(
      service.createDeployment({
        project: 'coffee-shop',
        gitSource: { type: 'github', repoId: 12345, ref: 'refs/heads/release' },
      })
    ).rejects.toThrow(VercelForbiddenError);
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(upstreamBody(client)).toBeNull();
  });

  it('refuses the production branch named through commit metadata, whatever its casing', async () => {
    const { client, service } = createSubject({
      handlers: {},
      source: { ...SOURCE, VERCEL_PRODUCTION_BRANCH: 'main' },
    });

    await expect(
      service.createDeployment({ project: 'coffee-shop', meta: { githubCommitRef: 'Main' } })
    ).rejects.toThrow(VercelForbiddenError);
    expect(client.request).not.toHaveBeenCalled();
  });

  it('allows a Preview deployment from a feature branch', async () => {
    const { client, service } = createSubject({
      handlers: {
        'GET /v9/projects/coffee-shop': { id: 'prj_123', link: { productionBranch: 'main' } },
        'POST /v13/deployments': PREVIEW_RESULT,
      },
    });

    const result = await service.createDeployment({
      project: 'coffee-shop',
      gitSource: { type: 'github', repo: 'coffee-shop', org: 'kofiarhin', ref: 'feature/menu' },
    });

    expect(result.id).toBe('dpl_preview_1');
    expect(upstreamBody(client)).toEqual({
      project: 'coffee-shop',
      gitSource: { type: 'github', repo: 'coffee-shop', org: 'kofiarhin', ref: 'feature/menu' },
    });
  });

  it('skips the project lookup when the configured branch already answers the question', async () => {
    const { client, service } = createSubject({
      handlers: { 'POST /v13/deployments': PREVIEW_RESULT },
      source: { ...SOURCE, VERCEL_PRODUCTION_BRANCH: 'main' },
    });

    await service.createDeployment({
      project: 'coffee-shop',
      gitSource: { type: 'github', repo: 'coffee-shop', org: 'kofiarhin', ref: 'feature/menu' },
    });

    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('performs no project lookup when the request names no branch', async () => {
    const { client, service } = createSubject({
      handlers: { 'POST /v13/deployments': PREVIEW_RESULT },
    });

    await service.createDeployment({ project: 'coffee-shop', deploymentId: 'dpl_previous' });

    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith('POST', '/v13/deployments', {
      body: { project: 'coffee-shop', deploymentId: 'dpl_previous' },
    });
  });

  it('refuses a Git-connected Preview deployment that names no branch', async () => {
    // Vercel would pick the production branch for us, which is the failure this
    // fix exists to prevent.
    const { client, service } = createSubject({ handlers: {} });

    await expect(
      service.createDeployment({
        project: 'coffee-shop',
        gitSource: { type: 'github', repo: 'coffee-shop', org: 'kofiarhin' },
      })
    ).rejects.toThrow(ValidationError);
    expect(client.request).not.toHaveBeenCalled();
  });

  it('still accepts a Production deployment that names no branch', async () => {
    const { client, service } = createSubject({
      handlers: { 'POST /v13/deployments': { uid: 'dpl_prod', target: 'production' } },
    });

    await service.createDeployment({
      project: 'coffee-shop',
      target: 'production',
      approval: APPROVAL,
      gitSource: { type: 'github', repo: 'coffee-shop', org: 'kofiarhin' },
    });

    expect(upstreamBody(client).target).toBe('production');
  });

  it('leaves a Production deployment of the production branch available with approval', async () => {
    const { client, service } = createSubject({
      handlers: { 'POST /v13/deployments': { ...PREVIEW_RESULT, target: 'production' } },
      source: { ...SOURCE, VERCEL_PRODUCTION_BRANCH: 'main' },
    });

    const result = await service.createDeployment({
      project: 'coffee-shop',
      target: 'production',
      approval: APPROVAL,
      gitSource: { type: 'github', repo: 'coffee-shop', org: 'kofiarhin', ref: 'main' },
    });

    expect(result.target).toBe('production');
    expect(upstreamBody(client).target).toBe('production');
  });
});

describe('Deployment creation through the dispatcher', () => {
  // The unified Zoro action derives its Vercel surface from `vercelDispatcher.CATALOG`
  // and delegates in-process to this same service, so proving the guards hold here
  // proves they hold for `POST /api/v1/zoro/operations/vercel.write` too.
  const dispatchWrite = (parameters, subject) =>
    createDispatcher({ vercelService: subject.service }).dispatch('write', {
      operation: 'createDeployment',
      parameters,
    });

  it('translates a Preview target requested through the dispatcher', async () => {
    const subject = createSubject({ handlers: { 'POST /v13/deployments': PREVIEW_RESULT } });

    const { result, status } = await dispatchWrite(
      { project: 'coffee-shop', target: 'preview' },
      subject
    );

    expect(status).toBe(201);
    expect(result.target).toBe('preview');
    expect(upstreamBody(subject.client)).toEqual({ project: 'coffee-shop' });
  });

  it('applies the production-branch guard to a dispatched Preview request', async () => {
    const subject = createSubject({
      handlers: {},
      source: { ...SOURCE, VERCEL_PRODUCTION_BRANCH: 'main' },
    });

    await expect(
      dispatchWrite(
        { project: 'coffee-shop', target: 'preview', gitSource: { type: 'github', ref: 'main' } },
        subject
      )
    ).rejects.toThrow(VercelForbiddenError);
    expect(subject.client.request).not.toHaveBeenCalled();
  });

  it('still requires production approval on a dispatched Production request', async () => {
    const subject = createSubject({
      handlers: {},
      source: { ...SOURCE, ZORO_FULL_OPERATOR_MODE: 'false' },
    });

    await expect(
      dispatchWrite({ project: 'coffee-shop', target: 'production' }, subject)
    ).rejects.toThrow(VercelForbiddenError);
    expect(subject.client.request).not.toHaveBeenCalled();
  });
});

describe('Preview deployment result verification', () => {
  it('rejects a Production deployment returned for a Preview request', async () => {
    const { service } = createSubject({
      handlers: {
        'POST /v13/deployments': { uid: 'dpl_oops', target: 'production', url: 'shop.vercel.app' },
      },
    });

    await expect(service.createDeployment({ project: 'coffee-shop' })).rejects.toThrow(
      VercelConflictError
    );
  });

  it('names the unapproved deployment so it can be cancelled', async () => {
    const { service } = createSubject({
      handlers: {
        'POST /v13/deployments': { uid: 'dpl_oops', target: 'PRODUCTION' },
      },
    });

    await expect(service.createDeployment({ project: 'coffee-shop' })).rejects.toMatchObject({
      code: 'VERCEL_CONFLICT',
      details: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('dpl_oops') }),
      ]),
    });
  });

  it('rejects a deployment flagged as production without a target field', async () => {
    const { service } = createSubject({
      handlers: { 'POST /v13/deployments': { uid: 'dpl_oops', production: true } },
    });

    await expect(service.createDeployment({ project: 'coffee-shop' })).rejects.toThrow(
      VercelConflictError
    );
  });

  it('accepts a Production result for an approved Production request', async () => {
    const { service } = createSubject({
      handlers: { 'POST /v13/deployments': { uid: 'dpl_prod', target: 'production' } },
    });

    await expect(
      service.createDeployment({ project: 'coffee-shop', target: 'production', approval: APPROVAL })
    ).resolves.toMatchObject({ id: 'dpl_prod', target: 'production' });
  });
});
