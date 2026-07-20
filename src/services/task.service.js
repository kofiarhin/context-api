'use strict';

const { Task } = require('../models');
const { paginate } = require('./queryHelpers');

const SORT = { updatedAt: -1, taskId: 1 };

function buildFilter(filters = {}) {
  const filter = {};

  if (filters.projectId) {
    filter.projectId = filters.projectId;
  }

  if (filters.status) {
    filter.status = filters.status;
  }

  if (filters.priority) {
    filter.priority = filters.priority;
  }

  return filter;
}

async function listTasks(filters, pagination) {
  return paginate(Task, buildFilter(filters), SORT, pagination);
}

async function getTaskById(taskId) {
  return Task.findOne({ taskId }).lean();
}

module.exports = { listTasks, getTaskById, buildFilter, SORT };
