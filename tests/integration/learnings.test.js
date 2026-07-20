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

describe('GET /api/v1/learnings', () => {
  it('returns seeded learnings', async () => {
    const response = await request(app).get('/api/v1/learnings');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('filters by category', async () => {
    const response = await request(app).get('/api/v1/learnings?category=architecture');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((entry) => expect(entry.category).toBe('architecture'));
  });

  it('filters by project', async () => {
    const response = await request(app).get('/api/v1/learnings?projectId=context-api');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((entry) => expect(entry.projectId).toBe('context-api'));
  });

  it('filters by status', async () => {
    const response = await request(app).get('/api/v1/learnings?status=draft');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((entry) => expect(entry.status).toBe('draft'));
  });

  it('combines filters', async () => {
    const response = await request(app).get(
      '/api/v1/learnings?category=architecture&projectId=context-api&status=active'
    );

    expect(response.status).toBe(200);
    response.body.data.forEach((entry) => {
      expect(entry.category).toBe('architecture');
      expect(entry.projectId).toBe('context-api');
      expect(entry.status).toBe('active');
    });
  });

  it('never presents an unreviewed observation as durable knowledge', async () => {
    const response = await request(app).get('/api/v1/learnings?pageSize=100');

    response.body.data.forEach((entry) => {
      if (entry.status === 'active' || entry.status === 'approved') {
        expect(entry.reviewStatus).toBe('reviewed');
      }
    });
  });

  it('keeps draft learnings distinguishable by status and review state', async () => {
    const response = await request(app).get('/api/v1/learnings?status=draft');

    response.body.data.forEach((entry) => {
      expect(entry.status).toBe('draft');
      expect(entry.reviewStatus).not.toBe('reviewed');
    });
  });

  it('keeps superseded learnings retrievable and marked', async () => {
    const response = await request(app).get('/api/v1/learnings?status=superseded');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((entry) => expect(entry.status).toBe('superseded'));
  });

  it('exposes the supersedes pointer on the replacement record', async () => {
    const response = await request(app).get(
      '/api/v1/learnings/domain-specific-routes-bound-payload-size'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.supersedes).toBe('single-context-endpoint-is-sufficient');
  });

  it('rejects an invalid category', async () => {
    const response = await request(app).get('/api/v1/learnings?category=vibes');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('category');
  });

  it('returns an empty collection when nothing matches', async () => {
    const response = await request(app).get('/api/v1/learnings?projectId=unknown-project');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});

describe('GET /api/v1/learnings/:learningId', () => {
  it('returns a learning by stable ID', async () => {
    const response = await request(app).get('/api/v1/learnings/reject-unknown-query-parameters');

    expect(response.status).toBe(200);
    expect(response.body.data.learningId).toBe('reject-unknown-query-parameters');
    expect(response.body.data.content).toBeTruthy();
  });

  it('exposes evidence entries', async () => {
    const response = await request(app).get('/api/v1/learnings/prefer-stable-keys-over-object-ids');

    expect(response.body.data.evidence.length).toBeGreaterThan(0);
    expect(response.body.data.evidence[0]).toMatchObject({
      type: expect.any(String),
      reference: expect.any(String),
    });
  });

  it('returns a global learning with a null project', async () => {
    const response = await request(app).get(
      '/api/v1/learnings/surface-conflicts-rather-than-resolving-silently'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.projectId).toBeNull();
  });

  it('returns 404 for an unknown learning', async () => {
    const response = await request(app).get('/api/v1/learnings/no-such-learning');

    expect(response.status).toBe(404);
  });

  it('rejects a malformed identifier', async () => {
    const response = await request(app).get('/api/v1/learnings/$gt');

    expect(response.status).toBe(400);
  });
});
