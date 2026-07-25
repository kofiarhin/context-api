'use strict';

const request = require('supertest');

const { buildTestApp } = require('../helpers/testApp');
const { connectTestDb, clearTestDb, closeTestDb } = require('../helpers/testDb');
const { seedTestData } = require('../helpers/seedTestData');
const DevOpsLogEntry = require('../../src/models/devopsLogEntry.model');

const API_KEY = 'z'.repeat(40);
const ROUTE = '/api/v1/zoro/operations';
const engineeringEnvSource = { ZORO_ENGINEERING_API_KEY: API_KEY };

const APPROVAL = {
  approvedBy: 'Kofi',
  authority: 'decision-record-42',
  reason: 'Retiring the superseded record.',
};

let app;

function post(operationId, body) {
  return request(app)
    .post(`${ROUTE}/${operationId}`)
    .set('Authorization', `Bearer ${API_KEY}`)
    .send(body);
}

beforeAll(async () => {
  await connectTestDb();
  app = buildTestApp({}, { engineeringEnvSource });
  await clearTestDb();
  // The model refuses every mutation, so cleanup goes underneath it through the
  // raw driver collection. Reaching for `deleteMany` here would (correctly) throw.
  await DevOpsLogEntry.collection.deleteMany({});
  await seedTestData();
});

afterAll(async () => {
  await clearTestDb();
  // The model refuses every mutation, so cleanup goes underneath it through the
  // raw driver collection. Reaching for `deleteMany` here would (correctly) throw.
  await DevOpsLogEntry.collection.deleteMany({});
  await closeTestDb();
});

describe('unified dispatcher authentication', () => {
  it('rejects a request with no Authorization header', async () => {
    const response = await request(app).post(`${ROUTE}/health.check`).send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects a non-bearer scheme', async () => {
    const response = await request(app)
      .post(`${ROUTE}/health.check`)
      .set('Authorization', `Basic ${API_KEY}`)
      .send({});

    expect(response.status).toBe(401);
  });

  it('rejects a wrong bearer key', async () => {
    const response = await request(app)
      .post(`${ROUTE}/health.check`)
      .set('Authorization', `Bearer ${'q'.repeat(40)}`)
      .send({});

    expect(response.status).toBe(401);
  });

  it('rejects a bearer key with trailing content', async () => {
    const response = await request(app)
      .post(`${ROUTE}/health.check`)
      .set('Authorization', `Bearer ${API_KEY} extra`)
      .send({});

    expect(response.status).toBe(401);
  });

  it('fails closed when no engineering key is configured', async () => {
    const unconfigured = buildTestApp({}, { engineeringEnvSource: {} });
    const response = await request(unconfigured)
      .post(`${ROUTE}/health.check`)
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({});

    expect(response.status).toBe(401);
  });

  it('does not accept another gateway bearer key', async () => {
    const githubKey = 'g'.repeat(40);
    const scoped = buildTestApp({ zoroGithubApiKey: githubKey }, { engineeringEnvSource });
    const response = await request(scoped)
      .post(`${ROUTE}/health.check`)
      .set('Authorization', `Bearer ${githubKey}`)
      .send({});

    expect(response.status).toBe(401);
  });

  it('never echoes the supplied token back to the caller', async () => {
    const response = await request(app)
      .post(`${ROUTE}/health.check`)
      .set('Authorization', `Bearer ${'q'.repeat(40)}`)
      .send({});

    expect(JSON.stringify(response.body)).not.toContain('q'.repeat(40));
  });
});

