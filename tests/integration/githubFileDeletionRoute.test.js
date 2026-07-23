'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { githubEnvOverrides, authHeader, SHA_A } = require('../helpers/githubFixtures');

jest.mock('../../src/services/github.service');

const githubService = require('../../src/services/github.service');

const app = buildTestApp(githubEnvOverrides());

beforeEach(() => {
  githubService.deleteFile.mockResolvedValue({
    owner: 'kofiarhin',
    repo: 'context-api',
    branch: 'fix/delete-probe',
    path: 'tmp/zoro-smoke-test.txt',
    deleted: true,
  });
});

describe('DELETE /api/v1/github/files query transport', () => {
  it('deletes a UTF-8 file from a non-default branch using its current blob SHA', async () => {
    const query = new URLSearchParams({
      owner: 'kofiarhin',
      repo: 'context-api',
      branch: 'fix/delete-probe',
      path: 'tmp/zoro-smoke-test.txt',
      sha: SHA_A,
      message: 'test: remove disposable probe',
    });

    const response = await request(app)
      .delete(`/api/v1/github/files?${query.toString()}`)
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      branch: 'fix/delete-probe',
      path: 'tmp/zoro-smoke-test.txt',
      deleted: true,
    });
    expect(githubService.deleteFile).toHaveBeenCalledWith({
      owner: 'kofiarhin',
      repo: 'context-api',
      branch: 'fix/delete-probe',
      path: 'tmp/zoro-smoke-test.txt',
      sha: SHA_A,
      message: 'test: remove disposable probe',
    });
  });

  it('keeps workflow-path blocking in place for query-based deletion', async () => {
    const query = new URLSearchParams({
      owner: 'kofiarhin',
      repo: 'context-api',
      branch: 'fix/delete-probe',
      path: '.github/workflows/ci.yml',
      sha: SHA_A,
      message: 'test: forbidden removal',
    });

    const response = await request(app)
      .delete(`/api/v1/github/files?${query.toString()}`)
      .set('Authorization', authHeader());

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('GITHUB_FORBIDDEN');
    expect(githubService.deleteFile).not.toHaveBeenCalled();
  });
});
