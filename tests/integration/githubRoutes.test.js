'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const {
  githubEnvOverrides,
  authHeader,
  TEST_API_KEY,
  SHA_A,
  SHA_B,
} = require('../helpers/githubFixtures');

// The service is mocked at its own boundary: these tests exercise routing,
// authentication, validation, status codes, and the response envelope without
// any Octokit involvement and without a live GitHub call.
jest.mock('../../src/services/github.service');

const githubService = require('../../src/services/github.service');

const app = buildTestApp(githubEnvOverrides());

const TARGET = { owner: 'kofiarhin', repo: 'context-api' };

function get(path) {
  return request(app).get(path).set('Authorization', authHeader());
}

function send(method, path, body) {
  return request(app)[method](path).set('Authorization', authHeader()).send(body);
}

beforeEach(() => {
  // Echo the requested pagination so the envelope assertion proves the values
  // travelled query -> validation -> service -> response rather than matching a
  // constant baked into the mock.
  githubService.listRepositories.mockImplementation(({ page, perPage }) =>
    Promise.resolve({
      data: [{ owner: 'kofiarhin', name: 'context-api' }],
      meta: { page, perPage, hasNextPage: false },
    })
  );
  githubService.getContent.mockResolvedValue({ type: 'file', content: '# Example\n' });
  githubService.listBranches.mockResolvedValue({
    data: { owner: 'kofiarhin', repo: 'context-api', defaultBranch: 'main', branches: [] },
    meta: { page: 1, perPage: 30, hasNextPage: false },
  });
  githubService.createBranch.mockResolvedValue({ branch: 'feature/x', sha: SHA_A });
  githubService.updateBranch.mockResolvedValue({ branch: 'main', sha: SHA_B });
  githubService.createFile.mockResolvedValue({ path: 'docs/a.md', commitSha: SHA_B });
  githubService.updateFile.mockResolvedValue({ path: 'docs/a.md', commitSha: SHA_B });
  githubService.deleteFile.mockResolvedValue({ path: 'docs/a.md', deleted: true });
  githubService.createPullRequest.mockResolvedValue({ number: 42, draft: true });
  githubService.getPullRequest.mockResolvedValue({ number: 42, state: 'open' });
  githubService.updatePullRequest.mockResolvedValue({ number: 42, state: 'closed' });
  githubService.mergePullRequest.mockResolvedValue({ number: 42, merged: true });
});

