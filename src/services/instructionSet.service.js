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
 * Returns the highest active or approved version for a key.
 *
 * Draft and superseded versions are never selected here, so publishing a new
 * draft cannot change what existing clients receive (SPEC §8.5, §18).
 */
async function getInstructionSetByKey(key) {
  return InstructionSet.findOne({ key, status: { $in: PUBLISHED_STATUSES } })
    .sort({ version: -1 })
    .lean();
}

module.exports = { listInstructionSets, getInstructionSetByKey, buildFilter, SORT };
