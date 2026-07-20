'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');
const { seedTestData } = require('../helpers/seedTestData');

let app;

beforeAll(async () => {
  await connectTestDb();
  app = buildTestApp();
  await clearTestDb();
  await seedTestData();
});

afterAll(async () => {
  await clearTestDb();
  await closeTestDb();
});

describe('routing and envelope conventions', () => {
  it('returns ROUTE_NOT_FOUND for an unknown route', async () => {
    const response = await request(app).get('/api/v1/not-a-domain');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(response.body.meta.version).toBe('v1');
  });

  it('returns ROUTE_NOT_FOUND for an unknown API version', async () => {
    const response = await request(app).get('/api/v2/projects');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('returns ROUTE_NOT_FOUND at the API root', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('does not expose PUT in the simplified CRUD MVP', async () => {
    const response = await request(app).put('/api/v1/projects/context-api').send({ name: 'No' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('rejects malformed JSON with a validation error', async () => {
    const response = await request(app)
      .post('/api/v1/projects')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details[0].field).toBe('body');
  });

  it('rejects an oversized query string', async () => {
    const response = await request(app).get(`/api/v1/projects?status=${'a'.repeat(2100)}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details[0].field).toBe('query');
  });

  describe('correlation IDs', () => {
    it('generates one when the caller does not supply it', async () => {
      const response = await request(app).get('/api/v1/not-a-domain');

      expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.body.meta.correlationId).toBe(response.headers['x-correlation-id']);
    });

    it('adopts a well-formed caller-supplied ID', async () => {
      const response = await request(app)
        .get('/api/v1/not-a-domain')
        .set('x-correlation-id', 'client-run-42');

      expect(response.headers['x-correlation-id']).toBe('client-run-42');
      expect(response.body.meta.correlationId).toBe('client-run-42');
    });

    it('replaces a malformed ID rather than echoing it into logs', async () => {
      const response = await request(app)
        .get('/api/v1/not-a-domain')
        .set('x-correlation-id', 'bad id\nwith newline');

      expect(response.headers['x-correlation-id']).not.toContain('newline');
      expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('security posture', () => {
    it('does not advertise the framework', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('sets secure headers', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    it('never returns a stack trace or raw error text', async () => {
      const response = await request(app).get('/api/v1/projects?page=0');

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).not.toMatch(/at .*\.js:\d+/);
      expect(response.body.error).not.toHaveProperty('stack');
    });
  });

  describe('envelope consistency across every collection endpoint', () => {
    const collections = [
      '/api/v1/coding-conventions',
      '/api/v1/projects',
      '/api/v1/instruction-sets',
      '/api/v1/ideas-hub',
      '/api/v1/glossary',
      '/api/v1/learnings',
      '/api/v1/tasks',
    ];

    it.each(collections)('%s returns the documented collection envelope', async (path) => {
      const response = await request(app).get(path);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toMatchObject({
        count: response.body.data.length,
        page: 1,
        pageSize: 20,
        version: 'v1',
      });
      expect(typeof response.body.meta.total).toBe('number');
      expect(typeof response.body.meta.totalPages).toBe('number');
    });

    it.each(collections)('%s never exposes database internals', async (path) => {
      const response = await request(app).get(path);
      const serialized = JSON.stringify(response.body);

      expect(serialized).not.toContain('"_id"');
      expect(serialized).not.toContain('"__v"');
    });

    it.each(collections)('%s rejects an unknown query parameter', async (path) => {
      const response = await request(app).get(`${path}?bogus=1`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details[0].field).toBe('bogus');
    });
  });
});