describe('authentication', () => {
  const routes = [
    ['get', '/api/v1/github/repositories'],
    ['get', '/api/v1/github/contents?owner=kofiarhin&repo=context-api'],
    ['get', '/api/v1/github/branches?owner=kofiarhin&repo=context-api'],
    ['post', '/api/v1/github/branches'],
    ['patch', '/api/v1/github/branches/main'],
    ['post', '/api/v1/github/files'],
    ['patch', '/api/v1/github/files'],
    ['delete', '/api/v1/github/files'],
    ['post', '/api/v1/github/pull-requests'],
    ['get', '/api/v1/github/pull-requests/42?owner=kofiarhin&repo=context-api'],
    ['patch', '/api/v1/github/pull-requests/42'],
    ['post', '/api/v1/github/pull-requests/42/merge'],
  ];

  it.each(routes)('rejects %s %s without a bearer token', async (method, path) => {
    const response = await request(app)[method](path).send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each(routes)(
    'never reaches the service for %s %s when unauthenticated',
    async (method, path) => {
      await request(app)[method](path).send({});

      for (const mock of Object.values(githubService)) {
        if (typeof mock === 'function' && mock.mock) {
          expect(mock).not.toHaveBeenCalled();
        }
      }
    }
  );

  it.each([
    ['a wrong token', 'Bearer wrong-token-that-is-long-enough-here'],
    ['a basic scheme', 'Basic dXNlcjpwYXNz'],
    ['an empty bearer value', 'Bearer '],
    ['a bare token', TEST_API_KEY],
  ])('rejects %s', async (label, header) => {
    const response = await request(app)
      .get('/api/v1/github/repositories')
      .set('Authorization', header);

    expect(response.status).toBe(401);
    expect(githubService.listRepositories).not.toHaveBeenCalled();
  });

  it('accepts the configured token', async () => {
    const response = await get('/api/v1/github/repositories');

    expect(response.status).toBe(200);
  });

  it('returns a correlation ID on the 401 envelope', async () => {
    const response = await request(app).get('/api/v1/github/repositories');

    expect(response.body.meta.correlationId).toBeTruthy();
    expect(response.headers['x-correlation-id']).toBeTruthy();
  });

  it('never echoes the token in the error body', async () => {
    const response = await request(app)
      .get('/api/v1/github/repositories')
      .set('Authorization', 'Bearer leaked-token-value-abcdefghijklmnop');

    expect(JSON.stringify(response.body)).not.toContain('leaked-token-value');
    expect(JSON.stringify(response.body)).not.toContain(TEST_API_KEY);
  });

  it('leaves existing context routes unauthenticated', async () => {
    const response = await request(app).get('/api/v1/projects');

    expect(response.status).not.toBe(401);
  });

  it('leaves the health route unauthenticated', async () => {
    const response = await request(app).get('/health');

    // This suite runs without a MongoDB connection, so health legitimately
    // reports 503. What matters here is that it is reachable without a token.
    expect(response.status).not.toBe(401);
    expect(response.body).toHaveProperty('data');
  });
});

describe('GET /api/v1/github/repositories', () => {
  it('returns the collection envelope with upstream pagination', async () => {
    const response = await get('/api/v1/github/repositories?page=2&perPage=50');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toMatchObject({ page: 2, perPage: 50, hasNextPage: false });
    expect(githubService.listRepositories).toHaveBeenCalledWith({ page: 2, perPage: 50 });
  });

  it('applies documented defaults', async () => {
    await get('/api/v1/github/repositories');

    expect(githubService.listRepositories).toHaveBeenCalledWith({ page: 1, perPage: 30 });
  });

  it.each([
    ['page=0', 'page'],
    ['page=abc', 'page'],
    ['perPage=101', 'perPage'],
    ['perPage=0', 'perPage'],
  ])('rejects %s', async (query, field) => {
    const response = await get(`/api/v1/github/repositories?${query}`);

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe(field);
  });

  it('rejects an unknown query parameter', async () => {
    const response = await get('/api/v1/github/repositories?sort=name');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/github/contents', () => {
  it('reads a file at an explicit ref', async () => {
    const response = await get(
      '/api/v1/github/contents?owner=kofiarhin&repo=context-api&path=docs/a.md&ref=main'
    );

    expect(response.status).toBe(200);
    expect(githubService.getContent).toHaveBeenCalledWith({
      ...TARGET,
      path: 'docs/a.md',
      ref: 'main',
    });
  });

  it('treats an omitted path as the repository root and an omitted ref as default', async () => {
    await get('/api/v1/github/contents?owner=kofiarhin&repo=context-api');

    expect(githubService.getContent).toHaveBeenCalledWith({ ...TARGET, path: '', ref: null });
  });

  it.each([
    ['missing owner', 'repo=context-api'],
    ['missing repo', 'owner=kofiarhin'],
    ['invalid owner', 'owner=bad_owner&repo=context-api'],
    ['traversal path', 'owner=kofiarhin&repo=context-api&path=../../etc/passwd'],
    ['absolute path', 'owner=kofiarhin&repo=context-api&path=/etc/passwd'],
    ['malformed ref', 'owner=kofiarhin&repo=context-api&ref=bad..ref'],
  ])('rejects %s', async (label, query) => {
    const response = await get(`/api/v1/github/contents?${query}`);

    expect(response.status).toBe(400);
    expect(githubService.getContent).not.toHaveBeenCalled();
  });
});

describe('branch routes', () => {
  it('creates a branch and returns 201', async () => {
    const response = await send('post', '/api/v1/github/branches', {
      ...TARGET,
      branch: 'feature/x',
      baseRef: 'main',
    });

    expect(response.status).toBe(201);
    expect(githubService.createBranch).toHaveBeenCalledWith({
      ...TARGET,
      branch: 'feature/x',
      baseRef: 'main',
    });
  });

  it('defaults baseRef to null when omitted', async () => {
    await send('post', '/api/v1/github/branches', { ...TARGET, branch: 'feature/x' });

    expect(githubService.createBranch).toHaveBeenCalledWith(
      expect.objectContaining({ baseRef: null })
    );
  });

  it('updates a branch through the path parameter', async () => {
    const response = await send('patch', '/api/v1/github/branches/main', {
      ...TARGET,
      expectedCurrentSha: SHA_A,
      newSha: SHA_B,
    });

    expect(response.status).toBe(200);
    expect(githubService.updateBranch).toHaveBeenCalledWith({
      ...TARGET,
      branch: 'main',
      expectedCurrentSha: SHA_A,
      newSha: SHA_B,
    });
  });

  it('rejects a branch update without an expected SHA', async () => {
    const response = await send('patch', '/api/v1/github/branches/main', {
      ...TARGET,
      newSha: SHA_B,
    });

    expect(response.status).toBe(400);
    expect(githubService.updateBranch).not.toHaveBeenCalled();
  });

  it('refuses a caller-supplied force flag', async () => {
    const response = await send('patch', '/api/v1/github/branches/main', {
      ...TARGET,
      expectedCurrentSha: SHA_A,
      newSha: SHA_B,
      force: true,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('force');
    expect(githubService.updateBranch).not.toHaveBeenCalled();
  });

  it('rejects a malformed SHA', async () => {
    const response = await send('patch', '/api/v1/github/branches/main', {
      ...TARGET,
      expectedCurrentSha: 'not-a-sha',
      newSha: SHA_B,
    });

    expect(response.status).toBe(400);
  });
});

describe('file routes', () => {
  const base = { ...TARGET, branch: 'main', path: 'docs/a.md', message: 'docs: change' };

  it('creates a file and returns 201', async () => {
    const response = await send('post', '/api/v1/github/files', { ...base, content: '# A\n' });

    expect(response.status).toBe(201);
    expect(githubService.createFile).toHaveBeenCalledWith({ ...base, content: '# A\n' });
  });

  it('accepts empty content', async () => {
    const response = await send('post', '/api/v1/github/files', { ...base, content: '' });

    expect(response.status).toBe(201);
  });

  it('updates a file with the current SHA', async () => {
    const response = await send('patch', '/api/v1/github/files', {
      ...base,
      sha: SHA_A,
      content: '# B\n',
    });

    expect(response.status).toBe(200);
    expect(githubService.updateFile).toHaveBeenCalledWith({
      ...base,
      sha: SHA_A,
      content: '# B\n',
    });
  });

  it('deletes a file with the current SHA', async () => {
    const response = await send('delete', '/api/v1/github/files', { ...base, sha: SHA_A });

    expect(response.status).toBe(200);
    expect(githubService.deleteFile).toHaveBeenCalledWith({ ...base, sha: SHA_A });
  });

  it('requires a SHA to update', async () => {
    const response = await send('patch', '/api/v1/github/files', { ...base, content: 'x' });

    expect(response.status).toBe(400);
    expect(githubService.updateFile).not.toHaveBeenCalled();
  });

  it('requires a SHA to delete', async () => {
    const response = await send('delete', '/api/v1/github/files', base);

    expect(response.status).toBe(400);
    expect(githubService.deleteFile).not.toHaveBeenCalled();
  });

  it.each([
    ['post', { content: 'x' }],
    ['patch', { sha: SHA_A, content: 'x' }],
    ['delete', { sha: SHA_A }],
  ])('blocks a workflow path on %s with 403', async (method, extra) => {
    const response = await send(method, '/api/v1/github/files', {
      ...base,
      path: '.github/workflows/ci.yml',
      ...extra,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('GITHUB_FORBIDDEN');
    expect(githubService.createFile).not.toHaveBeenCalled();
    expect(githubService.updateFile).not.toHaveBeenCalled();
    expect(githubService.deleteFile).not.toHaveBeenCalled();
  });

  it('blocks a workflow path regardless of case', async () => {
    const response = await send('post', '/api/v1/github/files', {
      ...base,
      path: '.GitHub/Workflows/ci.yml',
      content: 'x',
    });

    expect(response.status).toBe(403);
  });

  it('rejects a traversal path', async () => {
    const response = await send('post', '/api/v1/github/files', {
      ...base,
      path: '../outside.md',
      content: 'x',
    });

    expect(response.status).toBe(400);
  });

  it('rejects content beyond the documented character limit', async () => {
    const response = await send('post', '/api/v1/github/files', {
      ...base,
      content: 'a'.repeat(250001),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('content');
  });

  it('rejects binary content with 415', async () => {
    const response = await send('post', '/api/v1/github/files', {
      ...base,
      content: 'binary\x00data',
    });

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_CONTENT');
  });

  it('rejects an unknown body field', async () => {
    const response = await send('post', '/api/v1/github/files', {
      ...base,
      content: 'x',
      committer: { name: 'someone' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('committer');
  });

  it('rejects a missing commit message', async () => {
    const response = await send('post', '/api/v1/github/files', {
      ...TARGET,
      branch: 'main',
      path: 'docs/a.md',
      content: 'x',
    });

    expect(response.status).toBe(400);
  });
});

describe('pull request routes', () => {
  it('creates a pull request and returns 201', async () => {
    const response = await send('post', '/api/v1/github/pull-requests', {
      ...TARGET,
      title: 'Add gateway',
      body: 'Body',
      head: 'feature/x',
      base: 'main',
    });

    expect(response.status).toBe(201);
    expect(githubService.createPullRequest).toHaveBeenCalledWith({
      ...TARGET,
      title: 'Add gateway',
      body: 'Body',
      head: 'feature/x',
      base: 'main',
      draft: true,
      maintainerCanModify: true,
    });
  });

  it('allows an explicit non-draft pull request', async () => {
    await send('post', '/api/v1/github/pull-requests', {
      ...TARGET,
      title: 'T',
      head: 'feature/x',
      base: 'main',
      draft: false,
    });

    expect(githubService.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: false })
    );
  });

  it('reads a pull request', async () => {
    const response = await get('/api/v1/github/pull-requests/42?owner=kofiarhin&repo=context-api');

    expect(response.status).toBe(200);
    expect(githubService.getPullRequest).toHaveBeenCalledWith({ ...TARGET, pullNumber: 42 });
  });

  it.each(['abc', '0', '-1'])('rejects the pull request number %p', async (value) => {
    const response = await get(
      `/api/v1/github/pull-requests/${value}?owner=kofiarhin&repo=context-api`
    );

    expect(response.status).toBe(400);
    expect(githubService.getPullRequest).not.toHaveBeenCalled();
  });

  it('updates the title', async () => {
    const response = await send('patch', '/api/v1/github/pull-requests/42', {
      ...TARGET,
      title: 'New title',
    });

    expect(response.status).toBe(200);
    expect(githubService.updatePullRequest).toHaveBeenCalledWith({
      ...TARGET,
      pullNumber: 42,
      changes: { title: 'New title' },
    });
  });

  it('closes a pull request', async () => {
    await send('patch', '/api/v1/github/pull-requests/42', { ...TARGET, state: 'closed' });

    expect(githubService.updatePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ changes: { state: 'closed' } })
    );
  });

  it('rejects an empty patch body', async () => {
    const response = await send('patch', '/api/v1/github/pull-requests/42', TARGET);

    expect(response.status).toBe(400);
    expect(githubService.updatePullRequest).not.toHaveBeenCalled();
  });

  it('rejects an invalid state', async () => {
    const response = await send('patch', '/api/v1/github/pull-requests/42', {
      ...TARGET,
      state: 'merged',
    });

    expect(response.status).toBe(400);
  });

  it('merges with an expected head SHA', async () => {
    const response = await send('post', '/api/v1/github/pull-requests/42/merge', {
      ...TARGET,
      expectedHeadSha: SHA_B,
      mergeMethod: 'squash',
    });

    expect(response.status).toBe(200);
    expect(githubService.mergePullRequest).toHaveBeenCalledWith({
      ...TARGET,
      pullNumber: 42,
      expectedHeadSha: SHA_B,
      mergeMethod: 'squash',
      commitTitle: undefined,
      commitMessage: undefined,
    });
  });

  it('requires an expected head SHA to merge', async () => {
    const response = await send('post', '/api/v1/github/pull-requests/42/merge', {
      ...TARGET,
      mergeMethod: 'squash',
    });

    expect(response.status).toBe(400);
    expect(githubService.mergePullRequest).not.toHaveBeenCalled();
  });

  it('rejects an unsupported merge method', async () => {
    const response = await send('post', '/api/v1/github/pull-requests/42/merge', {
      ...TARGET,
      expectedHeadSha: SHA_B,
      mergeMethod: 'force',
    });

    expect(response.status).toBe(400);
    expect(githubService.mergePullRequest).not.toHaveBeenCalled();
  });
});

describe('error propagation', () => {
  it.each([
    [403, 'GITHUB_FORBIDDEN'],
    [404, 'GITHUB_NOT_FOUND'],
    [409, 'GITHUB_CONFLICT'],
    [422, 'GITHUB_VALIDATION_ERROR'],
    [502, 'GITHUB_UNAVAILABLE'],
  ])('surfaces a service %i as the %s envelope', async (statusCode, code) => {
    const { AppError } = require('../../src/utils/errors');
    githubService.listRepositories.mockRejectedValue(
      new AppError(code, 'Upstream problem.', statusCode)
    );

    const response = await get('/api/v1/github/repositories');

    expect(response.status).toBe(statusCode);
    expect(response.body.error.code).toBe(code);
    expect(response.body.meta.correlationId).toBeTruthy();
  });

  it('returns 404 for an unknown GitHub subpath', async () => {
    const response = await get('/api/v1/github/not-a-route');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('still returns 405 for an unsupported method', async () => {
    const response = await request(app)
      .put('/api/v1/github/files')
      .set('Authorization', authHeader());

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET, HEAD, OPTIONS, POST, PATCH, DELETE');
  });
});
