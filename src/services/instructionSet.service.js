'use strict';

const { InstructionSet } = require('../models');
const { PUBLISHED_STATUSES } = require('../utils/enums');
const { paginate } = require('./queryHelpers');

const SORT = { updatedAt: -1, key: 1, version: -1 };
const INSPECTABLE_FALLBACK_STATUSES = ['superseded', 'archived'];

function buildFilter(filters = {}) {
  const filter = {};

  if (filters.status) {
    filter.status = filters.status;
  }

  if (filters.workflowStage) {
    filter.workflowStage = filters.workflowStage;
  }

  if (filters.applicableClient) {
    filter.applicableClients = filters.applicableClient;
  }

  return filter;
}

async function listInstructionSets(filters, pagination) {
  return paginate(InstructionSet, buildFilter(filters), SORT, pagination);
}

/**
 * Prefers the highest published version. When no published version exists, an
 * explicitly retired version may still be inspected, but draft-only instruction
 * sets remain unpublished and therefore invisible through the detail endpoint.
 */
async function getInstructionSetByKey(key) {
  const published = await InstructionSet.findOne({
    key,
    status: { $in: PUBLISHED_STATUSES },
  })
    .sort({ version: -1 })
    .lean();

  if (published) {
    return published;
  }

  return InstructionSet.findOne({
    key,
    status: { $in: INSPECTABLE_FALLBACK_STATUSES },
  })
    .sort({ version: -1, updatedAt: -1 })
    .lean();
}

module.exports = {
  listInstructionSets,
  getInstructionSetByKey,
  buildFilter,
  SORT,
  INSPECTABLE_FALLBACK_STATUSES,
};
