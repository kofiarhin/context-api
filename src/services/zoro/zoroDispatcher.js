'use strict';

const { isConnected } = require('../../config/database');
const {
  DatabaseUnavailableError,
  ResourceNotFoundError,
  ValidationError,
} = require('../../utils/errors');
const schemas = require('../../validation/schemas');
const { validateWriteBody } = require('../../validation/write');
const { validateIdentifierParam } = require('../../validation/common');
const { getCrudDomain } = require('../../config/crudDomains');
const serializers = require('../../serializers');
const { serializeResolvedContext } = require('../../serializers/contextResolver.serializer');
const { serializeDevOpsLogEntry } = require('../../serializers/devopsLog.serializer');

const catalogue = require('./zoroCatalogue');
const policy = require('./zoroPolicy');

const healthService = require('../health.service');
const contextResolverService = require('../contextResolver.service');
const crudService = require('../crud.service');
const devopsLogService = require('../devopsLog.service');
const githubService = require('../github.service');
const vercelDispatcher = require('../vercelDispatcher');
const herokuService = require('../heroku/heroku.service');

const profileService = require('../profile.service');
const codingConventionService = require('../codingConvention.service');
const projectService = require('../project.service');
const instructionSetService = require('../instructionSet.service');
const ideasHubService = require('../ideasHub.service');
const glossaryService = require('../glossary.service');
const learningService = require('../learning.service');
const taskService = require('../task.service');

/**
 * Envelope fields the unified route accepts.
 *
 * Closed on purpose. A generic method/path proxy is explicitly out of scope, so
 * there is no `method`, `path`, `url`, or `headers` field here and no way to add
 * one through a request.
 */
const ENVELOPE_FIELDS = new Set([
  'operation',
  'parameters',
  'pagination',
  'approval',
  'confirmation',
]);

/**
 * Context read operations, each bound to the same service lister or getter the
 * direct `/api/v1/*` route uses.
 */
const CONTEXT_READS = Object.freeze({
  getProfile: {
    single: true,
    get: () => profileService.getActiveProfile(),
    serializer: serializers.serializeProfile,
    label: 'Active profile',
  },
  listProjects: {
    validator: schemas.validateProjectQuery,
    list: projectService.listProjects,
    serializer: serializers.serializeProject,
    summary: serializers.serializeProjectSummary,
  },
  getProject: {
    param: 'projectId',
    get: projectService.getProjectById,
    serializer: serializers.serializeProject,
    label: 'Project',
  },
  listTasks: {
    validator: schemas.validateTaskQuery,
    list: taskService.listTasks,
    serializer: serializers.serializeTask,
    summary: serializers.serializeTaskSummary,
  },
  getTask: {
    param: 'taskId',
    get: taskService.getTaskById,
    serializer: serializers.serializeTask,
    label: 'Task',
  },
  listCodingConventions: {
    validator: schemas.validateCodingConventionQuery,
    list: codingConventionService.listCodingConventions,
    serializer: serializers.serializeCodingConvention,
    summary: serializers.serializeCodingConventionSummary,
  },
  getCodingConvention: {
    param: 'key',
    get: codingConventionService.getCodingConventionByKey,
    serializer: serializers.serializeCodingConvention,
    label: 'Coding convention',
  },
  listInstructionSets: {
    validator: schemas.validateInstructionSetQuery,
    list: instructionSetService.listInstructionSets,
    serializer: serializers.serializeInstructionSet,
    summary: serializers.serializeInstructionSetSummary,
  },
  getInstructionSet: {
    param: 'key',
    get: instructionSetService.getInstructionSetByKey,
    serializer: serializers.serializeInstructionSet,
    label: 'Instruction set',
  },
  listIdeasHubSections: {
    validator: schemas.validateIdeasHubQuery,
    list: ideasHubService.listIdeasHubSections,
    serializer: serializers.serializeIdeasHubContext,
    summary: serializers.serializeIdeasHubContextSummary,
  },
  getIdeasHubSection: {
    param: 'section',
    get: ideasHubService.getIdeasHubSection,
    serializer: serializers.serializeIdeasHubContext,
    label: 'Ideas Hub section',
  },
  listGlossaryEntries: {
    validator: schemas.validateGlossaryQuery,
    list: glossaryService.listGlossaryEntries,
    serializer: serializers.serializeGlossaryEntry,
    summary: serializers.serializeGlossaryEntrySummary,
  },
  getGlossaryEntry: {
    param: 'term',
    get: glossaryService.getGlossaryEntryByTerm,
    serializer: serializers.serializeGlossaryEntry,
    label: 'Glossary term',
  },
  listLearnings: {
    validator: schemas.validateLearningQuery,
    list: learningService.listLearnings,
    serializer: serializers.serializeLearning,
    summary: serializers.serializeLearningSummary,
  },
  getLearning: {
    param: 'learningId',
    get: learningService.getLearningById,
    serializer: serializers.serializeLearning,
    label: 'Learning',
  },
});

