'use strict';

const request = require('supertest');

/**
 * Provider dispatcher coverage.
 *
 * This suite never connects to MongoDB. That is deliberate: it proves the
 * GitHub, Vercel, and Heroku dispatchers keep working during a database outage
 * while the database-backed dispatchers correctly report 503.
 *
 * Upstream services are mocked so no real GitHub, Vercel, or Heroku call is
 * made. The Vercel mock keeps the real module's CATALOG, because the unified
 * catalogue derives its Vercel operation list from it.
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

const API_KEY = 'z'.repeat(40);
const ROUTE = '/api/v1/zoro/operations';

const APPROVAL = {
  approvedBy: 'Kofi',
  authority: 'decision-record-42',
  reason: 'Clearing the superseded artefact.',
};

const app = buildTestApp({}, { engineeringEnvSource: { ZORO_ENGINEERING_API_KEY: API_KEY } });

function post(operationId, body) {
  return request(app)
    .post(`${ROUTE}/${operationId}`)
    .set('Authorization', `Bearer ${API_KEY}`)
    .send(body);
}

describe('github.read dispatcher', () => {
  it('lists repositories through the collection envelope', async () => {
    githubService.listRepositories.mockResolvedValue({
      data: [{ fullName: 'kofiarhin/context-api' }],
      meta: { page: 1, perPage: 30, hasNextPage: false },
    });

    const response = await post('github.read', {
      operation: 'listRepositories',
      parameters: { page: 1, perPage: 30 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ fullName: 'kofiarhin/context-api' }]);
    expect(githubService.listRepositories).toHaveBeenCalledWith({ page: 1, perPage: 30 });
  });

  it('reads file contents', async () => {
    githubService.getContent.mockResolvedValue({ path: 'README.md', content: '# Context API' });

    const response = await post('github.read', {
      operation: 'getContent',
      parameters: { owner: 'kofiarhin', repo: 'context-api', path: 'README.md' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.path).toBe('README.md');
  });

  it('lists branches and gets a pull request', async () => {
    githubService.listBranches.mockResolvedValue({ data: [{ name: 'main' }], meta: {} });
    githubService.getPullRequest.mockResolvedValue({ number: 9, state: 'open' });

    await expect(
      post('github.read', {
        operation: 'listBranches',
        parameters: { owner: 'kofiarhin', repo: 'context-api' },
      })
    ).resolves.toMatchObject({ status: 200 });

    const pr = await post('github.read', {
      operation: 'getPullRequest',
      parameters: { owner: 'kofiarhin', repo: 'context-api', pullNumber: 9 },
    });

    expect(pr.body.data.number).toBe(9);
  });

  it('refuses a write operation through the read dispatcher', async () => {
    const response = await post('github.read', {
      operation: 'createFile',
      parameters: { owner: 'kofiarhin', repo: 'context-api' },
    });

    expect(response.status).toBe(400);
    expect(githubService.createFile).not.toHaveBeenCalled();
  });

  it('surfaces an upstream failure without leaking provider credentials', async () => {
    const { GithubUnavailableError } = require('../../src/utils/errors');
    githubService.listRepositories.mockRejectedValue(new GithubUnavailableError());

    const response = await post('github.read', { operation: 'listRepositories' });

    expect(response.status).toBe(502);
    expect(JSON.stringify(response.body)).not.toContain('PRIVATE KEY');
  });
});

describe('github.write dispatcher', () => {
  it('creates a branch and returns 201', async () => {
    githubService.createBranch.mockResolvedValue({ name: 'feat/x', sha: 'abc' });

    const response = await post('github.write', {
      operation: 'createBranch',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        branch: 'feat/x',
        baseRef: 'main',
      },
    });

    expect(response.status).toBe(201);
  });

  it('refuses a branch update without the expected current SHA', async () => {
    const response = await post('github.write', {
      operation: 'updateBranch',
      parameters: { owner: 'kofiarhin', repo: 'context-api', branch: 'main', newSha: 'def' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/expectedCurrentSha is required/);
    expect(githubService.updateBranch).not.toHaveBeenCalled();
  });

  it('updates a branch once the expected current SHA is supplied', async () => {
    githubService.updateBranch.mockResolvedValue({ name: 'main', sha: 'def' });

    const response = await post('github.write', {
      operation: 'updateBranch',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        branch: 'main',
        expectedCurrentSha: 'abc',
        newSha: 'def',
      },
    });

    expect(response.status).toBe(200);
  });

  it('refuses a file update without the expected blob SHA', async () => {
    const response = await post('github.write', {
      operation: 'updateFile',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        branch: 'main',
        path: 'README.md',
        content: 'x',
        message: 'chore: update',
      },
    });

    expect(response.status).toBe(400);
    expect(githubService.updateFile).not.toHaveBeenCalled();
  });

  it('reports a stale SHA as a conflict rather than overwriting', async () => {
    const { GithubConflictError } = require('../../src/utils/errors');
    githubService.updateFile.mockRejectedValue(
      new GithubConflictError('The file has changed since it was read.')
    );

    const response = await post('github.write', {
      operation: 'updateFile',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        branch: 'main',
        path: 'README.md',
        content: 'x',
        message: 'chore: update',
        sha: 'stale',
      },
    });

    expect(response.status).toBe(409);
  });

  it('preserves the GitHub workflow self-protection rule', async () => {
    const { GithubForbiddenError } = require('../../src/utils/errors');
    githubService.createFile.mockRejectedValue(
      new GithubForbiddenError('Writes beneath .github/workflows are refused.')
    );

    const response = await post('github.write', {
      operation: 'createFile',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        branch: 'main',
        path: '.github/workflows/deploy.yml',
        content: 'jobs: {}',
        message: 'ci: add',
      },
    });

    expect(response.status).toBe(403);
  });
});

describe('github.review dispatcher', () => {
  it('refuses a merge without Kofi approval', async () => {
    const response = await post('github.review', {
      operation: 'mergePullRequest',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        pullNumber: 9,
        expectedHeadSha: 'abc',
        mergeMethod: 'squash',
      },
    });

    expect(response.status).toBe(403);
    expect(githubService.mergePullRequest).not.toHaveBeenCalled();
  });

  it('refuses a merge approved by anyone other than Kofi', async () => {
    const response = await post('github.review', {
      operation: 'mergePullRequest',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        pullNumber: 9,
        expectedHeadSha: 'abc',
        mergeMethod: 'squash',
      },
      approval: { ...APPROVAL, approvedBy: 'Zoro' },
    });

    expect(response.status).toBe(403);
    expect(githubService.mergePullRequest).not.toHaveBeenCalled();
  });

  it('refuses an approved merge that omits the expected head SHA', async () => {
    const response = await post('github.review', {
      operation: 'mergePullRequest',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        pullNumber: 9,
        mergeMethod: 'squash',
      },
      approval: APPROVAL,
    });

    expect(response.status).toBe(400);
    expect(githubService.mergePullRequest).not.toHaveBeenCalled();
  });

  it('merges when approval and expected head SHA are both present', async () => {
    githubService.mergePullRequest.mockResolvedValue({ merged: true, sha: 'merged' });

    const response = await post('github.review', {
      operation: 'mergePullRequest',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        pullNumber: 9,
        expectedHeadSha: 'abc',
        mergeMethod: 'squash',
      },
      approval: APPROVAL,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.merged).toBe(true);
    expect(response.body.meta.classification).toBe('merge');
  });

  it('never forwards approval evidence to the provider as a bypass flag', async () => {
    githubService.mergePullRequest.mockResolvedValue({ merged: true });

    await post('github.review', {
      operation: 'mergePullRequest',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        pullNumber: 9,
        expectedHeadSha: 'abc',
        mergeMethod: 'squash',
      },
      approval: APPROVAL,
    });

    const [payload] = githubService.mergePullRequest.mock.calls.at(-1);

    expect(payload).not.toHaveProperty('approval');
    expect(payload).not.toHaveProperty('confirmation');
  });
});

describe('github.destructive dispatcher', () => {
  const parameters = {
    owner: 'kofiarhin',
    repo: 'context-api',
    branch: 'main',
    path: 'src/legacy.js',
    sha: 'abc',
    message: 'chore: remove dead module',
  };

  const confirmation = {
    confirmed: true,
    resourceType: 'file',
    resourceId: 'kofiarhin/context-api:src/legacy.js',
    reason: 'The module is unreferenced dead code.',
  };

  it('refuses a delete with neither approval nor confirmation', async () => {
    const response = await post('github.destructive', { operation: 'deleteFile', parameters });

    expect(response.status).toBe(403);
    expect(githubService.deleteFile).not.toHaveBeenCalled();
  });

  it('refuses a delete with approval but no confirmation', async () => {
    const response = await post('github.destructive', {
      operation: 'deleteFile',
      parameters,
      approval: APPROVAL,
    });

    expect(response.status).toBe(403);
    expect(githubService.deleteFile).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that names a different file', async () => {
    const response = await post('github.destructive', {
      operation: 'deleteFile',
      parameters,
      approval: APPROVAL,
      confirmation: { ...confirmation, resourceId: 'kofiarhin/context-api:src/app.js' },
    });

    expect(response.status).toBe(403);
    expect(githubService.deleteFile).not.toHaveBeenCalled();
  });

  it('deletes when approval, confirmation, and expected SHA all match', async () => {
    githubService.deleteFile.mockResolvedValue({ path: 'src/legacy.js', deleted: true });

    const response = await post('github.destructive', {
      operation: 'deleteFile',
      parameters,
      approval: APPROVAL,
      confirmation,
    });

    expect(response.status).toBe(200);
    expect(response.body.meta.classification).toBe('destructive');
  });
});

describe('vercel dispatchers', () => {
  it('delegates a read to the existing Vercel dispatcher catalogue', async () => {
    vercelDispatcher.dispatch.mockResolvedValue({ result: [{ name: 'site' }], status: 200 });

    const response = await post('vercel.read', {
      operation: 'listProjects',
      parameters: { limit: 10 },
    });

    expect(response.status).toBe(200);
    expect(vercelDispatcher.dispatch).toHaveBeenCalledWith(
      'read',
      expect.objectContaining({ operation: 'listProjects', parameters: { limit: 10 } })
    );
  });

  it('delegates a write and preserves the created status', async () => {
    vercelDispatcher.dispatch.mockResolvedValue({ result: { id: 'prj_1' }, status: 201 });

    const response = await post('vercel.write', {
      operation: 'createProject',
      parameters: { name: 'site' },
    });

    expect(response.status).toBe(201);
  });

  it('treats a production rollback as production-sensitive', async () => {
    const response = await post('vercel.write', {
      operation: 'rollbackProject',
      parameters: { project: 'site' },
    });

    expect(response.status).toBe(403);
    expect(response.body.meta).toBeDefined();
  });

  it('allows a production rollback once Kofi approves', async () => {
    vercelDispatcher.dispatch.mockResolvedValue({ result: { rolledBack: true }, status: 200 });

    const response = await post('vercel.write', {
      operation: 'rollbackProject',
      parameters: { project: 'site' },
      approval: APPROVAL,
    });

    expect(response.status).toBe(200);
    expect(response.body.meta.classification).toBe('production-sensitive');
  });

  it('refuses a destructive delete without approval and exact confirmation', async () => {
    const response = await post('vercel.destructive', {
      operation: 'deleteProject',
      parameters: { project: 'site' },
    });

    expect(response.status).toBe(403);
    expect(vercelDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('deletes once approval and exact confirmation are supplied', async () => {
    vercelDispatcher.dispatch.mockResolvedValue({ result: { deleted: true }, status: 200 });

    const response = await post('vercel.destructive', {
      operation: 'deleteProject',
      parameters: { project: 'site' },
      approval: APPROVAL,
      confirmation: {
        confirmed: true,
        resourceType: 'vercel-resource',
        resourceId: 'site',
        reason: 'The preview project is retired.',
      },
    });

    expect(response.status).toBe(200);
  });

  it('forwards approval and confirmation so the Vercel policy still applies', async () => {
    vercelDispatcher.dispatch.mockResolvedValue({ result: {}, status: 200 });

    await post('vercel.destructive', {
      operation: 'deleteProject',
      parameters: { project: 'site' },
      approval: APPROVAL,
      confirmation: {
        confirmed: true,
        resourceType: 'vercel-resource',
        resourceId: 'site',
        reason: 'The preview project is retired.',
      },
    });

    const [, payload] = vercelDispatcher.dispatch.mock.calls.at(-1);

    expect(payload.approval).toEqual(APPROVAL);
    expect(payload.confirmation).toBeDefined();
  });

  it('refuses an operation outside the Vercel catalogue', async () => {
    const response = await post('vercel.read', { operation: 'deleteProject' });

    expect(response.status).toBe(400);
    expect(vercelDispatcher.dispatch).not.toHaveBeenCalled();
  });
});

describe('heroku.execute dispatcher', () => {
  it('executes a read operation through the existing descriptor', async () => {
    herokuService.execute.mockResolvedValue({
      data: [{ name: 'context-api' }],
      status: 200,
      meta: {},
    });

    const response = await post('heroku.execute', { operation: 'listHerokuApps' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ name: 'context-api' }]);

    const [descriptor] = herokuService.execute.mock.calls.at(-1);

    expect(descriptor.operationId).toBe('listHerokuApps');
  });

  it('passes params, query, and body through to the Heroku service', async () => {
    herokuService.execute.mockResolvedValue({ data: {}, status: 200 });

    await post('heroku.execute', {
      operation: 'updateHerokuFormation',
      parameters: {
        params: { app: 'context-api', type: 'web' },
        query: { range: 'id' },
        body: { quantity: 2 },
      },
      approval: APPROVAL,
    });

    const [, input] = herokuService.execute.mock.calls.at(-1);

    expect(input).toMatchObject({
      app: 'context-api',
      type: 'web',
      body: { quantity: 2 },
      query: { range: 'id' },
      approval: APPROVAL,
    });
  });

  it('refuses a production-sensitive Heroku operation without approval', async () => {
    const response = await post('heroku.execute', {
      operation: 'updateHerokuFormation',
      parameters: { params: { app: 'context-api', type: 'web' }, body: { quantity: 2 } },
    });

    expect(response.status).toBe(403);
    expect(herokuService.execute).not.toHaveBeenCalled();
  });

  it('refuses an operation outside the Heroku route allowlist', async () => {
    const response = await post('heroku.execute', { operation: 'dropHerokuDatabase' });

    expect(response.status).toBe(400);
    expect(herokuService.execute).not.toHaveBeenCalled();
  });

  it('preserves the Heroku self-protection rules', async () => {
    const { AppError } = require('../../src/utils/errors');
    herokuService.execute.mockRejectedValue(
      new AppError(
        'HEROKU_RESOURCE_FORBIDDEN',
        'A required Context API configuration value cannot be removed.',
        403
      )
    );

    const response = await post('heroku.execute', {
      operation: 'deleteHerokuConfigVar',
      parameters: { params: { app: 'context-api', key: 'ZORO_ENGINEERING_API_KEY' } },
      approval: APPROVAL,
      confirmation: {
        confirmed: true,
        resourceType: 'heroku-resource',
        resourceId: 'context-api',
        reason: 'Attempting to remove the gateway key.',
      },
    });

    expect(response.status).toBe(403);
  });
});

describe('database independence', () => {
  it('serves provider dispatchers while MongoDB is unavailable', async () => {
    githubService.listRepositories.mockResolvedValue({ data: [], meta: {} });

    const response = await post('github.read', { operation: 'listRepositories' });

    expect(response.status).toBe(200);
    expect(response.body.error).toBeUndefined();
  });

  it('reports 503 for database-backed dispatchers while MongoDB is unavailable', async () => {
    for (const operationId of ['engineering.read', 'opslog.read', 'context.resolve']) {
      const response = await post(operationId, {
        operation:
          operationId === 'engineering.read'
            ? 'listProjects'
            : operationId === 'opslog.read'
              ? 'listOperationsLog'
              : 'resolve',
        parameters: operationId === 'context.resolve' ? { client: 'claude-code' } : {},
      });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    }
  });

  it('still authenticates before reporting a database outage', async () => {
    const response = await request(app)
      .post(`${ROUTE}/engineering.read`)
      .send({ operation: 'listProjects' });

    expect(response.status).toBe(401);
  });
});