describe('unified dispatcher routing and validation', () => {
  it('returns 404 for an unknown dispatcher id', async () => {
    const response = await post('github.everything', { operation: 'listRepositories' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('does not resolve a dispatcher id through the prototype chain', async () => {
    for (const id of ['__proto__', 'constructor', 'toString']) {
      const response = await post(id, {});

      expect(response.status).toBe(404);
    }
  });

  it('returns 400 for an operation outside the dispatcher catalogue', async () => {
    const response = await post('github.read', { operation: 'deleteRepository' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/not allowed by the github.read dispatcher/);
  });

  it('rejects an unknown envelope field rather than ignoring it', async () => {
    const response = await post('health.check', { operation: 'check', method: 'DELETE' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/Unknown request field: method/);
  });

  it('rejects a generic proxy attempt through the envelope', async () => {
    for (const field of ['path', 'url', 'headers', 'upstream']) {
      const response = await post('github.read', { operation: 'getContent', [field]: '/x' });

      expect(response.status).toBe(400);
    }
  });

  it('requires an operation when the dispatcher has more than one', async () => {
    const response = await post('engineering.read', {});

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/operation is required/);
  });

  it('rejects a non-object parameters block', async () => {
    const response = await post('engineering.read', {
      operation: 'listProjects',
      parameters: 'all',
    });

    expect(response.status).toBe(400);
  });

  it('rejects any method other than POST', async () => {
    const response = await request(app)
      .get(`${ROUTE}/health.check`)
      .set('Authorization', `Bearer ${API_KEY}`);

    expect(response.status).toBe(404);
  });

  it('returns 404 for an unknown path inside the zoro namespace', async () => {
    const response = await request(app)
      .post('/api/v1/zoro/unknown')
      .set('Authorization', `Bearer ${API_KEY}`)
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('echoes the dispatcher, operation, and classification in meta', async () => {
    const response = await post('engineering.read', { operation: 'listProjects' });

    expect(response.body.meta).toMatchObject({
      operationId: 'engineering.read',
      operation: 'listProjects',
      classification: 'read',
    });
  });
});

describe('health.check dispatcher', () => {
  it('reports availability without an explicit operation', async () => {
    const response = await post('health.check', {});

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.environment).toBe('test');
  });

  it('accepts the explicit operation name too', async () => {
    const response = await post('health.check', { operation: 'check' });

    expect(response.status).toBe(200);
  });

  it('never exposes the connection string or credentials', async () => {
    const response = await post('health.check', {});
    const body = JSON.stringify(response.body);

    expect(body).not.toContain('mongodb://');
    expect(body).not.toContain(API_KEY);
  });
});

describe('context.resolve dispatcher', () => {
  it('resolves a bounded context package', async () => {
    const response = await post('context.resolve', {
      parameters: { client: 'claude-code', projectId: 'context-api' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.resolvedFor.client).toBe('claude-code');
    expect(Array.isArray(response.body.data.instructionSets)).toBe(true);
  });

  it('returns the same body as the direct route', async () => {
    const direct = await request(app).get(
      '/api/v1/context/resolve?client=claude-code&projectId=context-api'
    );
    const dispatched = await post('context.resolve', {
      parameters: { client: 'claude-code', projectId: 'context-api' },
    });

    expect(dispatched.body.data.revision).toEqual(direct.body.data.revision);
    expect(dispatched.body.data.instructionSets).toEqual(direct.body.data.instructionSets);
  });

  it('rejects a resolve without a client', async () => {
    const response = await post('context.resolve', { parameters: {} });

    expect(response.status).toBe(400);
  });

  it('rejects an unknown resolver filter', async () => {
    const response = await post('context.resolve', {
      parameters: { client: 'claude-code', unknownFilter: 'x' },
    });

    expect(response.status).toBe(400);
  });
});

describe('engineering.read dispatcher', () => {
  it('lists projects through the shared collection envelope', async () => {
    const response = await post('engineering.read', { operation: 'listProjects' });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.meta.count).toBe(response.body.data.length);
  });

  it('reads one project by its stable identifier', async () => {
    const response = await post('engineering.read', {
      operation: 'getProject',
      parameters: { projectId: 'context-api' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.projectId).toBe('context-api');
  });

  it('returns 404 for a project that does not exist', async () => {
    const response = await post('engineering.read', {
      operation: 'getProject',
      parameters: { projectId: 'no-such-project' },
    });

    expect(response.status).toBe(404);
  });

  it('rejects a malformed identifier', async () => {
    const response = await post('engineering.read', {
      operation: 'getProject',
      parameters: { projectId: '../../etc/passwd' },
    });

    expect(response.status).toBe(400);
  });

  it('applies offset pagination', async () => {
    const response = await post('engineering.read', {
      operation: 'listTasks',
      pagination: { page: 1, pageSize: 2 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeLessThanOrEqual(2);
    expect(response.body.meta).toMatchObject({ mode: 'offset', page: 1, pageSize: 2 });
  });

  // Supplying `limit` is what selects cursor mode; there is no `mode` parameter.
  it('applies cursor pagination and returns a usable next cursor', async () => {
    const first = await post('engineering.read', {
      operation: 'listTasks',
      pagination: { limit: 1 },
    });

    expect(first.status).toBe(200);
    expect(first.body.meta.mode).toBe('cursor');
    expect(first.body.meta.hasNextPage).toBe(true);

    const second = await post('engineering.read', {
      operation: 'listTasks',
      pagination: { limit: 1, cursor: first.body.meta.nextCursor },
    });

    expect(second.status).toBe(200);
    expect(second.body.data[0].taskId).not.toBe(first.body.data[0].taskId);
  });

  it('rejects mixing cursor and offset pagination', async () => {
    const response = await post('engineering.read', {
      operation: 'listTasks',
      pagination: { limit: 1, page: 2 },
    });

    expect(response.status).toBe(400);
  });

  it('filters exactly as the direct route does', async () => {
    const direct = await request(app).get('/api/v1/tasks?status=blocked');
    const dispatched = await post('engineering.read', {
      operation: 'listTasks',
      parameters: { status: 'blocked' },
    });

    expect(dispatched.body.data.map((task) => task.taskId).sort()).toEqual(
      direct.body.data.map((task) => task.taskId).sort()
    );
  });

  it('rejects an unknown filter rather than widening the result set', async () => {
    const response = await post('engineering.read', {
      operation: 'listTasks',
      parameters: { statuss: 'blocked' },
    });

    expect(response.status).toBe(400);
  });

  it('reads every catalogued list operation', async () => {
    const operations = [
      'listProjects',
      'listTasks',
      'listCodingConventions',
      'listInstructionSets',
      'listIdeasHubSections',
      'listGlossaryEntries',
      'listLearnings',
    ];

    for (const operation of operations) {
      const response = await post('engineering.read', { operation });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    }
  });

  it('reads the active profile', async () => {
    const response = await post('engineering.read', { operation: 'getProfile' });

    expect(response.status).toBe(200);
    expect(response.body.data.key).toBeDefined();
  });
});

describe('engineering.write dispatcher', () => {
  it('creates a record and returns 201', async () => {
    const response = await post('engineering.write', {
      operation: 'createLearning',
      parameters: {
        learningId: 'dispatcher-created-learning',
        title: 'Dispatcher created learning',
        content: 'Recorded through the unified engineering dispatcher.',
        category: 'workflow',
        source: { type: 'system-generated', reference: 'zoro/dispatcher' },
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.learningId).toBe('dispatcher-created-learning');
  });

  it('rejects a duplicate identifier with 409 rather than upserting', async () => {
    const response = await post('engineering.write', {
      operation: 'createLearning',
      parameters: {
        learningId: 'dispatcher-created-learning',
        title: 'Duplicate',
        content: 'Should not overwrite the original record.',
        category: 'workflow',
        source: { type: 'system-generated', reference: 'zoro/dispatcher' },
      },
    });

    expect(response.status).toBe(409);
  });

  it('updates a record addressed by identifier', async () => {
    const response = await post('engineering.write', {
      operation: 'updateLearning',
      parameters: { identifier: 'dispatcher-created-learning', title: 'Renamed by dispatcher' },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.title).toBe('Renamed by dispatcher');
  });

  it('rejects an unknown field on write', async () => {
    const response = await post('engineering.write', {
      operation: 'updateLearning',
      parameters: { identifier: 'dispatcher-created-learning', notAField: 'x' },
    });

    expect(response.status).toBe(400);
  });

  it('rejects an API-managed field on write', async () => {
    const response = await post('engineering.write', {
      operation: 'updateLearning',
      parameters: { identifier: 'dispatcher-created-learning', createdAt: '2020-01-01' },
    });

    expect(response.status).toBe(400);
  });

  it('requires no approval for an ordinary write', async () => {
    const response = await post('engineering.write', {
      operation: 'updateLearning',
      parameters: { identifier: 'dispatcher-created-learning', title: 'Still writable' },
    });

    expect(response.status).toBe(200);
  });

  it('returns 404 when updating a record that does not exist', async () => {
    const response = await post('engineering.write', {
      operation: 'updateLearning',
      parameters: { identifier: 'no-such-learning', title: 'x' },
    });

    expect(response.status).toBe(404);
  });
});

describe('engineering.archive dispatcher', () => {
  const parameters = { identifier: 'dispatcher-created-learning' };

  const confirmation = {
    confirmed: true,
    resourceType: 'learnings',
    resourceId: 'dispatcher-created-learning',
    reason: 'The record was created for this test run.',
  };

  it('refuses to archive without approval', async () => {
    const response = await post('engineering.archive', {
      operation: 'archiveLearning',
      parameters,
      confirmation,
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ZORO_OPERATION_FORBIDDEN');
  });

  it('refuses to archive without an exact confirmation', async () => {
    const response = await post('engineering.archive', {
      operation: 'archiveLearning',
      parameters,
      approval: APPROVAL,
    });

    expect(response.status).toBe(403);
  });

  it('refuses a confirmation naming a different record', async () => {
    const response = await post('engineering.archive', {
      operation: 'archiveLearning',
      parameters,
      approval: APPROVAL,
      confirmation: { ...confirmation, resourceId: 'some-other-learning' },
    });

    expect(response.status).toBe(403);
  });

  it('archives once approval and exact confirmation are supplied', async () => {
    const response = await post('engineering.archive', {
      operation: 'archiveLearning',
      parameters,
      approval: APPROVAL,
      confirmation,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('archived');
    expect(response.body.data.archivedAt).not.toBeNull();
  });
});

describe('opslog dispatchers', () => {
  const base = {
    operationId: 'github.write',
    operation: 'createPullRequest',
    summary: 'Opened the unified dispatcher pull request.',
    actor: 'zoro',
    projectId: 'context-api',
  };

  it('appends an entry and returns 201', async () => {
    const response = await post('opslog.write', {
      operation: 'appendOperationsLogEntry',
      parameters: { ...base, entryId: 'opslog-test-1', state: 'proposed' },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.entryId).toBe('opslog-test-1');
    expect(response.body.data.state).toBe('proposed');
  });

  it('generates an entryId when the caller omits one', async () => {
    const response = await post('opslog.write', {
      operation: 'appendOperationsLogEntry',
      parameters: { ...base, state: 'running' },
    });

    expect(response.status).toBe(201);
    expect(response.body.data.entryId).toMatch(/^opslog-/);
  });

  it('refuses to overwrite an existing entry', async () => {
    const response = await post('opslog.write', {
      operation: 'appendOperationsLogEntry',
      parameters: { ...base, entryId: 'opslog-test-1', state: 'completed' },
    });

    expect(response.status).toBe(409);
  });

  it('keeps the original entry unchanged after a duplicate attempt', async () => {
    const response = await post('opslog.read', {
      operation: 'getOperationsLogEntry',
      parameters: { entryId: 'opslog-test-1' },
    });

    expect(response.body.data.state).toBe('proposed');
  });

  it('accepts every distinct lifecycle state', async () => {
    const states = [
      'proposed',
      'approved',
      'running',
      'blocked',
      'failed',
      'passed',
      'deployed',
      'rolled-back',
      'resolved',
      'completed',
    ];

    for (const state of states) {
      const response = await post('opslog.write', {
        operation: 'appendOperationsLogEntry',
        parameters: { ...base, entryId: `opslog-state-${state}`, state },
      });

      expect(response.status).toBe(201);
      expect(response.body.data.state).toBe(state);
    }
  });

  it('rejects a state outside the enum instead of coercing it', async () => {
    const response = await post('opslog.write', {
      operation: 'appendOperationsLogEntry',
      parameters: { ...base, entryId: 'opslog-bad-state', state: 'done' },
    });

    expect(response.status).toBe(400);
  });

  it('keeps each lifecycle state independently filterable', async () => {
    for (const state of ['blocked', 'failed', 'passed', 'deployed', 'rolled-back', 'resolved']) {
      const response = await post('opslog.read', {
        operation: 'listOperationsLog',
        parameters: { state },
      });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((entry) => expect(entry.state).toBe(state));
    }
  });

  it('redacts secrets and temporary provider URLs before storing them', async () => {
    const response = await post('opslog.write', {
      operation: 'appendOperationsLogEntry',
      parameters: {
        ...base,
        entryId: 'opslog-redaction',
        state: 'running',
        summary: 'Deployed with Authorization: Bearer supersecrettokenvalue',
        details: {
          token: 'ghp_supersecrettokenvalue',
          logUrl: 'https://logplex.heroku.com/sessions/abc?srv=1',
          safe: 'kept',
        },
      },
    });

    expect(response.status).toBe(201);

    const stored = await DevOpsLogEntry.findOne({ entryId: 'opslog-redaction' }).lean();
    const serialized = JSON.stringify(stored);

    expect(serialized).not.toContain('supersecrettokenvalue');
    expect(serialized).not.toContain('logplex.heroku.com');
    expect(stored.details.safe).toBe('kept');
  });

  it('paginates the log newest first', async () => {
    const response = await post('opslog.read', {
      operation: 'listOperationsLog',
      pagination: { page: 1, pageSize: 3 },
    });

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(3);
    expect(response.body.meta).toMatchObject({ mode: 'offset', page: 1, pageSize: 3 });

    const timestamps = response.body.data.map((entry) => Date.parse(entry.occurredAt));
    const sorted = [...timestamps].sort((a, b) => b - a);

    expect(timestamps).toEqual(sorted);
  });

  it('supports cursor pagination without repeating an entry', async () => {
    const first = await post('opslog.read', {
      operation: 'listOperationsLog',
      pagination: { limit: 2 },
    });

    expect(first.status).toBe(200);
    expect(first.body.meta.mode).toBe('cursor');
    expect(first.body.meta.hasNextPage).toBe(true);

    const second = await post('opslog.read', {
      operation: 'listOperationsLog',
      pagination: { limit: 2, cursor: first.body.meta.nextCursor },
    });

    const firstIds = first.body.data.map((entry) => entry.entryId);
    const secondIds = second.body.data.map((entry) => entry.entryId);

    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  it('filters by project and actor', async () => {
    const response = await post('opslog.read', {
      operation: 'listOperationsLog',
      parameters: { projectId: 'context-api', actor: 'zoro' },
    });

    expect(response.status).toBe(200);
    response.body.data.forEach((entry) => {
      expect(entry.projectId).toBe('context-api');
      expect(entry.actor).toBe('zoro');
    });
  });

  it('rejects an unknown log filter', async () => {
    const response = await post('opslog.read', {
      operation: 'listOperationsLog',
      parameters: { severity: 'high' },
    });

    expect(response.status).toBe(400);
  });

  it('exposes no update or delete operation', async () => {
    for (const operation of ['updateOperationsLogEntry', 'deleteOperationsLogEntry']) {
      const write = await post('opslog.write', {
        operation,
        parameters: { entryId: 'opslog-test-1' },
      });
      const read = await post('opslog.read', {
        operation,
        parameters: { entryId: 'opslog-test-1' },
      });

      expect(write.status).toBe(400);
      expect(read.status).toBe(400);
    }
  });

  it('refuses mutation at the model layer even when called directly', async () => {
    await expect(
      DevOpsLogEntry.updateOne({ entryId: 'opslog-test-1' }, { state: 'completed' })
    ).rejects.toThrow(/append-only/);

    await expect(DevOpsLogEntry.deleteOne({ entryId: 'opslog-test-1' })).rejects.toThrow(
      /append-only/
    );

    await expect(
      DevOpsLogEntry.findOneAndUpdate({ entryId: 'opslog-test-1' }, { state: 'failed' })
    ).rejects.toThrow(/append-only/);
  });

  it('returns 404 for a log entry that does not exist', async () => {
    const response = await post('opslog.read', {
      operation: 'getOperationsLogEntry',
      parameters: { entryId: 'no-such-entry' },
    });

    expect(response.status).toBe(404);
  });
});

describe('backward compatibility', () => {
  it('keeps the direct context routes working', async () => {
    await request(app).get('/api/v1/projects').expect(200);
    await request(app).get('/api/v1/tasks').expect(200);
    await request(app).get('/api/v1/learnings').expect(200);
    await request(app).get('/api/v1/glossary').expect(200);
    await request(app).get('/api/v1/context/resolve?client=claude-code').expect(200);
  });

  it('keeps the direct health route working', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  it('keeps the direct context routes unauthenticated', async () => {
    const response = await request(app).get('/api/v1/projects');

    expect(response.status).toBe(200);
  });

  it('leaves the provider gateways answering on their own paths', async () => {
    await request(app).get('/api/v1/github/repositories').expect(401);
    await request(app).get('/api/v1/vercel/user').expect(401);
    await request(app).get('/api/v1/heroku/apps').expect(401);
  });

  it('does not let the engineering key unlock the provider gateways', async () => {
    await request(app)
      .get('/api/v1/github/repositories')
      .set('Authorization', `Bearer ${API_KEY}`)
      .expect(401);
  });
});
