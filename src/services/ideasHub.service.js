'use strict';

const { IdeasHubContext } = require('../models');
const { PUBLISHED_STATUSES } = require('../utils/enums');
const { paginate } = require('./queryHelpers');

const SORT = { updatedAt: -1, section: 1 };

function buildFilter(filters = {}) {
  if (filters.status) {
    return { status: filters.status };
  }

  // SPEC §9.7: the collection returns active sections unless asked otherwise.
  return { status: { $in: PUBLISHED_STATUSES } };
}

async function listIdeasHubSections(filters, pagination) {
  return paginate(IdeasHubContext, buildFilter(filters), SORT, pagination);
}

/**
 * Looks up a section regardless of status so archived or superseded governance
 * records stay retrievable and distinguishable (SPEC §7).
 */
async function getIdeasHubSection(section) {
  return IdeasHubContext.findOne({ section }).lean();
}

module.exports = { listIdeasHubSections, getIdeasHubSection, buildFilter, SORT };
