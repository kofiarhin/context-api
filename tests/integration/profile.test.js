'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');
const { seedTestData } = require('../helpers/seedTestData');
const { Profile } = require('../../src/models');

let app;

beforeAll(async () => {
  await connectTestDb();
  app = buildTestApp();
});

afterAll(async () => {
  await clearTestDb();
  await closeTestDb();
});

beforeEach(async () => {
  await clearTestDb();
});

describe('GET /api/v1/profile', () => {
  it('returns the active primary profile', async () => {
    await seedTestData();

    const response = await request(app).get('/api/v1/profile');

    expect(response.status).toBe(200);
    expect(response.body.data.key).toBe('primary');
    expect(response.body.data.status).toBe('active');
    expect(response.body.meta).toEqual({ version: 'v1' });
  });

  it('exposes the documented preference fields', async () => {
    await seedTestData();

    const { body } = await request(app).get('/api/v1/profile');

    expect(Array.isArray(body.data.professionalRoles)).toBe(true);
    expect(Array.isArray(body.data.preferredStack)).toBe(true);
    expect(Array.isArray(body.data.responsePreferences)).toBe(true);
    expect(Array.isArray(body.data.testingPreferences)).toBe(true);
    expect(Array.isArray(body.data.architecturePreferences)).toBe(true);
    expect(Array.isArray(body.data.communicationPreferences)).toBe(true);
    expect(body.data.source).toMatchObject({ type: expect.any(String) });
  });

  it('excludes internal database fields', async () => {
    await seedTestData();

    const { body } = await request(app).get('/api/v1/profile');

    expect(body.data).not.toHaveProperty('_id');
    expect(body.data).not.toHaveProperty('__v');
  });

  it('returns 404 when no profile exists', async () => {
    const response = await request(app).get('/api/v1/profile');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(response.body.meta.correlationId).toBeTruthy();
  });

  it('returns 404 when the only profile is a draft', async () => {
    await Profile.create({
      key: 'primary',
      displayName: 'Draft profile',
      source: { type: 'system-generated' },
      status: 'draft',
    });

    const response = await request(app).get('/api/v1/profile');

    expect(response.status).toBe(404);
  });

  it('falls back to another published profile when primary is absent', async () => {
    await Profile.create({
      key: 'secondary',
      displayName: 'Secondary profile',
      source: { type: 'user-approved' },
      status: 'active',
    });

    const response = await request(app).get('/api/v1/profile');

    expect(response.status).toBe(200);
    expect(response.body.data.key).toBe('secondary');
  });

  it('prefers the primary profile when several are published', async () => {
    await Profile.create({
      key: 'secondary',
      displayName: 'Secondary profile',
      source: { type: 'user-approved' },
      status: 'active',
    });
    await seedTestData();

    const response = await request(app).get('/api/v1/profile');

    expect(response.body.data.key).toBe('primary');
  });

  it('rejects an unknown query parameter', async () => {
    const response = await request(app).get('/api/v1/profile?expand=all');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
