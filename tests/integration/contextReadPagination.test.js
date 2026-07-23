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

describe('optimized collection reads', () => {
  it('uses compact cursor summaries without totals by default', async () => {
    const response = await request(app).get('/api/v1/projects?limit=2');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]).toHaveProperty('projectId');
    expect(response.body.data[0]).not.toHaveProperty('milestones');
    expect(response.body.meta).toMatchObject({ count: 2, limit: 2, hasNextPage: true });
    expect(response.body.meta).not.toHaveProperty('total');
    expect(response.body.meta.nextCursor).toEqual(expect.any(String));
  });

  it('returns a disjoint second cursor page', async () => {
    const first = await request(app).get('/api/v1/projects?limit=2');
    const second = await request(app).get(
      `/api/v1/projects?limit=2&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`
    );
    const firstIds = first.body.data.map((project) => project.projectId);
    const secondIds = second.body.data.map((project) => project.projectId);

    expect(second.status).toBe(200);
    expect(firstIds.filter((projectId) => secondIds.includes(projectId))).toEqual([]);
  });

  it('supports detail view and optional totals', async () => {
    const response = await request(app).get(
      '/api/v1/projects?limit=1&view=detail&includeTotal=true'
    );

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toHaveProperty('milestones');
    expect(response.body.meta.total).toBeGreaterThan(0);
  });

  it('rejects mixed pagination modes', async () => {
    const response = await request(app).get('/api/v1/projects?page=1&limit=2');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('pagination');
  });

  it('supports delta reads on every collection', async () => {
    const response = await request(app).get(
      '/api/v1/tasks?limit=10&updatedAfter=2999-01-01T00:00:00.000Z'
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('returns 304 for a matching ETag', async () => {
    const first = await request(app).get('/api/v1/projects?limit=2');
    const second = await request(app)
      .get('/api/v1/projects?limit=2')
      .set('If-None-Match', first.headers.etag);

    expect(first.headers.etag).toEqual(expect.any(String));
    expect(second.status).toBe(304);
  });
});
