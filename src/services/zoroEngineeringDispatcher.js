'use strict';

const { getConnectionState, isConnected } = require('../config/database');
const { getEnv } = require('../config/env');
const { getCrudDomain } = require('../config/crudDomains');
const serializers = require('../serializers');
const schemas = require('../validation/schemas');
const { validateIdentifierParam } = require('../validation/common');
const { validateWriteBody } = require('../validation/write');
const githubSchemas = require('../validation/github.schemas');
const profileService = require('./profile.service');
const codingConventionService = require('./codingConvention.service');
const projectService = require('./project.service');
const taskService = require('./task.service');
const instructionSetService = require('./instructionSet.service');
const ideasHubService = require('./ideasHub.service');
const glossaryService = require('./glossary.service');
const learningService = require('./learning.service');
const contextResolverService = require('./contextResolver.service');
const crudService = require('./crud.service');
const githubService = require('./github.service');
const vercelDispatcher = require('./vercelDispatcher');
const herokuService = require('./heroku/heroku.service');
const herokuRoutes = require('./heroku/herokuRoutes');
const devOpsLogService = require('./devOpsLog.service');
const { buildEtag } = require('../utils/responses');
const {
  AppError,
  GithubForbiddenError,
  ResourceNotFoundError,
  ValidationError,
} = require('../utils/errors');

const DISPATCHER_IDS = Object.freeze([
  'health.check',
  'context.resolve',
  'engineering.read',
  'engineering.write',
  'engineering.archive',
  'github.read',
  'github.write',
  'github.review',
  'github.destructive',
  'vercel.read',
  'vercel.write',
  'vercel.destructive',
  'heroku.execute',
  'opslog.read',
  'opslog.write',
]);

const CONTEXT_DOMAINS = Object.freeze({
  profile: {
    identifier: 'key',
    get: profileService.getActiveProfile,
    serializer: serializers.serializeProfile,
  },
  codingConventions: {
    identifier: 'key',
    list: codingConventionService.listCodingConventions,
    get: codingConventionService.getCodingConventionByKey,
    queryValidator: schemas.validateCodingConventionQuery,
    serializer: serializers.serializeCodingConvention,
    summarySerializer: serializers.serializeCodingConventionSummary,
  },
  projects: {
    identifier: 'projectId',
    list: projectService.listProjects,
    get: projectService.getProjectById,
    queryValidator: schemas.validateProjectQuery,
    serializer: serializers.serializeProject,
    summarySerializer: serializers.serializeProjectSummary,
  },
  tasks: {
    identifier: 'taskId',
    list: taskService.listTasks,
    get: taskService.getTaskById,
    queryValidator: schemas.validateTaskQuery,
    serializer: serializers.serializeTask,
    summarySerializer: serializers.serializeTaskSummary,
  },
  instructionSets: {
    identifier: 'key',
    list: instructionSetService.listInstructionSets,
    get: instructionSetService.getInstructionSetByKey,
    queryValidator: schemas.validateInstructionSetQuery,
    serializer: serializers.serializeInstructionSet,
    summarySerializer: serializers.serializeInstructionSetSummary,
  },
  ideasHub: {
    identifier: 'section',
    list: ideasHubService.listIdeasHubSections,
    get: ideasHubService.getIdeasHubSection,
    queryValidator: schemas.validateIdeasHubQuery,
    serializer: serializers.serializeIdeasHubContext,
    summarySerializer: serializers.serializeIdeasHubContextSummary,
  },
  glossary: {
    identifier: 'term',
    list: glossaryService.listGlossaryEntries,
    get: glossaryService.getGlossaryEntryByTerm,
    queryValidator: schemas.validateGlossaryQuery,
    serializer: serializers.serializeGlossaryEntry,
    summarySerializer: serializers.serializeGlossaryEntrySummary,
  },
  learnings: {
    identifier: 'learningId',
    list: learningService.listLearnings,
    get: learningService.getLearningById,
    queryValidator: schemas.validateLearningQuery,
    serializer: serializers.serializeLearning,
    summarySerializer: serializers.serializeLearningSummary,
  },
});

