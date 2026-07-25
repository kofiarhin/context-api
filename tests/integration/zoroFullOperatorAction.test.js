'use strict';

const request = require('supertest');

/**
 * Full Operator mode across the unified Action.
 *
 * Full Operator mode is the default, so these cases exercise the shipped
 * behaviour: privileged work proceeds on the bearer key alone, while the guards
 * the mode does not touch still refuse. Restricted-mode counterparts live in
 * tests/integration/zoroProviderDispatchers.test.js.
 *
 * Upstream services are mocked, so no real GitHub, Vercel, or Heroku call is
 * made. The Vercel mock keeps the real CATALOG because the unified catalogue
 * derives its Vercel operation list from it.
 */
jest.mock('../../src/services/github.service');
jest.mock('../../src/services/heroku/heroku.service');
jest.mock('../../src/services/vercelDispatcher', () => {
  const actual = jest.requireActual('../../src/services/vercelDispatcher');

  return { ...actual, dispatch: jest.fn() };
});

const githubService = require('../../src/services/github.service');
const herokuService = require('../../src/services/heroku/heroku.service');
const vercelDispatcher = require('../../src/services/vercelDispatcher');
const { buildTestApp } = require('../helpers/testApp');
const { getDispatcher, getOperation } = require('../../src/services/zoro/zoroCatalogue');
const { AppError } = require('../../src/utils/errors');

const API_KEY = 'z'.repeat(40);
const ROUTE = '/api/v1/zoro/operations';

const app = buildTestApp({}, { engineeringEnvSource: { ZORO_ENGINEERING_API_KEY: API_KEY } });

function post(operationId, body) {
  return request(app)
    .post(`${ROUTE}/${operationId}`)
    .set('Authorization', `Bearer ${API_KEY}`)
    .send(body);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createRepository is discoverable through the closed catalogue', () => {
  it('is registered on the github.write dispatcher', () => {
    const operation = getOperation(getDispatcher('github.write'), 'createRepository');

    expect(operation).toMatchObject({
      target: 'github',
      method: 'createRepository',
      status: 201,
      classification: 'security-sensitive',
    });
  });

  it('creates a repository without per-request approval in Full Operator mode', async () => {
    githubService.createRepository.mockResolvedValue({
      owner: 'kofiarhin',
      name: 'zoro-smoke',
      fullName: 'kofiarhin/zoro-smoke',
      private: true,
      defaultBranch: 'main',
      installationAccessible: true,
    });

    const response = await post('github.write', {
      operation: 'createRepository',
      parameters: { owner: 'kofiarhin', name: 'zoro-smoke', visibility: 'private' },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.defaultBranch).toBe('main');
    expect(response.body.meta).toMatchObject({
      operationId: 'github.write',
      operation: 'createRepository',
      classification: 'security-sensitive',
    });
    expect(githubService.createRepository).toHaveBeenCalledWith({
      owner: 'kofiarhin',
      name: 'zoro-smoke',
      visibility: 'private',
    });
  });

  it('merges a pull request without per-request approval in Full Operator mode', async () => {
    githubService.mergePullRequest.mockResolvedValue({ merged: true, sha: 'abc123' });

    const response = await post('github.review', {
      operation: 'mergePullRequest',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        pullNumber: 9,
        expectedHeadSha: 'abc123',
        mergeMethod: 'squash',
      },
    });

    expect(response.status).toBe(200);
    expect(githubService.mergePullRequest).toHaveBeenCalled();
  });
});

describe('provider work in Full Operator mode', () => {
  it('runs a production-sensitive Vercel rollback without approval', async () => {
    vercelDispatcher.dispatch.mockResolvedValue({ result: { rolledBack: true }, status: 200 });

    const response = await post('vercel.write', {
      operation: 'rollbackProject',
      parameters: { project: 'site' },
    });

    expect(response.status).toBe(200);
    expect(vercelDispatcher.dispatch).toHaveBeenCalled();
  });

  it('creates a Heroku app without approval, delegating provider switches downstream', async () => {
    herokuService.execute.mockResolvedValue({ result: { name: 'zoro-smoke-app' }, status: 201 });

    const response = await post('heroku.execute', {
      operation: 'createHerokuApp',
      parameters: { body: { name: 'zoro-smoke-app', region: 'us' } },
    });

    expect(response.status).toBe(201);
    expect(herokuService.execute).toHaveBeenCalled();
  });

  it('surfaces a provider refusal rather than overriding it', async () => {
    // Provider policy is enforced inside the delegated service. Full Operator
    // mode stands down dispatcher approval only, so a disabled provider switch
    // must still refuse.
    herokuService.execute.mockRejectedValue(
      new AppError(
        'HEROKU_RESOURCE_FORBIDDEN',
        'Billing-sensitive Heroku operations are disabled.',
        403
      )
    );

    const response = await post('heroku.execute', {
      operation: 'createHerokuApp',
      parameters: { body: { name: 'zoro-smoke-app' } },
    });

    expect(response.status).toBe(403);
  });
});

describe('guards Full Operator mode does not relax', () => {
  it('still refuses a merge that omits the expected head SHA', async () => {
    const response = await post('github.review', {
      operation: 'mergePullRequest',
      parameters: { owner: 'kofiarhin', repo: 'context-api', pullNumber: 9 },
    });

    expect(response.status).toBe(400);
    expect(githubService.mergePullRequest).not.toHaveBeenCalled();
  });

  it('still refuses a destructive delete without approval and confirmation', async () => {
    const response = await post('github.destructive', {
      operation: 'deleteFile',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        branch: 'main',
        path: 'stale.txt',
        sha: 'abc123',
      },
    });

    expect(response.status).toBe(403);
    expect(githubService.deleteFile).not.toHaveBeenCalled();
  });
});

describe('the dispatcher remains a closed catalogue, not a proxy', () => {
  it('rejects an unknown operation on a known dispatcher', async () => {
    const response = await post('github.write', { operation: 'deleteRepository' });

    expect(response.status).toBe(400);
    expect(githubService.createRepository).not.toHaveBeenCalled();
  });

  it('rejects an unknown dispatcher id', async () => {
    const response = await post('github.admin', { operation: 'createRepository' });

    expect(response.status).toBe(404);
  });

  it.each([
    ['method', { operation: 'createRepository', method: 'DELETE' }],
    ['path', { operation: 'createRepository', path: '/repos/kofiarhin/context-api' }],
    ['url', { operation: 'createRepository', url: 'https://api.github.com/user/repos' }],
    ['headers', { operation: 'createRepository', headers: { Authorization: 'Bearer smuggled' } }],
    ['body', { operation: 'createRepository', body: { name: 'smuggled' } }],
  ])('rejects a smuggled %s field on the closed envelope', async (_label, body) => {
    const response = await post('github.write', body);

    expect(response.status).toBe(400);
    expect(githubService.createRepository).not.toHaveBeenCalled();
  });

  it('does not accept repository creation on any other dispatcher', async () => {
    for (const dispatcherId of ['github.read', 'github.review', 'github.destructive']) {
      const response = await post(dispatcherId, {
        operation: 'createRepository',
        parameters: { owner: 'kofiarhin', name: 'zoro-smoke' },
      });

      expect(response.status).toBe(400);
    }

    expect(githubService.createRepository).not.toHaveBeenCalled();
  });
});
