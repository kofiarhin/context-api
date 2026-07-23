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

describe('GET /api/v1/context/resolve', () => {
  it('returns one bounded summary package', async () => {
    const response = await request(app).get(
      '/api/v1/context/resolve?client=architect&projectId=context-api&stage=verification&maxItems=3'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.resolvedFor).toMatchObject({
      client: 'architect',
      projectId: 'context-api',
      workflowStage: 'verification',
      maxItems: 3,
    });
    expect(response.body.data.revision).toEqual(expect.any(String));
    expect(response.body.data.profile).toHaveProperty('key');
    expect(response.body.data.project.projectId).toBe('context-api');
    expect(response.body.data.instructionSets.length).toBeLessThanOrEqual(3);
    expect(response.body.data.codingConventions.length).toBeLessThanOrEqual(3);
    response.body.data.instructionSets.forEach((entry) => {
      expect(entry).not.toHaveProperty('instructions');
      expect(entry).not.toHaveProperty('content');
    });
    response.body.data.codingConventions.forEach((entry) => {
      expect(entry).not.toHaveProperty('rules');
    });
    expect(response.body.data.references.length).toBeGreaterThan(0);
  });

  it('derives matching project context from a task ID', async () => {
    const response = await request(app).get(
      '/api/v1/context/resolve?client=zoro&taskId=context-api-health-endpoint'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.task.taskId).toBe('context-api-health-endpoint');
    expect(response.body.data.task).not.toHaveProperty('acceptanceCriteria');
    expect(response.body.data.project.projectId).toBe('context-api');
    expect(response.body.data.resolvedFor.projectId).toBe('context-api');
  });

  it('rejects a task and project mismatch', async () => {
    const response = await request(app).get(
      '/api/v1/context/resolve?client=zoro&projectId=ideas-hub&taskId=context-api-health-endpoint'
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('taskId');
  });

  it('requires a client identifier', async () => {
    const response = await request(app).get(
      '/api/v1/context/resolve?projectId=context-api'
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('client');
  });
});