const ENGINEERING_READ_CATALOGUE = Object.freeze({
  getProfile: { domain: 'profile', kind: 'get' },
  listCodingConventions: { domain: 'codingConventions', kind: 'list' },
  getCodingConvention: { domain: 'codingConventions', kind: 'get' },
  listProjects: { domain: 'projects', kind: 'list' },
  getProject: { domain: 'projects', kind: 'get' },
  listTasks: { domain: 'tasks', kind: 'list' },
  getTask: { domain: 'tasks', kind: 'get' },
  listInstructionSets: { domain: 'instructionSets', kind: 'list' },
  getInstructionSet: { domain: 'instructionSets', kind: 'get' },
  listIdeasHubSections: { domain: 'ideasHub', kind: 'list' },
  getIdeasHubSection: { domain: 'ideasHub', kind: 'get' },
  listGlossaryEntries: { domain: 'glossary', kind: 'list' },
  getGlossaryEntry: { domain: 'glossary', kind: 'get' },
  listLearnings: { domain: 'learnings', kind: 'list' },
  getLearning: { domain: 'learnings', kind: 'get' },
});

const ENGINEERING_WRITE_CATALOGUE = Object.freeze({
  createProfile: { domain: 'profile', kind: 'create' },
  updateProfile: { domain: 'profile', kind: 'update' },
  createCodingConvention: { domain: 'codingConventions', kind: 'create' },
  updateCodingConvention: { domain: 'codingConventions', kind: 'update' },
  createProject: { domain: 'projects', kind: 'create' },
  updateProject: { domain: 'projects', kind: 'update' },
  createTask: { domain: 'tasks', kind: 'create' },
  updateTask: { domain: 'tasks', kind: 'update' },
  createInstructionSet: { domain: 'instructionSets', kind: 'create' },
  updateInstructionSet: { domain: 'instructionSets', kind: 'update' },
  createIdeasHubSection: { domain: 'ideasHub', kind: 'create' },
  updateIdeasHubSection: { domain: 'ideasHub', kind: 'update' },
  createGlossaryEntry: { domain: 'glossary', kind: 'create' },
  updateGlossaryEntry: { domain: 'glossary', kind: 'update' },
  createLearning: { domain: 'learnings', kind: 'create' },
  updateLearning: { domain: 'learnings', kind: 'update' },
});

const ENGINEERING_ARCHIVE_CATALOGUE = Object.freeze({
  archiveProfile: { domain: 'profile' },
  archiveCodingConvention: { domain: 'codingConventions' },
  archiveProject: { domain: 'projects' },
  archiveTask: { domain: 'tasks' },
  archiveInstructionSet: { domain: 'instructionSets' },
  archiveIdeasHubSection: { domain: 'ideasHub' },
  archiveGlossaryEntry: { domain: 'glossary' },
  archiveLearning: { domain: 'learnings' },
});

const GITHUB_CATALOGUES = Object.freeze({
  read: Object.freeze({
    listRepositories: 'listRepositories',
    getContent: 'getContent',
    getFile: 'getContent',
    listBranches: 'listBranches',
    getPullRequest: 'getPullRequest',
  }),
  write: Object.freeze({
    createBranch: 'createBranch',
    updateBranch: 'updateBranch',
    createFile: 'createFile',
    updateFile: 'updateFile',
    createPullRequest: 'createPullRequest',
    updatePullRequest: 'updatePullRequest',
  }),
  review: Object.freeze({
    getPullRequest: 'getPullRequest',
    updatePullRequest: 'updatePullRequest',
    mergePullRequest: 'mergePullRequest',
  }),
  destructive: Object.freeze({
    deleteFile: 'deleteFile',
  }),
});

const HEROKU_CATALOGUE = Object.freeze(
  Object.fromEntries(herokuRoutes.map((descriptor) => [descriptor.operationId, descriptor]))
);

const CATALOGUES = Object.freeze({
  'health.check': Object.freeze({ getHealth: true }),
  'context.resolve': Object.freeze({ resolveContext: true }),
  'engineering.read': ENGINEERING_READ_CATALOGUE,
  'engineering.write': ENGINEERING_WRITE_CATALOGUE,
  'engineering.archive': ENGINEERING_ARCHIVE_CATALOGUE,
  'github.read': GITHUB_CATALOGUES.read,
  'github.write': GITHUB_CATALOGUES.write,
  'github.review': GITHUB_CATALOGUES.review,
  'github.destructive': GITHUB_CATALOGUES.destructive,
  'vercel.read': vercelDispatcher.CATALOG.read,
  'vercel.write': vercelDispatcher.CATALOG.write,
  'vercel.destructive': vercelDispatcher.CATALOG.destructive,
  'heroku.execute': HEROKU_CATALOGUE,
  'opslog.read': Object.freeze(
    Object.fromEntries(devOpsLogService.READ_OPERATIONS.map((operation) => [operation, true]))
  ),
  'opslog.write': Object.freeze(
    Object.fromEntries(devOpsLogService.WRITE_OPERATIONS.map((operation) => [operation, true]))
  ),
});

