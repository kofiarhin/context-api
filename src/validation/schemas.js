'use strict';

const {
  STATUSES,
  SCOPES,
  PROJECT_LIFECYCLE_STATES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  WORKFLOW_STAGES,
  LEARNING_CATEGORIES,
} = require('../utils/enums');
const { ValidationError } = require('../utils/errors');
const { validateQuery, validateIdentifierParam } = require('./common');
const { validateReadQuery } = require('./readQuery');

/**
 * Query field allowlists per domain.
 *
 * `target` renames a public query parameter onto the internal filter key, which
 * keeps the documented API surface stable while models evolve.
 */
const QUERY_SCHEMAS = {
  codingConventions: {
    scope: { type: 'enum', values: SCOPES },
    technology: { type: 'identifier' },
    layer: { type: 'identifier' },
    project: { type: 'identifier', target: 'projectId' },
    status: { type: 'enum', values: STATUSES },
  },

  projects: {
    status: { type: 'enum', values: STATUSES },
    lifecycleState: { type: 'enum', values: PROJECT_LIFECYCLE_STATES },
    technology: { type: 'identifier' },
  },

  instructionSets: {
    status: { type: 'enum', values: STATUSES },
    workflowStage: { type: 'enum', values: WORKFLOW_STAGES },
    client: { type: 'identifier', target: 'applicableClient' },
  },

  ideasHub: {
    status: { type: 'enum', values: STATUSES },
  },

  glossary: {
    query: { type: 'search', maxLength: 128 },
    scope: { type: 'enum', values: SCOPES },
    status: { type: 'enum', values: STATUSES },
  },

  learnings: {
    category: { type: 'enum', values: LEARNING_CATEGORIES },
    projectId: { type: 'identifier' },
    status: { type: 'enum', values: STATUSES },
  },

  tasks: {
    projectId: { type: 'identifier' },
    status: { type: 'enum', values: TASK_STATUSES },
    priority: { type: 'enum', values: TASK_PRIORITIES },
  },
};

const CONTEXT_RESOLVER_SCHEMA = {
  client: { type: 'identifier' },
  projectId: { type: 'identifier' },
  taskId: { type: 'identifier' },
  stage: { type: 'enum', values: WORKFLOW_STAGES, target: 'workflowStage' },
  updatedAfter: { type: 'isoDate' },
};

function createListValidator(schemaName) {
  return (query) => validateReadQuery(query, QUERY_SCHEMAS[schemaName]);
}

function validateContextResolverQuery(query) {
  const normalized = { ...query };
  const rawMaxItems = normalized.maxItems;
  delete normalized.maxItems;

  const { filters } = validateQuery(normalized, CONTEXT_RESOLVER_SCHEMA, { pagination: false });
  const details = [];

  if (!filters.client) {
    details.push({ field: 'client', message: 'Client is required.' });
  }

  let maxItems = 8;

  if (rawMaxItems !== undefined && rawMaxItems !== '') {
    if (Array.isArray(rawMaxItems) || !/^\d+$/.test(String(rawMaxItems))) {
      details.push({ field: 'maxItems', message: 'Value must be an integer.' });
    } else {
      maxItems = Number(rawMaxItems);

      if (maxItems < 1 || maxItems > 20) {
        details.push({ field: 'maxItems', message: 'Value must be between 1 and 20.' });
      }
    }
  }

  if (details.length > 0) {
    throw new ValidationError('Request validation failed.', details);
  }

  return { filters: { ...filters, maxItems }, pagination: null };
}

module.exports = {
  QUERY_SCHEMAS,
  CONTEXT_RESOLVER_SCHEMA,
  validateIdentifierParam,
  validateProfileQuery: (query) => validateQuery(query, {}, { pagination: false }),
  validateContextResolverQuery,
  validateCodingConventionQuery: createListValidator('codingConventions'),
  validateProjectQuery: createListValidator('projects'),
  validateInstructionSetQuery: createListValidator('instructionSets'),
  validateIdeasHubQuery: createListValidator('ideasHub'),
  validateGlossaryQuery: createListValidator('glossary'),
  validateLearningQuery: createListValidator('learnings'),
  validateTaskQuery: createListValidator('tasks'),
};
