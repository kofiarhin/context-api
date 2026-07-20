'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');
const { buildCorsOptions } = require('../../src/middleware/security');

beforeAll(async () => {
  await connectTestDb();
});

afterAll(async () => {
  await clearTestDb();
  await closeTestDb();
});

describe('CORS allowlist', () => {
  const allowlist = ['https://app.example.com'];

  it('allows an origin on the allowlist', async () => {
    const app = buildTestApp({ corsOrigins: allowlist });

    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://app.example.com');

    expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  it('does not grant access to an origin outside the allowlist', async () => {
    const app = buildTestApp({ corsOrigins: allowlist });

    const response = await request(app).get('/health').set('Origin', 'https://evil.example.com');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never emits a wildcard when no origins are configured', async () => {
    const app = buildTestApp({ corsOrigins: [] });

    const response = await request(app).get('/health').set('Origin', 'https://anything.example.com');

    expect(response.headers['access-control-allow-origin']).not.toBe('*');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('permits non-browser clients that send no Origin header', (done) => {
    const options = buildCorsOptions({ corsOrigins: [] });

    options.origin(undefined, (error, allowed) => {
      expect(error).toBeNull();
      expect(allowed).toBe(true);
      done();
    });
  });

  it('advertises read-only methods only', async () => {
    const app = buildTestApp({ corsOrigins: allowlist });

    const response = await request(app)
      .options('/api/v1/projects')
      .set('Origin', 'https://app.example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-methods']).toBe('GET,HEAD,OPTIONS');
  });
});

describe('rate limiting', () => {
  it('returns 429 with the standard error envelope past the configured maximum', async () => {
    const app = buildTestApp({ rateLimitMax: 3, rateLimitWindowMs: 60000 });

    const allowed = [];
    for (let index = 0; index < 3; index += 1) {
      allowed.push((await request(app).get('/api/v1/projects')).status);
    }

    const blocked = await request(app).get('/api/v1/projects');

    expect(allowed).toEqual([200, 200, 200]);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(blocked.body.meta.correlationId).toBeTruthy();
  });

  it('does not rate limit the health endpoint', async () => {
    const app = buildTestApp({ rateLimitMax: 1, rateLimitWindowMs: 60000 });

    await request(app).get('/api/v1/projects');
    await request(app).get('/api/v1/projects');

    const health = await request(app).get('/health');

    expect(health.status).toBe(200);
  });

  it('sets standard rate limit headers', async () => {
    const app = buildTestApp({ rateLimitMax: 5, rateLimitWindowMs: 60000 });

    const response = await request(app).get('/api/v1/projects');

    expect(response.headers).toHaveProperty('ratelimit-limit');
  });
});