const ENVELOPE_FIELDS = new Set([
  'operation',
  'params',
  'query',
  'body',
  'expectedEtag',
  'expectedSha',
  'expectedHeadSha',
  'expectedCurrentRelease',
  'range',
  'approval',
  'confirmation',
  'event',
]);

const REDACTED_RESULT_KEYS =
  /token|password|authorization|credential|private.?key|mongodb.?uri|config.?value|old.?value|new.?value/i;
const TEMPORARY_URL_KEYS =
  /^(?:logplex_url|logplexUrl|signedUrl|signed_url|downloadUrl|download_url|sourceUrl|source_url)$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(field, message) {
  throw new ValidationError('Request validation failed.', [{ field, message }]);
}

function normalizeEnvelope(raw) {
  const envelope = raw === undefined ? {} : raw;
  if (!isPlainObject(envelope)) {
    fail('body', 'Request body must be a JSON object.');
  }

  const unknown = Object.keys(envelope).filter((key) => !ENVELOPE_FIELDS.has(key));
  if (unknown.length > 0) {
    fail(unknown[0], 'Unknown request field.');
  }

  if (typeof envelope.operation !== 'string' || envelope.operation.trim() === '') {
    fail('operation', 'Value is required.');
  }

  for (const field of ['params', 'query', 'body']) {
    if (envelope[field] !== undefined && !isPlainObject(envelope[field])) {
      fail(field, 'Value must be a JSON object.');
    }
  }

  return {
    ...envelope,
    operation: envelope.operation.trim(),
    params: envelope.params || {},
    query: envelope.query || {},
    body: envelope.body || {},
  };
}

function assertOperation(operationId, operation) {
  const catalogue = CATALOGUES[operationId];
  if (!catalogue) {
    throw new ResourceNotFoundError(
      `Zoro engineering dispatcher "${operationId}" was not found.`
    );
  }

  if (!Object.prototype.hasOwnProperty.call(catalogue, operation)) {
    fail(
      'operation',
      `Operation "${operation}" is not registered for dispatcher "${operationId}".`
    );
  }
}

function policyDenied(message, details = []) {
  throw new AppError('POLICY_DENIED', message, 403, details);
}

function preconditionFailed(message, details = []) {
  throw new AppError('PRECONDITION_FAILED', message, 412, details);
}

function requireApproval(envelope, scope) {
  const approval = envelope.approval;
  if (
    !isPlainObject(approval) ||
    approval.approvedBy !== 'Kofi' ||
    typeof approval.authority !== 'string' ||
    approval.authority.trim().length < 3 ||
    typeof approval.reason !== 'string' ||
    approval.reason.trim().length < 8
  ) {
    policyDenied(`${scope} requires explicit Kofi approval evidence.`);
  }
  return approval;
}

function requireConfirmation(envelope, expectedResourceId, scope) {
  const confirmation = envelope.confirmation;
  if (
    !isPlainObject(confirmation) ||
    confirmation.confirmed !== true ||
    typeof confirmation.resourceType !== 'string' ||
    typeof confirmation.resourceId !== 'string' ||
    confirmation.resourceId !== expectedResourceId ||
    typeof confirmation.reason !== 'string' ||
    confirmation.reason.trim().length < 8
  ) {
    policyDenied(`${scope} requires exact destructive confirmation.`, [
      { field: 'confirmation.resourceId', message: expectedResourceId },
    ]);
  }
  return confirmation;
}

function assertRepositoryAllowed(policy, owner, repo) {
  const allowlist = policy && policy.repositoryAllowlist;
  if (!allowlist) {
    return;
  }

  const fullName = `${owner}/${repo}`.toLowerCase();
  if (!allowlist.has(fullName)) {
    throw new GithubForbiddenError('This repository is not permitted by the gateway policy.', [
      { field: 'repository', message: fullName },
    ]);
  }
}

