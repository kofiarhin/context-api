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
      '/api/v1/coding-conventions/context-api-public-crud-endpoints'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.scope).toBe('project');
    expect(response.body.data.projectId).toBe('context-api');
  });

  it('states the supported CRUD contract in the active API convention', async () => {
    const response = await request(app).get(
      '/api/v1/coding-conventions/context-api-public-crud-endpoints'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('active');

    const rules = response.body.data.rules.join(' ');

    expect(rules).toContain('GET, POST, PATCH, and soft-delete DELETE');
    expect(rules).toContain('PUT is unsupported and returns 405');
    expect(rules).toContain('DELETE archives records rather than permanently deleting them');
    expect(rules).toContain('Stable identifiers are client-provided and immutable');
    expect(rules).toContain('Unknown fields are rejected');
    expect(rules).toContain('must not store secrets');
    expect(rules).toContain('Authentication must be added before');
  });

  it('retires the superseded read-only convention', async () => {
    const response = await request(app).get(
      '/api/v1/coding-conventions/context-api-read-only-endpoints'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('archived');
    expect(response.body.data.archivedAt).toBeTruthy();
    expect(response.body.data.description).toContain('HISTORICAL ONLY');
    expect(response.body.data.description).toContain('context-api-public-crud-endpoints');
  });
});

describe('active coding conventions never describe the API as read-only', () => {
  /**
   * The deployed API returned METHOD_NOT_ALLOWED for every write while an active
   * convention still instructed agents to expose GET routes only. Agents read
   * these records as guidance, so a stale active rule is a live defect.
   */
  it('excludes the superseded read-only convention from the default list', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?pageSize=100');

    expect(response.status).toBe(200);

    const keys = response.body.data.map((convention) => convention.key);

    expect(keys).not.toContain('context-api-read-only-endpoints');
    expect(keys).toContain('context-api-public-crud-endpoints');
  });

  it('has no active convention instructing agents that the API is GET-only', async () => {
    const response = await request(app).get('/api/v1/coding-conventions?pageSize=100');

    expect(response.status).toBe(200);
    expect(response.body.meta.total).toBeLessThanOrEqual(100);

    const active = response.body.data.filter((convention) => convention.status === 'active');
    expect(active.length).toBeGreaterThan(0);

    const offending = active.filter((convention) =>
      convention.rules.some((rule) => /GET (routes|requests) only|read-only/i.test(rule))
    );

    expect(offending.map((convention) => convention.key)).toEqual([]);
  });

  it('keeps exactly one active convention governing Context API methods', async () => {
    const response = await request(app).get(
      '/api/v1/coding-conventions?project=context-api&pageSize=100'
    );

    expect(response.status).toBe(200);

    const governing = response.body.data.filter(
      (convention) =>
        convention.status === 'active' &&
        convention.rules.some((rule) => /GET|POST|PATCH|DELETE|PUT/.test(rule))
    );

    expect(governing).toHaveLength(1);
    expect(governing[0].key).toBe('context-api-public-crud-endpoints');
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
