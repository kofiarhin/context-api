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
const { validateQuery, validateIdentifierParam } = require('./common');

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
    updatedAfter: { type: 'isoDate' },
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

function createListValidator(schemaName) {
  return (query) => validateQuery(query, QUERY_SCHEMAS[schemaName]);
}

module.exports = {
  QUERY_SCHEMAS,
  validateIdentifierParam,
  validateProfileQuery: (query) => validateQuery(query, {}, { pagination: false }),
  validateCodingConventionQuery: createListValidator('codingConventions'),
  validateProjectQuery: createListValidator('projects'),
  validateInstructionSetQuery: createListValidator('instructionSets'),
  validateIdeasHubQuery: createListValidator('ideasHub'),
  validateGlossaryQuery: createListValidator('glossary'),
  validateLearningQuery: createListValidator('learnings'),
  validateTaskQuery: createListValidator('tasks'),
};