function sanitizeResult(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeResult);
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized = {};
  for (const [key, nested] of Object.entries(value)) {
    if (REDACTED_RESULT_KEYS.test(key) || TEMPORARY_URL_KEYS.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeResult(nested);
    }
  }
  return sanitized;
}

async function getCurrentContextResource(domainName, rawIdentifier) {
  const definition = CONTEXT_DOMAINS[domainName];
  const identifier =
    domainName === 'profile'
      ? null
      : validateIdentifierParam(rawIdentifier, definition.identifier);
  const record = await definition.get(identifier);

  if (!record) {
    const label = getCrudDomain(domainName).label;
    throw new ResourceNotFoundError(`${label} was not found.`);
  }

  return definition.serializer(record);
}

function contextIdentifier(definition, envelope) {
  if (definition.domain === 'profile') {
    return null;
  }
  const field = CONTEXT_DOMAINS[definition.domain].identifier;
  return envelope.params[field] ?? envelope.params.id;
}

async function executeEngineeringRead(definition, envelope) {
  const domain = CONTEXT_DOMAINS[definition.domain];

  if (definition.kind === 'get') {
    const result = await getCurrentContextResource(
      definition.domain,
      contextIdentifier(definition, envelope)
    );
    return { result, meta: { etag: buildEtag(result) } };
  }

  const validated = domain.queryValidator(envelope.query);
  const listed = await domain.list(validated.filters, validated.pagination);
  const serializer =
    validated.pagination.view === 'summary'
      ? domain.summarySerializer
      : domain.serializer;
  const result = listed.items.map(serializer);
  const mode = listed.mode || validated.pagination.mode;
  const meta =
    mode === 'cursor'
      ? {
          count: result.length,
          limit: listed.limit || validated.pagination.limit,
          hasNextPage: Boolean(listed.hasNextPage),
          nextCursor: listed.nextCursor || null,
          ...(Number.isInteger(listed.total) ? { total: listed.total } : {}),
        }
      : {
          count: result.length,
          total: listed.total,
          page: listed.page || validated.pagination.page,
          pageSize: listed.pageSize || validated.pagination.pageSize,
        };

  return { result, meta };
}

async function assertContextEtag(definition, envelope) {
  const current = await getCurrentContextResource(
    definition.domain,
    contextIdentifier(definition, envelope)
  );
  const currentEtag = buildEtag(current);
  const expectedEtag =
    envelope.expectedEtag || (envelope.approval && envelope.approval.expectedEtag);

  if (!expectedEtag || expectedEtag !== currentEtag) {
    preconditionFailed('The context resource has changed since it was read.', [
      {
        field: 'expectedEtag',
        message: expectedEtag ? 'Does not match the current ETag.' : 'Value is required.',
      },
    ]);
  }
}

async function executeEngineeringWrite(definition, envelope) {
  const mode = definition.kind === 'create' ? 'create' : 'patch';
  const body = validateWriteBody(definition.domain, mode, envelope.body);

  if (definition.kind === 'create') {
    return {
      result: await crudService.createRecord(definition.domain, body),
      status: 201,
    };
  }

  await assertContextEtag(definition, envelope);
  const identifier = contextIdentifier(definition, envelope);
  return {
    result: await crudService.updateRecord(definition.domain, identifier, body),
  };
}

async function executeEngineeringArchive(definition, envelope) {
  await assertContextEtag(definition, envelope);
  const identifier = contextIdentifier(definition, envelope);
  return {
    result: await crudService.archiveRecord(definition.domain, identifier),
  };
}

function serializeResolvedContext(resolved) {
  const profile = resolved.profile
    ? serializers.serializeProfileSummary(resolved.profile)
    : null;
  const project = resolved.project
    ? serializers.serializeProjectSummary(resolved.project)
    : null;
  const task = resolved.task ? serializers.serializeTaskSummary(resolved.task) : null;
  const instructionSets = resolved.instructionSets.map(
    serializers.serializeInstructionSetSummary
  );
  const codingConventions = resolved.codingConventions.map(
    serializers.serializeCodingConventionSummary
  );

  return {
    resolvedFor: resolved.resolvedFor,
    revision: resolved.revision,
    profile,
    project,
    task,
    instructionSets,
    codingConventions,
  };
}

