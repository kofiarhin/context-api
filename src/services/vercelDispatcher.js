'use strict';

const { ValidationError } = require('../utils/errors');
const vercelService = require('./vercel.service');
const vercelLogsService = require('./vercelLogs.service');

const CATALOG = Object.freeze({
  read: Object.freeze({
    getUser: { service: 'vercel', method: 'getUser' },
    listProjects: { service: 'vercel', method: 'listProjects' },
    getProject: { service: 'vercel', method: 'getProject' },
    listDeployments: { service: 'vercel', method: 'listDeployments' },
    getDeployment: { service: 'vercel', method: 'getDeployment' },
    getDeploymentEvents: { service: 'vercel', method: 'getDeploymentEvents' },
    getDeploymentLogs: { service: 'logs', method: 'getDeploymentLogs' },
    listDeploymentFiles: { service: 'vercel', method: 'listDeploymentFiles' },
    listEnvironmentVariables: { service: 'vercel', method: 'listEnvironmentVariables' },
    listProjectDomains: { service: 'vercel', method: 'listProjectDomains' },
    getProjectDomain: { service: 'vercel', method: 'getProjectDomain' },
    listAliases: { service: 'vercel', method: 'listAliases' },
    getDomainConfig: { service: 'vercel', method: 'getDomainConfig' },
    listDnsRecords: { service: 'vercel', method: 'listDnsRecords' },
  }),
  write: Object.freeze({
    createProject: { service: 'vercel', method: 'createProject', status: 201 },
    updateProject: { service: 'vercel', method: 'updateProject' },
    pauseProject: { service: 'vercel', method: 'pauseProject' },
    unpauseProject: { service: 'vercel', method: 'unpauseProject' },
    createDeployment: { service: 'vercel', method: 'createDeployment', status: 201 },
    cancelDeployment: { service: 'vercel', method: 'cancelDeployment' },
    promoteDeployment: { service: 'vercel', method: 'promoteDeployment' },
    rollbackProject: { service: 'vercel', method: 'rollbackProject' },
    createEnvironmentVariable: {
      service: 'vercel',
      method: 'createEnvironmentVariable',
      status: 201,
    },
    updateEnvironmentVariable: { service: 'vercel', method: 'updateEnvironmentVariable' },
    addProjectDomain: { service: 'vercel', method: 'addProjectDomain', status: 201 },
    verifyProjectDomain: { service: 'vercel', method: 'verifyProjectDomain' },
    assignAlias: { service: 'vercel', method: 'assignAlias', status: 201 },
  }),
  destructive: Object.freeze({
    deleteProject: { service: 'vercel', method: 'deleteProject' },
    deleteDeployment: { service: 'vercel', method: 'deleteDeployment' },
    deleteEnvironmentVariable: { service: 'vercel', method: 'deleteEnvironmentVariable' },
    removeProjectDomain: { service: 'vercel', method: 'removeProjectDomain' },
    deleteAlias: { service: 'vercel', method: 'deleteAlias' },
    deleteDnsRecord: { service: 'vercel', method: 'deleteDnsRecord' },
  }),
});

function validateObject(value, field) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object.`);
  }
  return value;
}

function normalizeInput(input) {
  const body = validateObject(input, 'body');
  if (typeof body.operation !== 'string' || body.operation.trim() === '') {
    throw new ValidationError('operation is required.');
  }

  return {
    operation: body.operation.trim(),
    parameters: validateObject(body.parameters, 'parameters'),
    approval: body.approval,
    confirmation: body.confirmation,
  };
}

function createDispatcher(options = {}) {
  const services = {
    vercel: options.vercelService || vercelService,
    logs: options.vercelLogsService || vercelLogsService,
  };

  return Object.freeze({
    async dispatch(category, input) {
      const operations = CATALOG[category];
      if (!operations) throw new ValidationError('dispatcher category is invalid.');

      const normalized = normalizeInput(input);
      const definition = operations[normalized.operation];
      if (!definition) {
        throw new ValidationError(
          `operation is not allowed by the ${category} Vercel dispatcher.`
        );
      }

      const service = services[definition.service];
      const method = service && service[definition.method];
      if (typeof method !== 'function') {
        throw new Error(`Vercel dispatcher method ${definition.method} is unavailable.`);
      }

      const parameters = {
        ...normalized.parameters,
        ...(normalized.approval === undefined ? {} : { approval: normalized.approval }),
        ...(normalized.confirmation === undefined
          ? {}
          : { confirmation: normalized.confirmation }),
      };

      return {
        result: await method.call(service, parameters),
        status: definition.status || 200,
      };
    },
  });
}

const dispatcher = createDispatcher();

module.exports = dispatcher;
module.exports.createDispatcher = createDispatcher;
module.exports.CATALOG = CATALOG;
module.exports.normalizeInput = normalizeInput;
