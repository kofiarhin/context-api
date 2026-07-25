'use strict';

const { createService } = require('../../src/services/vercelDeployment.service');

function createHarness(overrides = {}) {
  const client = {
    request: jest.fn(),
  };
  const policy = {
    assertProjectAllowed: jest.fn(),
    requireProductionApproval: jest.fn(),
  };
  const service = createService({
    env: {},
    client,
    policy,
    ...overrides,
  });
  return { client, policy, service };
}

describe('Vercel deployment service', () => {
  it('creates Preview from a non-production branch without forwarding target preview', async () => {
    const { client, service } = createHarness();
    client.request
      .mockResolvedValueOnce({ name: 'demo', link: { productionBranch: 'main' } })
      .mockResolvedValueOnce({ uid: 'dpl_preview', target: null, name: 'demo' });

    const result = await service.createDeployment({
      project: 'demo',
      target: 'preview',
      gitSource: { type: 'github', repoId: 1, ref: 'preview/demo' },
    });

    expect(client.request).toHaveBeenNthCalledWith(1, 'GET', '/v9/projects/demo');
    expect(client.request).toHaveBeenNthCalledWith(2, 'POST', '/v13/deployments', {
      body: {
        project: 'demo',
        gitSource: { type: 'github', repoId: 1, ref: 'preview/demo' },
      },
    });
    expect(result).toMatchObject({ id: 'dpl_preview', target: 'preview' });
  });

  it('rejects Preview from the production branch before deployment creation', async () => {
    const { client, service } = createHarness();
    client.request.mockResolvedValueOnce({ link: { productionBranch: 'main' } });

    await expect(
      service.createDeployment({
        project: 'demo',
        target: 'preview',
        gitSource: { type: 'github', repoId: 1, ref: 'main' },
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });

    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it('requires gitSource.ref for Preview', async () => {
    const { client, service } = createHarness();

    await expect(
      service.createDeployment({ project: 'demo', target: 'preview', gitSource: { type: 'github' } })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(client.request).not.toHaveBeenCalled();
  });

  it('rejects returned Production target after requested Preview with governed evidence', async () => {
    const { client, service } = createHarness();
    client.request
      .mockResolvedValueOnce({ link: { productionBranch: 'main' } })
      .mockResolvedValueOnce({ uid: 'dpl_prod', target: 'production', name: 'demo' });

    await expect(
      service.createDeployment({
        project: 'demo',
        target: 'preview',
        correlationId: 'corr-123',
        gitSource: { type: 'github', repoId: 1, ref: 'preview/demo' },
      })
    ).rejects.toMatchObject({
      code: 'VERCEL_CONFLICT',
      statusCode: 409,
      details: expect.arrayContaining([
        { field: 'deploymentId', message: 'dpl_prod' },
        { field: 'requestedTarget', message: 'preview' },
        { field: 'returnedTarget', message: 'production' },
        { field: 'gitRef', message: 'preview/demo' },
        { field: 'correlationId', message: 'corr-123' },
      ]),
    });
  });

  it('keeps Production approval and target forwarding unchanged', async () => {
    const { client, policy, service } = createHarness();
    const approval = { approvedBy: 'Kofi', authority: 'user', reason: 'Approved production deployment.' };
    client.request.mockResolvedValueOnce({ uid: 'dpl_prod', target: 'production', name: 'demo' });

    await service.createDeployment({
      project: 'demo',
      target: 'production',
      approval,
      gitSource: { type: 'github', repoId: 1, ref: 'main' },
    });

    expect(policy.requireProductionApproval).toHaveBeenCalledWith(
      approval,
      'deployment for demo'
    );
    expect(client.request).toHaveBeenCalledWith('POST', '/v13/deployments', {
      body: {
        project: 'demo',
        target: 'production',
        gitSource: { type: 'github', repoId: 1, ref: 'main' },
      },
    });
  });

  it('does not affect existing Vercel read operations', async () => {
    const { client, service } = createHarness();
    expect(Object.keys(service)).toEqual(['createDeployment']);
    expect(client.request).not.toHaveBeenCalled();
  });
});
