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

describe('GET /api/v1/tasks', () => {
  it('returns seeded tasks', async () => {
    const response = await request(app).get('/api/v1/tasks');

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it('filters by project', async () => {
    const response = await request(app).get('/api/v1/tasks?projectId=ideas-hub');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((task) => expect(task.projectId).toBe('ideas-hub'));
  });

  it('filters by status', async () => {
    const response = await request(app).get('/api/v1/tasks?status=blocked');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((task) => expect(task.status).toBe('blocked'));
  });

  it('filters by priority', async () => {
    const response = await request(app).get('/api/v1/tasks?priority=critical');

    expect(response.body.data.length).toBeGreaterThan(0);
    response.body.data.forEach((task) => expect(task.priority).toBe('critical'));
  });

  it('combines filters', async () => {
    const response = await request(app).get(
      '/api/v1/tasks?projectId=context-api&status=done&priority=high'
    );

    expect(response.status).toBe(200);
    response.body.data.forEach((task) => {
      expect(task.projectId).toBe('context-api');
      expect(task.status).toBe('done');
      expect(task.priority).toBe('high');
    });
  });

  it('returns an empty collection when no task matches', async () => {
    const response = await request(app).get('/api/v1/tasks?projectId=architect&status=done');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('rejects a status outside the task lifecycle', async () => {
    const response = await request(app).get('/api/v1/tasks?status=approved');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('status');
  });

  it('rejects an invalid priority', async () => {
    const response = await request(app).get('/api/v1/tasks?priority=urgent');

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('priority');
  });

  it('paginates', async () => {
    const response = await request(app).get('/api/v1/tasks?pageSize=3&page=1');

    expect(response.body.data).toHaveLength(3);
    expect(response.body.meta.pageSize).toBe(3);
  });
});

describe('GET /api/v1/tasks/:taskId', () => {
  it('returns a task by stable ID', async () => {
    const response = await request(app).get('/api/v1/tasks/context-api-health-endpoint');

    expect(response.status).toBe(200);
    expect(response.body.data.taskId).toBe('context-api-health-endpoint');
    expect(response.body.data.acceptanceCriteria.length).toBeGreaterThan(0);
  });

  it('exposes dependencies as stable task IDs', async () => {
    const response = await request(app).get('/api/v1/tasks/context-api-shared-envelopes');

    expect(response.body.data.dependencies).toEqual(['context-api-health-endpoint']);
  });

  it('returns an archived task so history stays retrievable', async () => {
    const response = await request(app).get('/api/v1/tasks/architect-legacy-prompt-cleanup');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('archived');
  });

  it('excludes internal fields', async () => {
    const response = await request(app).get('/api/v1/tasks/context-api-health-endpoint');

    expect(response.body.data).not.toHaveProperty('_id');
    expect(response.body.data).not.toHaveProperty('__v');
  });

  it('returns 404 for an unknown task', async () => {
    const response = await request(app).get('/api/v1/tasks/no-such-task');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects a malformed identifier', async () => {
    const response = await request(app).get('/api/v1/tasks/$ne');

    expect(response.status).toBe(400);
  });
});
