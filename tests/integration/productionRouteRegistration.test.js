'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');

/**
 * A previous release shipped a GET-only guard to production, so Custom GPT
 * Actions received METHOD_NOT_ALLOWED for every write. These tests drive the
 * exported app built with a production environment so a regression fails here
 * rather than after a deploy.
 */
const productionEnv = { nodeEnv: 'production', isProduction: true, isTest: false };

const source = {
  type: 'user-approved',
  reference: 'tests/integration/productionRouteRegistration.test.js',
};

let app;

beforeAll(async () => {
  await connectTestDb();
  app = buildTestApp(productionEnv);
});

beforeEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await clearTestDb();
  await closeTestDb();
});

function buildTask(overrides = {}) {
  return {
    taskId: 'prod-route-task',
    title: 'Production route registration',
    projectId: 'projectos',
    status: 'ready',
    source,
    ...overrides,
  };
}

describe('production-mode route registration', () => {
  it('is built with a production environment', () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  it('exposes POST /api/v1/tasks', async () => {
    const response = await request(app).post('/api/v1/tasks').send(buildTask());

    expect(response.status).toBe(201);
    expect(response.body.data.taskId).toBe('prod-route-task');
  });

  it('exposes GET /api/v1/tasks/:taskId', async () => {
    await request(app).post('/api/v1/tasks').send(buildTask());

    const response = await request(app).get('/api/v1/tasks/prod-route-task');

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Production route registration');
  });

  it('exposes PATCH /api/v1/tasks/:taskId', async () => {
    await request(app).post('/api/v1/tasks').send(buildTask());

    const response = await request(app)
      .patch('/api/v1/tasks/prod-route-task')
      .send({ title: 'Patched in production mode' });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Patched in production mode');
  });

  it('exposes DELETE /api/v1/tasks/:taskId as a soft delete', async () => {
    await request(app).post('/api/v1/tasks').send(buildTask());

    const response = await request(app).delete('/api/v1/tasks/prod-route-task');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('archived');
    expect(response.body.data.archivedAt).toBeTruthy();

    const stillRetrievable = await request(app).get('/api/v1/tasks/prod-route-task');
    expect(stillRetrievable.status).toBe(200);
  });

  it('rejects PUT with 405 in production mode', async () => {
    const response = await request(app).put('/api/v1/tasks/prod-route-task').send({ title: 'No' });

    expect(response.status).toBe(405);
    expect(response.body.error.code).toBe('METHOD_NOT_ALLOWED');
    expect(response.headers.allow).toBe('GET, HEAD, OPTIONS, POST, PATCH, DELETE');
  });

  it.each(['put', 'trace'])('rejects the unsupported %s verb with 405', async (method) => {
    const response = await request(app)[method]('/api/v1/tasks');

    expect(response.status).toBe(405);
    expect(response.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('never advertises a GET-only allowlist', async () => {
    const response = await request(app).put('/api/v1/tasks/prod-route-task');

    expect(response.headers.allow).toContain('POST');
    expect(response.headers.allow).toContain('PATCH');
    expect(response.headers.allow).toContain('DELETE');
  });

  it('registers identical write routes in development and production', async () => {
    const developmentApp = buildTestApp({ nodeEnv: 'development', isProduction: false });

    const exercise = async (instance, taskId) => [
      (await request(instance).post('/api/v1/tasks').send(buildTask({ taskId }))).status,
      (await request(instance).patch(`/api/v1/tasks/${taskId}`).send({ title: 'Updated' })).status,
      (await request(instance).delete(`/api/v1/tasks/${taskId}`)).status,
      (await request(instance).put(`/api/v1/tasks/${taskId}`)).status,
    ];

    const productionResults = await exercise(app, 'parity-production');
    const developmentResults = await exercise(developmentApp, 'parity-development');

    expect(productionResults).toEqual([201, 200, 200, 405]);
    expect(productionResults).toEqual(developmentResults);
  });
});
