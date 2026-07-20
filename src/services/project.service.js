'use strict';

const { Project } = require('../models');
const { paginate } = require('./queryHelpers');

const SORT = { updatedAt: -1, projectId: 1 };

function buildFilter(filters = {}) {
  const filter = {};

  if (filters.status) {
    filter.status = filters.status;
  }

  if (filters.lifecycleState) {
    filter.lifecycleState = filters.lifecycleState;
  }

  if (filters.technology) {
    filter.technologyStack = filters.technology;
  }

  if (filters.updatedAfter) {
    filter.updatedAt = { $gt: filters.updatedAfter };
  }

  return filter;
}

async function listProjects(filters, pagination) {
  return paginate(Project, buildFilter(filters), SORT, pagination);
}

/**
 * Matches the stable `projectId` only. Slug fallback is intentionally omitted
 * because SPEC §9.4 requires it to be documented before it is added.
 */
async function getProjectById(projectId) {
  return Project.findOne({ projectId }).lean();
}

module.exports = { listProjects, getProjectById, buildFilter, SORT };
