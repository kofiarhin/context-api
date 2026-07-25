'use strict';

const { getEnv } = require('../config/env');
const serializer = require('../serializers/vercel.serializer');
const { ValidationError, VercelConflictError } = require('../utils/errors');
const { createVercelClient } = require('./vercelClient');
const { createPolicy } = require('./vercelPolicy');

function detail(field, message) {
  return { field, message };
}

function createService(options = {}) {
  const env = options.env || getEnv();
  const client = options.client || createVercelClient(env, options);
  const policy = options.policy || createPolicy(env);
  const encode = encodeURIComponent;

  return Object.freeze({
    async createDeployment(input = {}) {
      const requestedTarget = input.target || 'preview';
      const projectName = input.project || input.name;

      if (input.project) policy.assertProjectAllowed(input.project);
      if (!['preview', 'production'].includes(requestedTarget)) {
        throw new ValidationError('Deployment target must be preview or production.', [
          detail('target', requestedTarget),
        ]);
      }

      if (requestedTarget === 'production') {
        policy.requireProductionApproval(input.approval, `deployment for ${projectName}`);
      }

      const { approval, correlationId, ...body } = input;

      if (requestedTarget === 'preview') {
        const gitRef = body.gitSource && body.gitSource.ref;
        if (typeof gitRef !== 'string' || gitRef.trim() === '') {
          throw new ValidationError('Preview deployments require gitSource.ref.', [
            detail('gitSource.ref', 'Value is required.'),
          ]);
        }

        if (!body.project) {
          throw new ValidationError('Preview deployments require project.', [
            detail('project', 'Value is required to verify the production branch.'),
          ]);
        }

        const project = await client.request('GET', `/v9/projects/${encode(body.project)}`);
        const productionBranch =
          project.productionBranch || (project.link && project.link.productionBranch);

        if (productionBranch && gitRef === productionBranch) {
          throw new ValidationError('Preview deployments must use a non-production Git branch.', [
            detail('gitSource.ref', gitRef),
            detail('productionBranch', productionBranch),
          ]);
        }

        delete body.target;
      }

      const created = await client.request('POST', '/v13/deployments', { body });
      const returnedTarget = created.target || 'preview';

      if (requestedTarget === 'preview' && returnedTarget === 'production') {
        throw new VercelConflictError(
          'Vercel created a Production deployment after Preview was requested.',
          [
            detail('deploymentId', created.uid || created.id || null),
            detail('requestedTarget', requestedTarget),
            detail('returnedTarget', returnedTarget),
            detail('gitRef', body.gitSource && body.gitSource.ref),
            detail('correlationId', correlationId || null),
          ]
        );
      }

      return serializer.deployment({ ...created, target: returnedTarget });
    },
  });
}

module.exports = { createService };