function assertPlainObject(value, field) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object.`);
  }

  return value;
}

/**
 * Normalizes the request envelope.
 *
 * `operation` may be omitted only for single-operation dispatchers that declare
 * a `defaultOperation` (health.check, context.resolve).
 */
function normalizeEnvelope(dispatcher, body) {
  const envelope = assertPlainObject(body, 'body');

  for (const key of Object.keys(envelope)) {
    if (!ENVELOPE_FIELDS.has(key)) {
      throw new ValidationError(`Unknown request field: ${key}.`, [
        { field: key, message: `Allowed fields: ${[...ENVELOPE_FIELDS].join(', ')}.` },
      ]);
    }
  }

  let operation = envelope.operation;

  if (operation === undefined && dispatcher.defaultOperation) {
    operation = dispatcher.defaultOperation;
  }

  if (typeof operation !== 'string' || operation.trim() === '') {
    throw new ValidationError('operation is required.');
  }

  return {
    operation: operation.trim(),
    parameters: assertPlainObject(envelope.parameters, 'parameters'),
    pagination: assertPlainObject(envelope.pagination, 'pagination'),
    approval: envelope.approval,
    confirmation: envelope.confirmation,
  };
}

/**
 * Converts a dispatcher pagination block into the query object the existing
 * query validators already understand, so cursor, offset, view, and filter
 * semantics match the direct routes exactly.
 */
function toQuery(parameters, pagination) {
  const query = {};

  for (const [key, value] of Object.entries({ ...parameters, ...pagination })) {
    if (value === undefined || value === null) {
      continue;
    }

    query[key] = Array.isArray(value) ? value.map(String) : String(value);
  }

  return query;
}

async function runContextRead(operationName, { parameters, pagination }) {
  const definition = CONTEXT_READS[operationName];

  if (definition.single) {
    const record = await definition.get();

    if (!record) {
      throw new ResourceNotFoundError(`${definition.label} was not found.`);
    }

    return { result: definition.serializer(record) };
  }

  if (definition.param) {
    const identifier = validateIdentifierParam(parameters[definition.param], definition.param);
    const record = await definition.get(identifier);

    if (!record) {
      throw new ResourceNotFoundError(`${definition.label} "${identifier}" was not found.`);
    }

    return { result: definition.serializer(record) };
  }

  const { filters, pagination: normalized } = definition.validator(toQuery(parameters, pagination));
  const outcome = await definition.list(filters, normalized);
  const serializer =
    normalized.view === 'summary' ? definition.summary || definition.serializer : definition.serializer;
  const mode = outcome.mode || normalized.mode;

  return {
    result: outcome.items.map(serializer),
    collection: true,
    meta:
      mode === 'cursor'
        ? {
            mode,
            limit: outcome.limit || normalized.limit,
            hasNextPage: Boolean(outcome.hasNextPage),
            nextCursor: outcome.nextCursor || null,
            ...(Number.isInteger(outcome.total) ? { total: outcome.total } : {}),
          }
        : {
            mode: 'offset',
            page: outcome.page || normalized.page,
            pageSize: outcome.pageSize || normalized.pageSize,
            ...(Number.isInteger(outcome.total) ? { total: outcome.total } : {}),
          },
  };
}

async function runContextWrite(operation, { parameters }) {
  const domain = getCrudDomain(operation.domain);
  const { identifier, ...rest } = parameters;

  if (operation.method === 'create') {
    const body = validateWriteBody(operation.domain, 'create', rest);

    return { result: await crudService.createRecord(operation.domain, body), status: 201 };
  }

  // A singleton domain (profile) addresses its one record without an
  // identifier, exactly as the direct PATCH /profile route does.
  const key =
    domain.singleton && identifier === undefined
      ? null
      : validateIdentifierParam(identifier, 'identifier');

  if (operation.method === 'archive') {
    return { result: await crudService.archiveRecord(operation.domain, key) };
  }

  const body = validateWriteBody(operation.domain, 'patch', rest);

  return { result: await crudService.updateRecord(operation.domain, key, body) };
}

async function runOpslog(operation, { parameters, pagination }) {
  if (operation.method === 'appendEntry') {
    return { result: await devopsLogService.appendEntry(parameters), status: 201 };
  }

  if (operation.method === 'getEntryById') {
    const entry = await devopsLogService.getEntryById(parameters.entryId);

    if (!entry) {
      throw new ResourceNotFoundError(
        `Operations log entry "${parameters.entryId}" was not found.`
      );
    }

    return { result: serializeDevOpsLogEntry(entry) };
  }

  const { filters, pagination: normalized } = schemas.validateOperationsLogQuery(
    toQuery(parameters, pagination)
  );
  const outcome = await devopsLogService.listEntries(filters, normalized);
  const mode = outcome.mode || normalized.mode;

  return {
    result: outcome.items.map(serializeDevOpsLogEntry),
    collection: true,
    meta:
      mode === 'cursor'
        ? {
            mode,
            limit: outcome.limit || normalized.limit,
            hasNextPage: Boolean(outcome.hasNextPage),
            nextCursor: outcome.nextCursor || null,
            ...(Number.isInteger(outcome.total) ? { total: outcome.total } : {}),
          }
        : {
            mode: 'offset',
            page: outcome.page || normalized.page,
            pageSize: outcome.pageSize || normalized.pageSize,
            ...(Number.isInteger(outcome.total) ? { total: outcome.total } : {}),
          },
  };
}

/**
 * Executes one catalogued operation against its target service.
 *
 * Every branch calls a service function directly. None of them builds a URL or
 * issues an HTTP request into this application.
 */
async function runOperation(operation, request, services) {
  switch (operation.target) {
    case 'health':
      return { result: services.health.getHealthSnapshot().payload };

    case 'contextResolver': {
      const { filters } = schemas.validateContextResolverQuery(
        toQuery(request.parameters, request.pagination)
      );

      return { result: serializeResolvedContext(await services.contextResolver.resolveContext(filters)) };
    }

    case 'contextRead':
      return runContextRead(operation.method, request);

    case 'contextWrite':
      return runContextWrite(operation, request);

    case 'opslog':
      return runOpslog(operation, request);

    case 'github': {
      const result = await services.github[operation.method](request.parameters);

      if (operation.collection) {
        return { result: result.data, collection: true, meta: result.meta };
      }

      return { result, status: operation.status };
    }

    case 'vercel': {
      // Delegating to the existing Vercel dispatcher reuses its catalogue,
      // policy, and serializers rather than re-deriving them here.
      const outcome = await services.vercel.dispatch(operation.category, {
        operation: operation.method,
        parameters: request.parameters,
        approval: request.approval,
        confirmation: request.confirmation,
      });

      return { result: outcome.result, status: outcome.status };
    }

    case 'heroku': {
      const { params = {}, query = {}, body = {}, ...rest } = request.parameters;
      const outcome = await services.heroku.execute(operation.descriptor, {
        ...params,
        ...rest,
        body,
        query,
        approval: request.approval,
      });

      return { result: outcome.data, status: outcome.status, meta: outcome.meta };
    }

    default:
      throw new Error(`Unsupported dispatcher target: ${operation.target}.`);
  }
}

function createDispatcher(overrides = {}) {
  const services = {
    health: overrides.healthService || healthService,
    contextResolver: overrides.contextResolverService || contextResolverService,
    github: overrides.githubService || githubService,
    vercel: overrides.vercelDispatcher || vercelDispatcher,
    heroku: overrides.herokuService || herokuService,
    ...overrides.services,
  };
  const databaseIsConnected = overrides.isConnected || isConnected;

  return Object.freeze({
    /**
     * Resolves, authorises, and executes one dispatcher operation.
     */
    async dispatch(operationId, body) {
      const dispatcher = catalogue.getDispatcher(operationId);

      if (!dispatcher) {
        throw new ResourceNotFoundError(
          `Unknown engineering operation "${operationId}".`,
          catalogue.DISPATCHER_IDS.map((id) => ({ field: 'operationId', message: id }))
        );
      }

      const request = normalizeEnvelope(dispatcher, body);
      const operation = catalogue.getOperation(dispatcher, request.operation);

      if (!operation) {
        throw new ValidationError(
          `Operation "${request.operation}" is not allowed by the ${operationId} dispatcher.`,
          Object.keys(dispatcher.operations).map((name) => ({ field: 'operation', message: name }))
        );
      }

      // The unified route is mounted ahead of the global database guard so a
      // Mongo outage cannot take the provider dispatchers offline. The
      // database-backed dispatchers check availability for themselves.
      if (dispatcher.requiresDatabase && !databaseIsConnected()) {
        throw new DatabaseUnavailableError();
      }

      policy.enforce({
        operation,
        parameters: request.parameters,
        approval: request.approval,
        confirmation: request.confirmation,
      });

      const outcome = await runOperation(operation, request, services);

      return {
        result: outcome.result,
        status: outcome.status || 200,
        collection: Boolean(outcome.collection),
        meta: {
          ...(outcome.meta || {}),
          operationId,
          operation: request.operation,
          classification: operation.classification,
        },
      };
    },
  });
}

const dispatcher = createDispatcher();

module.exports = {
  dispatch: dispatcher.dispatch.bind(dispatcher),
  createDispatcher,
  normalizeEnvelope,
  toQuery,
  ENVELOPE_FIELDS,
  CONTEXT_READS,
};
