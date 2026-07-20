'use strict';

const { InstructionSet } = require('../models');
const { PUBLISHED_STATUSES } = require('../utils/enums');
const { paginate } = require('./queryHelpers');

const SORT = { updatedAt: -1, key: 1, version: -1 };

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
 * Prefers the highest published version, then falls back to the latest stored
 * version so an archived record remains directly inspectable and restorable.
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

  return InstructionSet.findOne({ key }).sort({ version: -1, updatedAt: -1 }).lean();
}

module.exports = {
  listInstructionSets,
  getInstructionSetByKey,
  buildFilter,
  SORT,
};
