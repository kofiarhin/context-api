'use strict';

const request = require('supertest');
const createApp = require('../../src/app');
const { loadEnv } = require('../../src/config/env');

jest.mock('../../src/services/vercel.service', () => ({
  getUser: jest.fn(),
  listTeams: jest.fn(),
  getTeam: jest.fn(),
  listProjects: jest.fn(),
  getProject: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  pauseProject: jest.fn(),
  unpauseProject: jest.fn(),
  listDeployments: jest.fn(),
  getDeployment: jest.fn(),
  createDeployment: jest.fn(),
  cancelDeployment: jest.fn(),
  deleteDeployment: jest.fn(),
  getDeploymentEvents: jest.fn(),
  listDeploymentFiles: jest.fn(),
  promoteDeployment: jest.fn(),
  rollbackProject: jest.fn(),
  listEnvironmentVariables: jest.fn(),
  createEnvironmentVariable: jest.fn(),
  updateEnvironmentVariable: jest.fn(),
  deleteEnvironmentVariable: jest.fn(),
  listProjectDomains: jest.fn(),
  getProjectDomain: jest.fn(),
  addProjectDomain: jest.fn(),
  verifyProjectDomain: jest.fn(),
  removeProjectDomain: jest.fn(),
  listAliases: jest.fn(),
  assignAlias: jest.fn(),
  deleteAlias: jest.fn(),
  getDomainConfig: jest.fn(),
  listDnsRecords: jest.fn(),
  createDnsRecord: jest.fn(),
  updateDnsRecord: jest.fn(),
  deleteDnsRecord: jest.fn(),
}));

const vercelService = require('../../src/services/vercel.service');

const API_KEY = 'zoro-vercel-test-key-that-is-at-least-32-characters';
const vercelEnvSource = {
  VERCEL_TOKEN: 'vercel-token-for-tests',
  VERCEL_TEAM_ID: 'team_test',
  ZORO_VERCEL_API_KEY: API_KEY,
  VERCEL_PROJECT_ALLOWLIST: 'example-project,prj_123',
  VERCEL_DOMAIN_ALLOWLIST: 'example.com',
  VERCEL_REPOSITORY_ALLOWLIST: 'kofiarhin/context-api',
  VERCEL_ALLOW_DESTRUCTIVE_OPERATIONS: 'false',
};

const app = createApp({ env: loadEnv(process.env), vercelEnvSource });

function auth() {
  return `Bearer ${API_KEY}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  vercelService.getUser.mockResolvedValue({ id: 'user_1', username: 'kofi' });
  vercelService.listProjects.mockResolvedValue({ data: [{ id: 'prj_123', name: 'example-project' }], meta: {} });
  vercelService.createDeployment.mockResolvedValue({ id: 'dpl_1', target: 'preview' });
  vercelService.listEnvironmentVariables.mockResolvedValue({
    data: [{ id: 'env_1', key: 'API_URL', valueConfigured: true }],
    meta: {},
  });
});

describe('Vercel gateway authentication', () => {
  it('rejects missing bearer credentials before the service', async () => {
    const response = await request(app).get('/api/v1/vercel/user');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(vercelService.getUser).not.toHaveBeenCalled();
  });

  it('rejects invalid bearer credentials without echoing them', async () => {
    const bad = 'wrong-vercel-key-that-is-at-least-32-characters';
    const response = await request(app)
      .get('/api/v1/vercel/user')
      .set('Authorization', `Bearer ${bad}`);
    expect(response.status).toBe(401);
    expect(JSON.stringify(response.body)).not.toContain(bad);
    expect(JSON.stringify(response.body)).not.toContain(API_KEY);
  });

  it('accepts the configured Vercel action key', async () => {
    const response = await request(app)
      .get('/api/v1/vercel/user')
      .set('Authorization', auth());
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 'user_1', username: 'kofi' });
  });

  it('does not make existing context routes require the Vercel key', async () => {
    const response = await request(app).get('/api/v1/projects');
    expect(response.status).not.toBe(401);
  });
});

describe('Vercel gateway routes', () => {
  it('returns projects through the shared collection envelope', async () => {
    const response = await request(app)
      .get('/api/v1/vercel/projects?limit=20')
      .set('Authorization', auth());
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(vercelService.listProjects).toHaveBeenCalledWith({ limit: 20 });
  });

  it('defaults deployment creation to service-controlled preview behavior', async () => {
    const response = await request(app)
      .post('/api/v1/vercel/deployments')
      .set('Authorization', auth())
      .send({ name: 'example-project', project: 'example-project' });
    expect(response.status).toBe(201);
    expect(vercelService.createDeployment).toHaveBeenCalledWith({
      name: 'example-project',
      project: 'example-project',
    });
  });

  it('does not expose environment variable values in mocked metadata', async () => {
    const response = await request(app)
      .get('/api/v1/vercel/projects/example-project/environment-variables')
      .set('Authorization', auth());
    expect(response.status).toBe(200);
    expect(response.body.data[0]).not.toHaveProperty('value');
    expect(response.body.data[0]).toMatchObject({ key: 'API_URL', valueConfigured: true });
  });

  it('rejects invalid domains during validation', async () => {
    const response = await request(app)
      .get('/api/v1/vercel/domains/not-a-domain/config')
      .set('Authorization', auth());
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(vercelService.getDomainConfig).not.toHaveBeenCalled();
  });

  it('returns a gateway-local 404 without database middleware', async () => {
    const response = await request(app)
      .get('/api/v1/vercel/unknown')
      .set('Authorization', auth());
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