function githubInput(operation, envelope) {
  const input = { ...envelope.body, ...envelope.query, ...envelope.params };

  if (operation === 'listRepositories') {
    return githubSchemas.querySchemas.listRepositories(input);
  }
  if (operation === 'getContent') {
    return githubSchemas.querySchemas.getContent(input);
  }
  if (operation === 'listBranches') {
    return githubSchemas.querySchemas.listBranches(input);
  }
  if (operation === 'createBranch') {
    return githubSchemas.bodySchemas.createBranch(input);
  }
  if (operation === 'updateBranch') {
    const branch = githubSchemas.paramSchemas.branch(input.branch);
    const validated = githubSchemas.bodySchemas.updateBranch({
      owner: input.owner,
      repo: input.repo,
      expectedCurrentSha: envelope.expectedSha || input.expectedCurrentSha,
      newSha: input.newSha,
    });
    return { ...validated, branch };
  }
  if (operation === 'createFile') {
    return githubSchemas.bodySchemas.createFile(input);
  }
  if (operation === 'updateFile') {
    return githubSchemas.bodySchemas.updateFile({
      ...input,
      sha: envelope.expectedSha || input.sha,
    });
  }
  if (operation === 'deleteFile') {
    return githubSchemas.bodySchemas.deleteFile({
      ...input,
      sha: envelope.expectedSha || input.sha,
    });
  }

  const pullNumber = githubSchemas.paramSchemas.pullNumber(input.pullNumber);
  if (operation === 'getPullRequest') {
    return {
      ...githubSchemas.querySchemas.pullRequestRepository({
        owner: input.owner,
        repo: input.repo,
      }),
      pullNumber,
    };
  }
  if (operation === 'updatePullRequest') {
    const updateBody = {
      owner: input.owner,
      repo: input.repo,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(input.state === undefined ? {} : { state: input.state }),
      ...(input.base === undefined ? {} : { base: input.base }),
      ...(input.maintainerCanModify === undefined
        ? {}
        : { maintainerCanModify: input.maintainerCanModify }),
    };
    return {
      ...githubSchemas.bodySchemas.updatePullRequest(updateBody),
      pullNumber,
    };
  }
  if (operation === 'mergePullRequest') {
    return {
      ...githubSchemas.bodySchemas.mergePullRequest({
        owner: input.owner,
        repo: input.repo,
        expectedHeadSha: envelope.expectedHeadSha || input.expectedHeadSha,
        mergeMethod: input.mergeMethod,
        ...(input.commitTitle === undefined ? {} : { commitTitle: input.commitTitle }),
        ...(input.commitMessage === undefined
          ? {}
          : { commitMessage: input.commitMessage }),
      }),
      pullNumber,
    };
  }

  fail('operation', 'Unknown GitHub operation.');
  return null;
}

async function executeGithub(category, operation, envelope, context) {
  const serviceOperation = GITHUB_CATALOGUES[category][operation];
  const input = githubInput(serviceOperation, envelope);
  assertRepositoryAllowed(context.policy, input.owner, input.repo);

  if (serviceOperation === 'mergePullRequest') {
    const approval = requireApproval(envelope, 'Pull-request merge');
    if (
      approval.expectedHeadSha !== undefined &&
      approval.expectedHeadSha !== input.expectedHeadSha
    ) {
      preconditionFailed('Approval evidence does not match the expected pull-request head SHA.');
    }
  }

  if (category === 'destructive') {
    if (!context.policy || !context.policy.destructiveOperationsEnabled) {
      policyDenied('Unified destructive operations are disabled.');
    }
    requireApproval(envelope, 'GitHub destructive operation');
    const resourceId = `${input.owner}/${input.repo}:${input.branch}:${input.path}`;
    requireConfirmation(envelope, resourceId, 'GitHub destructive operation');
  }

  const result = await githubService[serviceOperation](input);
  return {
    result,
    status:
      serviceOperation === 'createBranch' ||
      serviceOperation === 'createFile' ||
      serviceOperation === 'createPullRequest'
        ? 201
        : 200,
  };
}

