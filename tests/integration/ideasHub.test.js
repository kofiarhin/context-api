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

describe('GET /api/v1/ideas-hub', () => {
  it('returns active sections by default', async () => {
    const response = await request(app).get('/api/v1/ideas-hub');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((section) => expect(['active', 'approved']).toContain(section.status));
  });

  it('excludes superseded sections from the default collection', async () => {
    const response = await request(app).get('/api/v1/ideas-hub?pageSize=100');

    expect(response.body.data.some((section) => section.section === 'legacy-notes-layout')).toBe(
      false
    );
  });

  it('returns superseded sections when explicitly requested', async () => {
    const response = await request(app).get('/api/v1/ideas-hub?status=superseded');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((section) => expect(section.status).toBe('superseded'));
  });

  it('rejects an unknown query parameter', async () => {
    const response = await request(app).get('/api/v1/ideas-hub?section=canonical-files');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('section');
  });
});

describe('GET /api/v1/ideas-hub/:section', () => {
  it('returns a section by its stable key', async () => {
    const response = await request(app).get('/api/v1/ideas-hub/canonical-files');

    expect(response.status).toBe(200);
    expect(response.body.data.section).toBe('canonical-files');
    expect(response.body.data.canonicalFiles.length).toBeGreaterThan(0);
    expect(response.body.data.canonicalFiles[0]).toHaveProperty('responsibility');
  });

  it('keeps source-of-truth rules and record relationships explicit', async () => {
    const response = await request(app).get('/api/v1/ideas-hub/source-of-truth-rules');

    expect(response.status).toBe(200);
    expect(response.body.data.sourceOfTruthRules.length).toBeGreaterThan(0);
    expect(response.body.data.recordRelationships.length).toBeGreaterThan(0);
    expect(response.body.data.recordRelationships[0]).toMatchObject({
      from: expect.any(String),
      to: expect.any(String),
      relationship: expect.any(String),
    });
  });

  it('keeps update-routing rules explicit', async () => {
    const response = await request(app).get('/api/v1/ideas-hub/update-routing');

    expect(response.status).toBe(200);
    expect(response.body.data.updateRoutingRules.length).toBeGreaterThan(0);
    expect(response.body.data.updateRoutingRules[0]).toMatchObject({
      change: expect.any(String),
      destination: expect.any(String),
    });
  });

  it('retains a source reference for traceability', async () => {
    const response = await request(app).get('/api/v1/ideas-hub/repository-layout');

    expect(response.body.data.source).toMatchObject({ type: 'ideas-hub' });
    expect(response.body.data.source.reference).toBeTruthy();
  });

  it('returns a superseded section so archived references stay resolvable', async () => {
    const response = await request(app).get('/api/v1/ideas-hub/legacy-notes-layout');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('superseded');
  });

  it('returns 404 for an unknown section', async () => {
    const response = await request(app).get('/api/v1/ideas-hub/no-such-section');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
