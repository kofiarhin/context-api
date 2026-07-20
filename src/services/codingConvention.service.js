'use strict';

const { CodingConvention } = require('../models');
const { paginate } = require('./queryHelpers');

const SORT = { updatedAt: -1, key: 1 };

function buildFilter(filters = {}) {
  const filter = {};

  if (filters.scope) {
    filter.scope = filters.scope;
  }

  if (filters.status) {
    filter.status = filters.status;
  }

  if (filters.projectId) {
    filter.projectId = filters.projectId;
  }

  // Array membership: a convention tagged with several technologies matches any.
  if (filters.technology) {
    filter.technology = filters.technology;
  }

  if (filters.layer) {
    filter.layer = filters.layer;
  }

  return filter;
}

/**
 * Returns every matching convention without applying precedence.
 *
 * Collection responses deliberately keep conflicting global and project records
 * visible; resolution is the caller's decision (SPEC §8.2).
 */
async function listCodingConventions(filters, pagination) {
  return paginate(CodingConvention, buildFilter(filters), SORT, pagination);
}

async function getCodingConventionByKey(key) {
  return CodingConvention.findOne({ key }).lean();
}

module.exports = { listCodingConventions, getCodingConventionByKey, buildFilter, SORT };
