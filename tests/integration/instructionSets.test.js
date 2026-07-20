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

describe('GET /api/v1/instruction-sets', () => {
  it('returns seeded instruction sets', async () => {
    const response = await request(app).get('/api/v1/instruction-sets');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('filters by workflow stage', async () => {
    const response = await request(app).get('/api/v1/instruction-sets?workflowStage=verification');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((entry) => expect(entry.workflowStage).toBe('verification'));
  });

  it('filters by status', async () => {
    const response = await request(app).get('/api/v1/instruction-sets?status=draft');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((entry) => expect(entry.status).toBe('draft'));
  });

  it('filters by applicable client', async () => {
    const response = await request(app).get('/api/v1/instruction-sets?client=architect');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((entry) =>
      expect(entry.applicableClients).toContain('architect')
    );
  });

  it('lists every stored version of a key, including superseded ones', async () => {
    const response = await request(app).get('/api/v1/instruction-sets?pageSize=100');

    const discovery = response.body.data.filter((entry) => entry.key === 'discovery-workflow');

    expect(discovery.length).toBe(2);
    expect(discovery.map((entry) => entry.version).sort()).toEqual([1, 2]);
  });

  it('rejects an invalid workflow stage', async () => {
    const response = await request(app).get('/api/v1/instruction-sets?workflowStage=brainstorm');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('workflowStage');
  });

  it('returns an empty collection for a client with no instruction sets', async () => {
    const response = await request(app).get('/api/v1/instruction-sets?client=unknown-client');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe('GET /api/v1/instruction-sets/:key', () => {
  it('returns the highest published version for a key', async () => {
    const response = await request(app).get('/api/v1/instruction-sets/discovery-workflow');

    expect(response.status).toBe(200);
    expect(response.body.data.key).toBe('discovery-workflow');
    expect(response.body.data.version).toBe(2);
    expect(response.body.data.status).toBe('active');
  });

  it('never selects a superseded version even when it shares the key', async () => {
    const { body } = await request(app).get('/api/v1/instruction-sets/discovery-workflow');

    expect(body.data.status).not.toBe('superseded');
    expect(body.data.instructions.length).toBeGreaterThan(2);
  });

  it('returns 404 for a key that only has a draft version', async () => {
    const response = await request(app).get('/api/v1/instruction-sets/code-review-workflow');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('returns structured content when present', async () => {
    const response = await request(app).get('/api/v1/instruction-sets/implementation-workflow');

    expect(response.status).toBe(200);
    expect(response.body.data.content).toBeNull();
    expect(Array.isArray(response.body.data.instructions)).toBe(true);
  });

  it('returns 404 for an unknown key', async () => {
    const response = await request(app).get('/api/v1/instruction-sets/no-such-workflow');

    expect(response.status).toBe(404);
  });

  it('rejects a malformed key', async () => {
    const response = await request(app).get('/api/v1/instruction-sets/%20');

    expect(response.status).toBe(400);
  });
});
