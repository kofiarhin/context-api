'use strict';

const models = require('../models');
const serializers = require('../serializers');
const { normalizeTerm } = require('../models/glossaryEntry.model');

const CRUD_DOMAINS = Object.freeze({
  profile: {
    Model: models.Profile,
    identifierField: 'key',
    serializer: serializers.serializeProfile,
    label: 'Profile',
    singleton: true,
  },
  codingConventions: {
    Model: models.CodingConvention,
    identifierField: 'key',
    serializer: serializers.serializeCodingConvention,
    label: 'Coding convention',
  },
  projects: {
    Model: models.Project,
    identifierField: 'projectId',
    serializer: serializers.serializeProject,
    label: 'Project',
  },
  tasks: {
    Model: models.Task,
    identifierField: 'taskId',
    serializer: serializers.serializeTask,
    label: 'Task',
  },
  instructionSets: {
    Model: models.InstructionSet,
    identifierField: 'key',
    serializer: serializers.serializeInstructionSet,
    label: 'Instruction set',
    lookupSort: { version: -1, updatedAt: -1 },
  },
  ideasHub: {
    Model: models.IdeasHubContext,
    identifierField: 'section',
    serializer: serializers.serializeIdeasHubContext,
    label: 'Ideas Hub section',
  },
  glossary: {
    Model: models.GlossaryEntry,
    identifierField: 'normalizedKey',
    serializer: serializers.serializeGlossaryEntry,
    label: 'Glossary entry',
    normalizeIdentifier: normalizeTerm,
  },
  learnings: {
    Model: models.Learning,
    identifierField: 'learningId',
    serializer: serializers.serializeLearning,
    label: 'Learning',
  },
});

function getCrudDomain(name) {
  return CRUD_DOMAINS[name];
}

module.exports = { CRUD_DOMAINS, getCrudDomain };
