'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');

const source = {
  type: 'user-approved',
  reference: 'tests/integration/crud.test.js',
};

const CASES = [
  {
    name: 'profile',
    collectionPath: '/api/v1/profile',
    itemPath: '/api/v1/profile',
    identifierField: 'key',
    identifier: 'primary',
    restoreStatus: 'active',
    payload: { key: 'primary', displayName: 'Kofi', status: 'active', source },
    singleton: true,
  },
  {
    name: 'coding conventions',
    collectionPath: '/api/v1/coding-conventions',
    itemPath: '/api/v1/coding-conventions/crud-test',
    identifierField: 'key',
    identifier: 'crud-test',
    restoreStatus: 'active',
    payload: { key: 'crud-test', title: 'CRUD Test', status: 'active', source },
  },
  {
    name: 'projects',
    collectionPath: '/api/v1/projects',
    itemPath: '/api/v1/projects/crud-project',
    identifierField: 'projectId',
    identifier: 'crud-project',
    restoreStatus: 'active',
    payload: {
      projectId: 'crud-project',
      slug: 'crud-project',
      name: 'CRUD Project',
      status: 'active',
      source,
    },
  },
  {
    name: 'tasks',
    collectionPath: '/api/v1/tasks',
    itemPath: '/api/v1/tasks/crud-task',
    identifierField: 'taskId',
    identifier: 'crud-task',
    restoreStatus: 'ready',
    payload: {
      taskId: 'crud-task',
      title: 'CRUD Task',
      projectId: 'crud-project',
      status: 'ready',
      source,
    },
  },
  {
    name: 'instruction sets',
    collectionPath: '/api/v1/instruction-sets',
    itemPath: '/api/v1/instruction-sets/crud-instructions',
    identifierField: 'key',
    identifier: 'crud-instructions',
    restoreStatus: 'active',
    payload: {
      key: 'crud-instructions',
      title: 'CRUD Instructions',
      workflowStage: 'implementation',
      status: 'active',
      source,
    },
  },
  {
    name: 'Ideas Hub context',
    collectionPath: '/api/v1/ideas-hub',
    itemPath: '/api/v1/ideas-hub/crud-section',
    identifierField: 'section',
    identifier: 'crud-section',
    restoreStatus: 'active',
    payload: {
      section: 'crud-section',
      title: 'CRUD Section',
      status: 'active',
      source,
    },
  },
  {
    name: 'glossary entries',
    collectionPath: '/api/v1/glossary',
    itemPath: '/api/v1/glossary/crud-term',
    identifierField: 'normalizedKey',
    identifier: 'crud-term',
    restoreStatus: 'active',
    payload: {
      term: 'CRUD Term',
      normalizedKey: 'crud-term',
      definition: 'A test glossary entry.',
      status: 'active',
      source,
    },
  },
  {
    name: 'learnings',
    collectionPath: '/api/v1/learnings',
    itemPath: '/api/v1/learnings/crud-learning',
    identifierField: 'learningId',
    identifier: 'crud-learning',
    restoreStatus: 'active',
    payload: {
      learningId: 'crud-learning',
      title: 'CRUD Learning',
      content: 'Verified CRUD behavior.',
      category: 'workflow',
      reviewStatus: 'reviewed',
      status: 'active',
      source,
    },
  },
];

let app;

beforeAll(async () => {
  await connectTestDb();
  app = buildTestApp({ rateLimitMax: 1000 });
});

beforeEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await clearTestDb();
  await closeTestDb();
});

describe('public CRUD endpoints', () => {
  it.each(CASES)(
    '$name supports create, patch, archive, idempotent delete, and restore',
    async (entry) => {
      const created = await request(app).post(entry.collectionPath).send(entry.payload);

      expect(created.status).toBe(201);
      expect(created.body.data[entry.identifierField]).toBe(entry.identifier);
      expect(created.body.data.archivedAt).toBeNull();

      const read = await request(app).get(entry.itemPath);
      expect(read.status).toBe(200);

      const patched = await request(app)
        .patch(entry.itemPath)
        .send({ description: 'Updated by an agent.' });

      expect(patched.status).toBe(200);
      expect(patched.body.data.description).toBe('Updated by an agent.');

      const archived = await request(app).delete(entry.itemPath);
      expect(archived.status).toBe(200);
      expect(archived.body.data.status).toBe('archived');
      expect(archived.body.data.archivedAt).toEqual(expect.any(String));

      const repeatedDelete = await request(app).delete(entry.itemPath);
      expect(repeatedDelete.status).toBe(200);
      expect(repeatedDelete.body.data.status).toBe('archived');

      if (entry.singleton) {
        const hiddenProfile = await request(app).get(entry.itemPath);
        expect(hiddenProfile.status).toBe(404);
      } else {
        const directArchivedRead = await request(app).get(entry.itemPath);
        expect(directArchivedRead.status).toBe(200);
        expect(directArchivedRead.body.data.status).toBe('archived');

        const normalCollection = await request(app).get(entry.collectionPath);
        expect(normalCollection.body.data).toHaveLength(0);

        const archivedCollection = await request(app).get(
          `${entry.collectionPath}?status=archived`
        );
        expect(archivedCollection.status).toBe(200);
        expect(archivedCollection.body.data).toHaveLength(1);
      }

      const restored = await request(app)
        .patch(entry.itemPath)
        .send({ status: entry.restoreStatus });

      expect(restored.status).toBe(200);
      expect(restored.body.data.status).toBe(entry.restoreStatus);
      expect(restored.body.data.archivedAt).toBeNull();
    }
  );

  it('returns 409 for duplicate identifiers, including archived records', async () => {
    const entry = CASES.find((candidate) => candidate.name === 'projects');

    expect((await request(app).post(entry.collectionPath).send(entry.payload)).status).toBe(201);
    expect((await request(app).post(entry.collectionPath).send(entry.payload)).status).toBe(409);

    expect((await request(app).delete(entry.itemPath)).status).toBe(200);

    const archivedDuplicate = await request(app).post(entry.collectionPath).send(entry.payload);
    expect(archivedDuplicate.status).toBe(409);
    expect(archivedDuplicate.body.error.code).toBe('RESOURCE_CONFLICT');
  });

  it('rejects unknown, managed, immutable, and empty patch fields', async () => {
    const entry = CASES.find((candidate) => candidate.name === 'projects');
    await request(app).post(entry.collectionPath).send(entry.payload);

    const unknown = await request(app).patch(entry.itemPath).send({ madeUp: true });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.details[0].field).toBe('madeUp');

    const managed = await request(app)
      .patch(entry.itemPath)
      .send({ createdAt: new Date().toISOString() });
    expect(managed.status).toBe(400);
    expect(managed.body.error.details[0].field).toBe('createdAt');

    const immutable = await request(app).patch(entry.itemPath).send({ projectId: 'new-id' });
    expect(immutable.status).toBe(400);
    expect(immutable.body.error.details[0].field).toBe('projectId');

    const empty = await request(app).patch(entry.itemPath).send({});
    expect(empty.status).toBe(400);
  });

  it('requires the stable identifier on create', async () => {
    const response = await request(app).post('/api/v1/projects').send({
      slug: 'missing-id',
      name: 'Missing ID',
      status: 'active',
      source,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('projectId');
  });

  it('returns 404 when patching or deleting an unknown record', async () => {
    const patchResponse = await request(app)
      .patch('/api/v1/projects/missing-project')
      .send({ description: 'No record' });
    const deleteResponse = await request(app).delete('/api/v1/projects/missing-project');

    expect(patchResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });
});
