'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { githubEnvOverrides, authHeader } = require('../helpers/githubFixtures');

jest.mock('../../src/services/github.service');

const githubService = require('../../src/services/github.service');

/**
 * The GitHub gateway must survive a MongoDB outage.
 *
 * No suite here connects to the database, so `isConnected()` is false for every
 * request. Context routes must report DATABASE_UNAVAILABLE while GitHub routes
 * keep working — that separation is the reason the two are mounted with
 * different middleware stacks.
 */
const app = buildTestApp(githubEnvOverrides());

beforeEach(() => {
  githubService.listRepositories.mockResolvedValue({
    data: [],
    meta: { page: 1, perPage: 30, hasNextPage: false },
  });
  githubService.getContent.mockResolvedValue({ type: 'file', content: '' });
  githubService.createFile.mockResolvedValue({ path: 'docs/a.md', commitSha: 'b'.repeat(40) });
});

describe('GitHub routes without a database connection', () => {
  it('serves a repository list', async () => {
    const response = await request(app)
      .get('/api/v1/github/repositories')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(githubService.listRepositories).toHaveBeenCalled();
  });

  it('serves a content read', async () => {
    const response = await request(app)
      .get('/api/v1/github/contents?owner=kofiarhin&repo=context-api&path=README.md')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
  });

  it('serves a file write', async () => {
    const response = await request(app)
      .post('/api/v1/github/files')
      .set('Authorization', authHeader())
      .send({
        owner: 'kofiarhin',
        repo: 'context-api',
        branch: 'main',
        path: 'docs/a.md',
        content: 'x',
        message: 'docs: add',
      });

    expect(response.status).toBe(201);
  });

  it('still rejects an unauthenticated request with 401, not 503', async () => {
    const response = await request(app).get('/api/v1/github/repositories');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('returns 404 rather than 503 for an unknown GitHub subpath', async () => {
    const response = await request(app)
      .get('/api/v1/github/nope')
      .set('Authorization', authHeader());

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('context routes without a database connection', () => {
  it.each([
    ['get', '/api/v1/projects'],
    ['get', '/api/v1/tasks'],
    ['get', '/api/v1/profile'],
  ])('still requires the database for %s %s', async (method, path) => {
    const response = await request(app)[method](path);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });
});
