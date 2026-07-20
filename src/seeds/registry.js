'use strict';

const models = require('../models');

/**
 * Seed domains in dependency order.
 *
 * `identity` lists the fields that make a record stable across reruns; upserts
 * match on these, never on a generated identifier.
 */
const REGISTRY = [
  {
    name: 'profiles',
    Model: models.Profile,
    identity: ['key'],
    records: require('./data/profiles'),
  },
  {
    name: 'projects',
    Model: models.Project,
    identity: ['projectId'],
    records: require('./data/projects'),
  },
  {
    name: 'codingConventions',
    Model: models.CodingConvention,
    identity: ['key'],
    records: require('./data/codingConventions'),
  },
  {
    name: 'instructionSets',
    Model: models.InstructionSet,
    identity: ['key', 'version'],
    records: require('./data/instructionSets'),
  },
  {
    name: 'ideasHubContext',
    Model: models.IdeasHubContext,
    identity: ['section'],
    records: require('./data/ideasHubContext'),
  },
  {
    name: 'glossaryEntries',
    Model: models.GlossaryEntry,
    identity: ['normalizedKey'],
    records: require('./data/glossaryEntries'),
  },
  {
    name: 'learnings',
    Model: models.Learning,
    identity: ['learningId'],
    records: require('./data/learnings'),
  },
  {
    name: 'tasks',
    Model: models.Task,
    identity: ['taskId'],
    records: require('./data/tasks'),
  },
];

const REQUIRED_DOMAINS = REGISTRY.map((domain) => domain.name);

function identityOf(domain, record) {
  return domain.identity.reduce((filter, field) => {
    filter[field] = record[field];
    return filter;
  }, {});
}

function identityLabel(domain, record) {
  return domain.identity.map((field) => `${field}=${record[field]}`).join(', ');
}

module.exports = { REGISTRY, REQUIRED_DOMAINS, identityOf, identityLabel };