async function executeVercel(category, envelope) {
  const parameters = {
    ...envelope.body,
    ...envelope.query,
    ...envelope.params,
    ...(envelope.expectedEtag === undefined
      ? {}
      : { expectedEtag: envelope.expectedEtag }),
    ...(envelope.expectedSha === undefined ? {} : { expectedSha: envelope.expectedSha }),
    ...(envelope.expectedCurrentRelease === undefined
      ? {}
      : { expectedCurrentRelease: envelope.expectedCurrentRelease }),
  };
  const outcome = await vercelDispatcher.dispatch(category, {
    operation: envelope.operation,
    parameters,
    approval: envelope.approval,
    confirmation: envelope.confirmation,
  });
  return { result: outcome.result, status: outcome.status };
}

async function executeHeroku(envelope) {
  const descriptor = HEROKU_CATALOGUE[envelope.operation];
  const input = {
    ...envelope.params,
    body: {
      ...envelope.body,
      ...(envelope.expectedCurrentRelease === undefined
        ? {}
        : { expectedCurrentRelease: envelope.expectedCurrentRelease }),
    },
    query: envelope.query,
    approval: envelope.approval,
    expectedEtag: envelope.expectedEtag,
    range: envelope.range,
  };
  const outcome = await herokuService.execute(descriptor, input);
  return {
    result: outcome.data,
    meta: outcome.meta,
    status: outcome.status,
  };
}

function createZoroEngineeringDispatcher(options = {}) {
  const dependencies = {
    devOpsLogService: options.devOpsLogService || devOpsLogService,
  };

  return Object.freeze({
    async dispatch(operationId, rawEnvelope, context = {}) {
      const envelope = normalizeEnvelope(rawEnvelope);
      assertOperation(operationId, envelope.operation);

      let outcome;

      if (operationId === 'health.check') {
        const connected = isConnected();
        outcome = {
          result: {
            status: connected ? 'ok' : 'degraded',
            database: getConnectionState(),
            environment: getEnv().nodeEnv,
            timestamp: new Date().toISOString(),
          },
          status: connected ? 200 : 503,
        };
      } else if (operationId === 'context.resolve') {
        const normalized = schemas.validateContextResolverQuery({
          ...envelope.query,
          ...envelope.params,
        });
        const resolved = await contextResolverService.resolveContext(normalized.filters);
        outcome = { result: serializeResolvedContext(resolved) };
      } else if (operationId === 'engineering.read') {
        outcome = await executeEngineeringRead(
          ENGINEERING_READ_CATALOGUE[envelope.operation],
          envelope
        );
      } else if (operationId === 'engineering.write') {
        outcome = await executeEngineeringWrite(
          ENGINEERING_WRITE_CATALOGUE[envelope.operation],
          envelope
        );
      } else if (operationId === 'engineering.archive') {
        outcome = await executeEngineeringArchive(
          ENGINEERING_ARCHIVE_CATALOGUE[envelope.operation],
          envelope
        );
      } else if (operationId.startsWith('github.')) {
        outcome = await executeGithub(
          operationId.split('.')[1],
          envelope.operation,
          envelope,
          context
        );
      } else if (operationId.startsWith('vercel.')) {
        outcome = await executeVercel(operationId.split('.')[1], envelope);
      } else if (operationId === 'heroku.execute') {
        outcome = await executeHeroku(envelope);
      } else if (operationId === 'opslog.read') {
        outcome = {
          result: await dependencies.devOpsLogService.executeRead(envelope.operation, {
            ...envelope.query,
            ...envelope.params,
          }),
        };
      } else if (operationId === 'opslog.write') {
        outcome = {
          result: await dependencies.devOpsLogService.append(
            envelope.operation,
            envelope.event || envelope.body,
            {
              requestId: context.requestId,
              correlationId: context.correlationId,
            }
          ),
          status: 201,
        };
      }

      return {
        ...outcome,
        result: sanitizeResult(outcome.result),
        status: outcome.status || 200,
      };
    },
  });
}

const dispatcher = createZoroEngineeringDispatcher();

module.exports = {
  dispatch: dispatcher.dispatch.bind(dispatcher),
  createZoroEngineeringDispatcher,
  DISPATCHER_IDS,
  CATALOGUES,
  CONTEXT_DOMAINS,
  ENGINEERING_READ_CATALOGUE,
  ENGINEERING_WRITE_CATALOGUE,
  ENGINEERING_ARCHIVE_CATALOGUE,
  GITHUB_CATALOGUES,
  HEROKU_CATALOGUE,
  normalizeEnvelope,
  requireApproval,
  requireConfirmation,
  sanitizeResult,
};
