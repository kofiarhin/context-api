'use strict';

const { Learning } = require('../models');
const { paginate } = require('./queryHelpers');

const SORT = { updatedAt: -1, learningId: 1 };

function buildFilter(filters = {}) {
  const filter = {};

  if (filters.category) {
    filter.category = filters.category;
  }

  if (filters.projectId) {
    filter.projectId = filters.projectId;
  }

  if (filters.status) {
    filter.status = filters.status;
  }

  return filter;
}

/**
 * Returns learnings at every status. Draft records remain visible but carry
 * their own `status` and `reviewStatus`, so a client can tell an unverified
 * observation from durable approved knowledge (PRD §7.8).
 */
async function listLearnings(filters, pagination) {
  return paginate(Learning, buildFilter(filters), SORT, pagination);
}

async function getLearningById(learningId) {
  return Learning.findOne({ learningId }).lean();
}

module.exports = { listLearnings, getLearningById, buildFilter, SORT };
