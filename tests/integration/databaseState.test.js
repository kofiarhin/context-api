'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, closeTestDb } = require('../helpers/testDb');

let app;

beforeAll(async () => {
  await connectTestDb();
  app = buildTestApp();
});

afterAll(async () => {
  await closeTestDb();
});

describe('health with a connected database', () => {
  it('reports 200 and a connected database', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.database).toBe('connected');
    expect(response.body.data.environment).toBe('test');
    expect(response.body.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('exposes no connection details', async () => {
    const response = await request(app).get('/health');
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain('mongodb://');
    expect(serialized).not.toContain('127.0.0.1');
    expect(Object.keys(response.body.data).sort()).toEqual([
      'database',
      'environment',
      'status',
      'timestamp',
    ]);
  });
});

describe('behavior while the database is unavailable', () => {
  beforeAll(async () => {
    await closeTestDb();
  });

  afterAll(async () => {
    await connectTestDb();
  });

  it('reports 503 from health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.data.status).toBe('degraded');
    expect(response.body.data.database).toBe('disconnected');
  });

  it.each([
    '/api/v1/profile',
    '/api/v1/projects',
    '/api/v1/coding-conventions',
    '/api/v1/glossary',
    '/api/v1/tasks',
  ])('returns DATABASE_UNAVAILABLE from %s', async (path) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.body.error.message).toBe('The database is currently unavailable.');
  });

  it('leaks no connection detail in the error body', async () => {
    const response = await request(app).get('/api/v1/projects');

    expect(JSON.stringify(response.body)).not.toContain('mongodb://');
  });

  it('still rejects an unknown route before reaching the database check', async () => {
    const response = await request(app).get('/api/v9/projects');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
