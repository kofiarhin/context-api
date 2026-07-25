'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { loadEnv } = require('../../src/config/env');
const { githubEnvOverrides, authHeader, TEST_API_KEY } = require('../helpers/githubFixtures');

// The service is mocked so the "explicit override still authenticates" case can
// pass the auth boundary without any Octokit or network involvement.
jest.mock('../../src/services/github.service');

const githubService = require('../../src/services/github.service');

/**
 * Fake, structurally plausible ambient provider credentials.
 *
 * None are real and none authenticate against anything. They mimic exactly what
 * a developer's local .env leaks into process.env: a partial GitHub gateway
 * config (bearer key only) alongside unrelated but complete Heroku credentials.
 * Before the isolation fix, these caused every integration test to fail with
 * "GITHUB_APP_ID is required" because buildTestApp() spread all of process.env.
 */
const AMBIENT_PROVIDER_VARS = {
  ZORO_GITHUB_API_KEY: 'ambient-zoro-github-key-0123456789abcdef',
  HEROKU_API_TOKEN: 'ambient-heroku-token-value',
  ZORO_HEROKU_API_KEY: 'z'.repeat(40),
  HEROKU_SELF_APP: 'ambient-context-api',
  VERCEL_TOKEN: 'ambient-vercel-token',
  ZORO_VERCEL_API_KEY: 'ambient-zoro-vercel-key-0123456789abcdef',
};

let saved;

beforeAll(() => {
  saved = {};
  for (const key of Object.keys(AMBIENT_PROVIDER_VARS)) {
    saved[key] = process.env[key];
    process.env[key] = AMBIENT_PROVIDER_VARS[key];
  }
});

afterAll(() => {
  for (const key of Object.keys(AMBIENT_PROVIDER_VARS)) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

beforeEach(() => {
  githubService.listRepositories.mockResolvedValue({
    data: [],
    meta: { page: 1, perPage: 30, hasNextPage: false },
  });
});

describe('test environment isolation from ambient provider credentials', () => {
  it('builds an app despite partial ambient GitHub credentials', () => {
    expect(() => buildTestApp()).not.toThrow();
  });

  it('builds an app despite unrelated ambient Heroku credentials', () => {
    expect(() => buildTestApp()).not.toThrow();
  });

  it('serves an ordinary Context API request while ambient provider vars are set', async () => {
    // A path outside /api/v1 exercises the full middleware chain (built from the
    // injected env) and the notFound handler without needing a database, proving
    // the app is live and routing despite the ambient provider variables.
    const app = buildTestApp();
    const response = await request(app).get('/definitely-not-a-route');

    expect(response.status).toBe(404);
  });

  it('does not honor ambient Heroku credentials on the Heroku gateway', async () => {
    const app = buildTestApp();
    const response = await request(app)
      .get('/api/v1/heroku/apps')
      .set('Authorization', `Bearer ${AMBIENT_PROVIDER_VARS.ZORO_HEROKU_API_KEY}`);

    expect(response.status).toBe(401);
  });

  it('still validates explicit provider overrides supplied by a provider test', async () => {
    const app = buildTestApp(githubEnvOverrides());

    const authed = await request(app)
      .get('/api/v1/github/repositories')
      .set('Authorization', authHeader(TEST_API_KEY));
    expect(authed.status).not.toBe(401);

    const ambient = await request(app)
      .get('/api/v1/github/repositories')
      .set('Authorization', `Bearer ${AMBIENT_PROVIDER_VARS.ZORO_GITHUB_API_KEY}`);
    expect(ambient.status).toBe(401);
  });

  it('keeps production strict: a partial provider config still fails fast', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        PORT: '4000',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/context_api',
        ZORO_GITHUB_API_KEY: AMBIENT_PROVIDER_VARS.ZORO_GITHUB_API_KEY,
      })
    ).toThrow(/GITHUB_APP_ID is required/);
  });

  it('loadEnv(explicitSource) does not merge ambient process.env values', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      PORT: '4000',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/context_api',
    });

    expect(env.githubAppId).toBeNull();
    expect(env.zoroGithubApiKey).toBeNull();
  });
});
