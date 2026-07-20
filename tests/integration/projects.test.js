'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');
const { seedTestData } = require('../helpers/seedTestData');
const { Project } = require('../../src/models');

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

describe('GET /api/v1/projects', () => {
  it('returns the seeded projects', async () => {
    const response = await request(app).get('/api/v1/projects');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    expect(response.body.meta.total).toBe(response.body.data.length);
  });

  it('filters by record status', async () => {
    const response = await request(app).get('/api/v1/projects?status=draft');

    expect(response.status).toBe(200);
    response.body.data.forEach((project) => expect(project.status).toBe('draft'));
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('filters by lifecycle state', async () => {
    const response = await request(app).get('/api/v1/projects?lifecycleState=active');

    response.body.data.forEach((project) => expect(project.lifecycleState).toBe('active'));
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('filters by technology within the stack array', async () => {
    const response = await request(app).get('/api/v1/projects?technology=express');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((project) =>
      expect(project.technologyStack).toContain('express')
    );
  });

  it('combines filters', async () => {
    const response = await request(app).get(
      '/api/v1/projects?technology=express&lifecycleState=active&status=active'
    );

    expect(response.status).toBe(200);
    response.body.data.forEach((project) => {
      expect(project.technologyStack).toContain('express');
      expect(project.lifecycleState).toBe('active');
      expect(project.status).toBe('active');
    });
  });

  it('returns 200 with an empty array when nothing matches', async () => {
    const response = await request(app).get('/api/v1/projects?technology=cobol');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta).toMatchObject({ count: 0, total: 0, totalPages: 0 });
  });

  describe('updatedAfter', () => {
    it('returns projects updated after a past timestamp', async () => {
      const response = await request(app).get('/api/v1/projects?updatedAfter=2000-01-01T00:00:00.000Z');

      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('returns nothing for a future timestamp', async () => {
      const response = await request(app).get('/api/v1/projects?updatedAfter=2999-01-01T00:00:00.000Z');

      expect(response.body.data).toEqual([]);
    });

    it('rejects a non-ISO date', async () => {
      const response = await request(app).get('/api/v1/projects?updatedAfter=yesterday');

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].field).toBe('updatedAfter');
    });
  });

  describe('pagination', () => {
    it('honours page size and reports totals', async () => {
      const response = await request(app).get('/api/v1/projects?pageSize=2&page=1');

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.pageSize).toBe(2);
      expect(response.body.meta.totalPages).toBe(Math.ceil(response.body.meta.total / 2));
    });

    it('returns a disjoint second page', async () => {
      const first = await request(app).get('/api/v1/projects?pageSize=2&page=1');
      const second = await request(app).get('/api/v1/projects?pageSize=2&page=2');

      const firstIds = first.body.data.map((project) => project.projectId);
      const secondIds = second.body.data.map((project) => project.projectId);

      expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    });

    it('returns an empty page beyond the end of the collection', async () => {
      const response = await request(app).get('/api/v1/projects?page=500&pageSize=20');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.total).toBeGreaterThan(0);
    });

    it('rejects a page size above the maximum', async () => {
      const response = await request(app).get('/api/v1/projects?pageSize=101');

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].field).toBe('pageSize');
    });
  });

  it('sorts by most recently updated, then stable ID', async () => {
    const response = await request(app).get('/api/v1/projects');
    const timestamps = response.body.data.map((project) => Date.parse(project.updatedAt));

    for (let index = 1; index < timestamps.length; index += 1) {
      expect(timestamps[index - 1]).toBeGreaterThanOrEqual(timestamps[index]);
    }
  });
});

describe('GET /api/v1/projects/:projectId', () => {
  it('returns a project by its stable ID', async () => {
    const response = await request(app).get('/api/v1/projects/context-api');

    expect(response.status).toBe(200);
    expect(response.body.data.projectId).toBe('context-api');
    expect(response.body.data.name).toBe('Context API');
    expect(response.body.meta).toEqual({ version: 'v1' });
  });

  it('exposes milestones and related context references', async () => {
    const { body } = await request(app).get('/api/v1/projects/context-api');

    expect(body.data.milestones.length).toBeGreaterThan(0);
    expect(body.data.milestones[0]).toHaveProperty('key');
    expect(body.data.relatedContextReferences[0]).toHaveProperty('reference');
  });

  it('returns 404 for an unknown project', async () => {
    const response = await request(app).get('/api/v1/projects/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(response.body.error.message).toContain('does-not-exist');
  });

  it('does not fall back to slug lookup', async () => {
    await Project.updateOne({ projectId: 'context-api' }, { $set: { slug: 'ctx-api-alias' } });

    const response = await request(app).get('/api/v1/projects/ctx-api-alias');

    expect(response.status).toBe(404);

    await Project.updateOne({ projectId: 'context-api' }, { $set: { slug: 'context-api' } });
  });

  it.each(['../../etc/passwd', '$ne', 'has space'])(
    'rejects the malformed identifier %s',
    async (identifier) => {
      const response = await request(app).get(`/api/v1/projects/${encodeURIComponent(identifier)}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  );

  it('rejects an identifier beyond the maximum length', async () => {
    const response = await request(app).get(`/api/v1/projects/${'a'.repeat(129)}`);

    expect(response.status).toBe(400);
  });
});
