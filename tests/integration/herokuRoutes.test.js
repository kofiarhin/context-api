'use strict';

const request = require('supertest');
const createApp = require('../../src/app');

const env = {
  nodeEnv: 'test',
  isProduction: false,
  isTest: true,
  port: 4000,
  mongodbUri: 'mongodb://unused/context_api',
  logLevel: 'error',
  corsOrigins: [],
  rateLimitWindowMs: 900000,
  rateLimitMax: 1000,
  githubAppId: null,
  githubInstallationId: null,
  githubPrivateKey: null,
  githubRepositoryAccess: null,
  zoroGithubApiKey: null,
};

const herokuEnvSource = {
  HEROKU_API_TOKEN: 'heroku-token-value',
  ZORO_HEROKU_API_KEY: 'a'.repeat(32),
  HEROKU_SELF_APP: 'context-api',
};

describe('Heroku gateway routes', () => {
  test('rejects missing and malformed bearer credentials before upstream access', async () => {
    const app = createApp({ env, herokuEnvSource });
    await request(app).get('/api/v1/heroku/apps').expect(401);
    await request(app).get('/api/v1/heroku/apps').set('Authorization', 'Basic value').expect(401);
    await request(app).get('/api/v1/heroku/apps').set('Authorization', 'Bearer wrong').expect(401);
  });

  test('mounts the provider route before the MongoDB request guard', async () => {
    const app = createApp({ env, herokuEnvSource });
    const response = await request(app).get('/api/v1/heroku/apps').expect(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(response.body.error.code).not.toBe('DATABASE_UNAVAILABLE');
  });

  test('applies a bounded Heroku-specific JSON parser', async () => {
    const app = createApp({ env, herokuEnvSource });
    const oversized = { value: 'x'.repeat(300 * 1024) };
    await request(app)
      .patch('/api/v1/heroku/apps/context-api/config-vars')
      .set('Authorization', `Bearer ${'a'.repeat(32)}`)
      .send(oversized)
      .expect(413);
  });
});
