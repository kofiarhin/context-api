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

describe('GET /api/v1/coding-conventions', () => {
  it('returns seeded conventions', async () => {
    const response = await request(app).get('/api/v1/coding-conventions');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('filters by scope', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?scope=project');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((convention) => {
      expect(convention.scope).toBe('project');
      expect(convention.projectId).not.toBeNull();
    });
  });

  it('filters by technology', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?technology=express');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((convention) =>
      expect(convention.technology).toContain('express')
    );
  });

  it('filters by layer', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?layer=backend');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((convention) => expect(convention.layer).toContain('backend'));
  });

  it('filters by project', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?project=context-api');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((convention) =>
      expect(convention.projectId).toBe('context-api')
    );
  });

  it('filters by status', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?status=draft');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((convention) => expect(convention.status).toBe('draft'));
  });

  it('combines several filters', async () => {
    const response = await request(app).get(
      '/api/v1/coding-conventions?scope=project&technology=express&project=context-api&status=active'
    );

    expect(response.status).toBe(200);
    response.body.data.forEach((convention) => {
      expect(convention.scope).toBe('project');
      expect(convention.technology).toContain('express');
      expect(convention.projectId).toBe('context-api');
      expect(convention.status).toBe('active');
    });
  });

  it('keeps global and project records distinguishable', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?pageSize=100');

    const globals = response.body.data.filter((entry) => entry.scope === 'global');
    const scoped = response.body.data.filter((entry) => entry.scope === 'project');

    expect(globals.length).toBeGreaterThan(0);
    expect(scoped.length).toBeGreaterThan(0);
    globals.forEach((entry) => expect(entry.projectId).toBeNull());
  });

  it('does not silently resolve conflicts in a collection response', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?technology=express&pageSize=100');

    const scopes = new Set(response.body.data.map((entry) => entry.scope));

    // Both a global and a project-scoped express convention are seeded; the
    // collection must return both rather than only the higher-precedence one.
    expect(scopes.has('global')).toBe(true);
    expect(scopes.has('project')).toBe(true);
  });

  it('keeps superseded conventions distinguishable from active ones', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?status=superseded');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((entry) => expect(entry.status).toBe('superseded'));
  });

  it('returns an empty collection for a non-matching filter', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?technology=fortran');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('rejects an invalid scope', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?scope=universal');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('scope');
  });
});

describe('GET /api/v1/coding-conventions/:key', () => {
  it('returns a convention by exact key', async () => {
    const response = await request(app).get('/api/v1/coding-conventions/backend-layered-structure');

    expect(response.status).toBe(200);
    expect(response.body.data.key).toBe('backend-layered-structure');
    expect(response.body.data.rules.length).toBeGreaterThan(0);
  });

  it('returns a project-scoped convention with its project reference', async () => {
    const response = await request(app).get(
      '/api/v1/coding-conventions/context-api-read-only-endpoints'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.scope).toBe('project');
    expect(response.body.data.projectId).toBe('context-api');
  });

  it('does not match on a partial key', async () => {
    const response = await request(app).get('/api/v1/coding-conventions/backend-layered');

    expect(response.status).toBe(404);
  });

  it('returns 404 for an unknown key', async () => {
    const response = await request(app).get('/api/v1/coding-conventions/no-such-convention');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects a malformed key', async () => {
    const response = await request(app).get('/api/v1/coding-conventions/$where');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
