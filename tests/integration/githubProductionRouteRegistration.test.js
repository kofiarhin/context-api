'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { githubEnvOverrides, authHeader, SHA_A, SHA_B } = require('../helpers/githubFixtures');

jest.mock('../../src/services/github.service');

const githubService = require('../../src/services/github.service');

/**
 * Production-mode registration coverage for the GitHub gateway.
 *
 * A previous release shipped an environment-dependent guard that silently
 * disabled writes in production. These tests build the app with a production
 * environment so a comparable regression fails here rather than after a deploy.
 */
const app = buildTestApp(
  githubEnvOverrides({ nodeEnv: 'production', isProduction: true, isTest: false })
);

const TARGET = { owner: 'kofiarhin', repo: 'context-api' };

beforeEach(() => {
  githubService.listRepositories.mockResolvedValue({
    data: [],
    meta: { page: 1, perPage: 30, hasNextPage: false },
  });
  githubService.getContent.mockResolvedValue({ type: 'directory', entries: [] });
  githubService.listBranches.mockResolvedValue({
    data: { ...TARGET, defaultBranch: 'main', branches: [] },
    meta: { page: 1, perPage: 30, hasNextPage: false },
  });
  githubService.createBranch.mockResolvedValue({ branch: 'feature/x', sha: SHA_A });
  githubService.updateBranch.mockResolvedValue({ branch: 'main', sha: SHA_B });
  githubService.createFile.mockResolvedValue({ path: 'docs/a.md', commitSha: SHA_B });
  githubService.updateFile.mockResolvedValue({ path: 'docs/a.md', commitSha: SHA_B });
  githubService.deleteFile.mockResolvedValue({ path: 'docs/a.md', deleted: true });
  githubService.createPullRequest.mockResolvedValue({ number: 42 });
  githubService.getPullRequest.mockResolvedValue({ number: 42 });
  githubService.updatePullRequest.mockResolvedValue({ number: 42 });
  githubService.mergePullRequest.mockResolvedValue({ number: 42, merged: true });
});

const fileBody = { ...TARGET, branch: 'main', path: 'docs/a.md', message: 'docs: change' };

const OPERATIONS = [
  ['listGithubRepositories', 'get', '/api/v1/github/repositories', null, 200],
  [
    'getGithubContent',
    'get',
    '/api/v1/github/contents?owner=kofiarhin&repo=context-api&path=src',
    null,
    200,
  ],
  [
    'listGithubBranches',
    'get',
    '/api/v1/github/branches?owner=kofiarhin&repo=context-api',
    null,
    200,
  ],
  [
    'createGithubBranch',
    'post',
    '/api/v1/github/branches',
    { ...TARGET, branch: 'feature/x' },
    201,
  ],
  [
    'updateGithubBranch',
    'patch',
    '/api/v1/github/branches/main',
    { ...TARGET, expectedCurrentSha: SHA_A, newSha: SHA_B },
    200,
  ],
  ['createGithubFile', 'post', '/api/v1/github/files', { ...fileBody, content: 'x' }, 201],
  [
    'updateGithubFile',
    'patch',
    '/api/v1/github/files',
    { ...fileBody, sha: SHA_A, content: 'x' },
    200,
  ],
  ['deleteGithubFile', 'delete', '/api/v1/github/files', { ...fileBody, sha: SHA_A }, 200],
  [
    'createGithubPullRequest',
    'post',
    '/api/v1/github/pull-requests',
    { ...TARGET, title: 'T', head: 'feature/x', base: 'main' },
    201,
  ],
  [
    'getGithubPullRequest',
    'get',
    '/api/v1/github/pull-requests/42?owner=kofiarhin&repo=context-api',
    null,
    200,
  ],
  [
    'updateGithubPullRequest',
    'patch',
    '/api/v1/github/pull-requests/42',
    { ...TARGET, title: 'New' },
    200,
  ],
  [
    'mergeGithubPullRequest',
    'post',
    '/api/v1/github/pull-requests/42/merge',
    { ...TARGET, expectedHeadSha: SHA_B, mergeMethod: 'squash' },
    200,
  ],
];

describe('production-mode GitHub route registration', () => {
  it('is built with a production environment', () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  it('registers all twelve specified operations', () => {
    expect(OPERATIONS).toHaveLength(12);
  });

  it.each(OPERATIONS)('exposes %s in production', async (name, method, path, body, expected) => {
    const pending = request(app)[method](path).set('Authorization', authHeader());
    const response = body === null ? await pending : await pending.send(body);

    expect(response.status).toBe(expected);
  });

  it.each(OPERATIONS)(
    'requires authentication for %s in production',
    async (name, method, path, body) => {
      const pending = request(app)[method](path);
      const response = body === null ? await pending : await pending.send(body);

      expect(response.status).toBe(401);
    }
  );

  it('still rejects PUT with 405 and the full Allow header', async () => {
    const response = await request(app)
      .put('/api/v1/github/files')
      .set('Authorization', authHeader());

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET, HEAD, OPTIONS, POST, PATCH, DELETE');
  });

  it('keeps workflow paths blocked in production', async () => {
    const response = await request(app)
      .post('/api/v1/github/files')
      .set('Authorization', authHeader())
      .send({ ...fileBody, path: '.github/workflows/ci.yml', content: 'x' });

    expect(response.status).toBe(403);
    expect(githubService.createFile).not.toHaveBeenCalled();
  });

  it('registers identical GitHub routes in development and production', async () => {
    const developmentApp = buildTestApp(
      githubEnvOverrides({ nodeEnv: 'development', isProduction: false })
    );

    const exercise = async (instance) => {
      const results = [];

      for (const [, method, path, body] of OPERATIONS) {
        const pending = request(instance)[method](path).set('Authorization', authHeader());
        const response = body === null ? await pending : await pending.send(body);

        results.push(response.status);
      }

      return results;
    };

    expect(await exercise(app)).toEqual(await exercise(developmentApp));
  });
});
