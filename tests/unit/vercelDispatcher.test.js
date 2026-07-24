'use strict';

const { createDispatcher, CATALOG } = require('../../src/services/vercelDispatcher');

function createServices() {
  const vercelService = {};
  const vercelLogsService = {};

  for (const operations of Object.values(CATALOG)) {
    for (const definition of Object.values(operations)) {
      const target = definition.service === 'logs' ? vercelLogsService : vercelService;
      target[definition.method] = jest.fn().mockResolvedValue({ ok: definition.method });
    }
  }

  return { vercelService, vercelLogsService };
}

describe('Vercel grouped dispatcher', () => {
  it('dispatches read operations with parameters', async () => {
    const services = createServices();
    const dispatcher = createDispatcher(services);

    const outcome = await dispatcher.dispatch('read', {
      operation: 'getProject',
      parameters: { project: 'example-project' },
    });

    expect(outcome).toEqual({ result: { ok: 'getProject' }, status: 200 });
    expect(services.vercelService.getProject).toHaveBeenCalledWith({
      project: 'example-project',
    });
  });

  it('routes deployment logs to the bounded logs service', async () => {
    const services = createServices();
    const dispatcher = createDispatcher(services);

    await dispatcher.dispatch('read', {
      operation: 'getDeploymentLogs',
      parameters: { deployment: 'dpl_1', limit: 20 },
    });

    expect(services.vercelLogsService.getDeploymentLogs).toHaveBeenCalledWith({
      deployment: 'dpl_1',
      limit: 20,
    });
  });

  it('passes production approval without putting it inside parameters', async () => {
    const services = createServices();
    const dispatcher = createDispatcher(services);
    const approval = {
      confirmed: true,
      scope: 'production',
      reason: 'Kofi approved production promotion.',
    };

    await dispatcher.dispatch('write', {
      operation: 'promoteDeployment',
      parameters: { project: 'example-project', deployment: 'dpl_1' },
      approval,
    });

    expect(services.vercelService.promoteDeployment).toHaveBeenCalledWith({
      project: 'example-project',
      deployment: 'dpl_1',
      approval,
    });
  });

  it('returns 201 for create operations', async () => {
    const services = createServices();
    const dispatcher = createDispatcher(services);

    const outcome = await dispatcher.dispatch('write', {
      operation: 'createDeployment',
      parameters: { project: 'example-project' },
    });

    expect(outcome.status).toBe(201);
  });

  it('passes exact destructive confirmation', async () => {
    const services = createServices();
    const dispatcher = createDispatcher(services);
    const confirmation = {
      confirmed: true,
      resourceType: 'deployment',
      resourceId: 'dpl_1',
      reason: 'Kofi approved deployment deletion.',
    };

    await dispatcher.dispatch('destructive', {
      operation: 'deleteDeployment',
      parameters: { deployment: 'dpl_1' },
      confirmation,
    });

    expect(services.vercelService.deleteDeployment).toHaveBeenCalledWith({
      deployment: 'dpl_1',
      confirmation,
    });
  });

  it('rejects an operation in the wrong dispatcher category', async () => {
    const dispatcher = createDispatcher(createServices());

    await expect(
      dispatcher.dispatch('read', { operation: 'deleteProject', parameters: {} })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('rejects missing operations and non-object parameters', async () => {
    const dispatcher = createDispatcher(createServices());

    await expect(dispatcher.dispatch('read', {})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      dispatcher.dispatch('read', { operation: 'getUser', parameters: [] })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
