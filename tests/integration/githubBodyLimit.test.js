'use strict';

const request = require('supertest');

const createApp = require('../../src/app');
const { buildTestApp } = require('../helpers/testApp');
const { githubEnvOverrides, authHeader } = require('../helpers/githubFixtures');

jest.mock('../../src/services/github.service');

const githubService = require('../../src/services/github.service');

/**
 * The two namespaces carry very different payloads, so they parse with
 * different limits. These tests pin both: the context routes must keep their
 * 10 KB ceiling, and the GitHub routes must accept whole-file content.
 */
const app = buildTestApp(githubEnvOverrides());

beforeEach(() => {
  githubService.createFile.mockResolvedValue({ path: 'docs/a.md', commitSha: 'b'.repeat(40) });
});

function fileBody(content) {
  return {
    owner: 'kofiarhin',
    repo: 'context-api',
    branch: 'main',
    path: 'docs/a.md',
    content,
    message: 'docs: add',
  };
}

describe('configured limits', () => {
  it('exposes distinct limits for context and GitHub routes', () => {
    expect(createApp.JSON_BODY_LIMIT).toBe('10kb');
    expect(createApp.GITHUB_JSON_BODY_LIMIT).toBe('512kb');
  });
});

describe('GitHub route body limit', () => {
  it('accepts a payload far above the 10 KB context limit', async () => {
    const response = await request(app)
      .post('/api/v1/github/files')
      .set('Authorization', authHeader())
      .send(fileBody('a'.repeat(120000)));

    expect(response.status).toBe(201);
  });

  it('rejects a payload beyond the GitHub limit through the safe translation', async () => {
    const response = await request(app)
      .post('/api/v1/github/files')
      .set('Authorization', authHeader())
      .send(fileBody('a'.repeat(600000)));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details[0].message).toMatch(/size limit/i);
    expect(githubService.createFile).not.toHaveBeenCalled();
  });

  it('enforces the documented content-character limit below the byte limit', async () => {
    const response = await request(app)
      .post('/api/v1/github/files')
      .set('Authorization', authHeader())
      .send(fileBody('a'.repeat(250001)));

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('content');
    expect(githubService.createFile).not.toHaveBeenCalled();
  });
});

describe('context route body limit', () => {
  it('still rejects a body above 10 KB', async () => {
    const response = await request(app)
      .post('/api/v1/projects')
      .send({ projectId: 'big', description: 'a'.repeat(20000) });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].message).toMatch(/size limit/i);
  });

  it('does not inherit the larger GitHub limit', async () => {
    const response = await request(app)
      .post('/api/v1/projects')
      .send({ projectId: 'big', description: 'a'.repeat(120000) });

    expect(response.status).toBe(400);
  });
});
