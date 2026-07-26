'use strict';

const request = require('supertest');

jest.mock('../../src/services/github.service');

const githubService = require('../../src/services/github.service');
const { buildTestApp } = require('../helpers/testApp');

const API_KEY = 'z'.repeat(40);
const READ_ROUTE = '/api/v1/zoro/read';
const FULL_ROUTE = '/api/v1/zoro/operations';
const app = buildTestApp({}, { engineeringEnvSource: { ZORO_ENGINEERING_API_KEY: API_KEY } });

function post(route, operationId, body) {
  return request(app)
    .post(`${route}/${operationId}`)
    .set('Authorization', `Bearer ${API_KEY}`)
    .send(body);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('read-only Zoro Action', () => {
  it('uses the same engineering bearer authentication', async () => {
    const response = await request(app)
      .post(`${READ_ROUTE}/health.check`)
      .send({ operation: 'check' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('executes an operation classified as read', async () => {
    githubService.listRepositories.mockResolvedValue({
      data: [{ fullName: 'kofiarhin/context-api' }],
      meta: { page: 1, perPage: 30, hasNextPage: false },
    });

    const response = await post(READ_ROUTE, 'github.read', {
      operation: 'listRepositories',
      parameters: { page: 1, perPage: 30 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ fullName: 'kofiarhin/context-api' }]);
    expect(response.body.meta.classification).toBe('read');
    expect(githubService.listRepositories).toHaveBeenCalledWith({ page: 1, perPage: 30 });
  });

  it('allows a read operation inside a mixed-risk dispatcher', async () => {
    githubService.getPullRequest.mockResolvedValue({ number: 15, state: 'open' });

    const response = await post(READ_ROUTE, 'github.review', {
      operation: 'getPullRequest',
      parameters: { owner: 'kofiarhin', repo: 'context-api', pullNumber: 15 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ number: 15, state: 'open' });
    expect(response.body.meta.classification).toBe('read');
  });

  it('refuses a write operation before calling the provider', async () => {
    const response = await post(READ_ROUTE, 'github.write', {
      operation: 'createBranch',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        branch: 'feat/not-allowed',
        baseRef: 'main',
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/not available through the read-only Zoro Action/);
    expect(githubService.createBranch).not.toHaveBeenCalled();
  });

  it('refuses a mutating operation inside a mixed-risk dispatcher', async () => {
    const response = await post(READ_ROUTE, 'github.review', {
      operation: 'updatePullRequest',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        pullNumber: 15,
        title: 'Changed title',
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/not available through the read-only Zoro Action/);
    expect(githubService.updatePullRequest).not.toHaveBeenCalled();
  });

  it('keeps the complete engineering route available for writes', async () => {
    githubService.createBranch.mockResolvedValue({ name: 'feat/allowed', sha: 'abc' });

    const response = await post(FULL_ROUTE, 'github.write', {
      operation: 'createBranch',
      parameters: {
        owner: 'kofiarhin',
        repo: 'context-api',
        branch: 'feat/allowed',
        baseRef: 'main',
      },
    });

    expect(response.status).toBe(201);
    expect(githubService.createBranch).toHaveBeenCalledTimes(1);
  });
});
