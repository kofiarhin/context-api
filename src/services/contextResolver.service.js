'use strict';

const crypto = require('node:crypto');

const { CodingConvention, InstructionSet } = require('../models');
const profileService = require('./profile.service');
const projectService = require('./project.service');
const taskService = require('./task.service');
const { PUBLISHED_STATUSES } = require('../utils/enums');
const { ResourceNotFoundError, ValidationError } = require('../utils/errors');

const DEFAULT_MAX_ITEMS = 8;
const MAX_MAX_ITEMS = 20;

const INSTRUCTION_SUMMARY_FIELDS = [
  'key',
  'title',
  'description',
  'workflowStage',
  'applicableClients',
  'tags',
  'source',
  'status',
  'version',
  'createdAt',
  'updatedAt',
].join(' ');

const CONVENTION_SUMMARY_FIELDS = [
  'key',
  'title',
  'description',
  'scope',
  'technology',
  'layer',
  'projectId',
  'priority',
  'tags',
  'source',
  'status',
  'version',
  'createdAt',
  'updatedAt',
].join(' ');

function clampMaxItems(value) {
  if (!Number.isInteger(value)) {
    return DEFAULT_MAX_ITEMS;
  }

  return Math.min(Math.max(value, 1), MAX_MAX_ITEMS);
}

function addUpdatedAfter(filter, updatedAfter) {
  if (!updatedAfter) {
    return filter;
  }

  return { ...filter, updatedAt: { $gt: updatedAfter } };
}

function latestVersionPerKey(records, maxItems) {
  const seen = new Set();
  const selected = [];

  for (const record of records) {
    if (seen.has(record.key)) {
      continue;
    }

    seen.add(record.key);
    selected.push(record);

    if (selected.length === maxItems) {
      break;
    }
  }

  return selected;
}

function buildRevision(parts) {
  const fingerprint = parts
    .filter(Boolean)
    .map((part) => ({
      id: part.key || part.projectId || part.taskId,
      version: part.version || null,
      updatedAt:
        part.updatedAt instanceof Date
          ? part.updatedAt.toISOString()
          : part.updatedAt || null,
    }));

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(fingerprint))
    .digest('base64url');
}

async function resolveContext({
  client,
  projectId = null,
  taskId = null,
  workflowStage = null,
  maxItems,
  updatedAfter = null,
}) {
  const boundedMaxItems = clampMaxItems(maxItems);
  const [profile, task] = await Promise.all([
    profileService.getActiveProfile(),
    taskId ? taskService.getTaskById(taskId) : Promise.resolve(null),
  ]);

  if (taskId && !task) {
    throw new ResourceNotFoundError(`Task "${taskId}" was not found.`);
  }

  if (projectId && task && task.projectId !== projectId) {
    throw new ValidationError('Request validation failed.', [
      {
        field: 'taskId',
        message: `Task "${taskId}" does not belong to project "${projectId}".`,
      },
    ]);
  }

  const effectiveProjectId = projectId || (task ? task.projectId : null);
  const project = effectiveProjectId
    ? await projectService.getProjectById(effectiveProjectId)
    : null;

  if (effectiveProjectId && !project) {
    throw new ResourceNotFoundError(`Project "${effectiveProjectId}" was not found.`);
  }

  const instructionFilter = addUpdatedAfter(
    {
      status: { $in: PUBLISHED_STATUSES },
      applicableClients: client,
      ...(workflowStage ? { workflowStage } : {}),
    },
    updatedAfter
  );

  const conventionScope = effectiveProjectId
    ? {
        $or: [
          { scope: 'global' },
          { scope: 'project', projectId: effectiveProjectId },
        ],
      }
    : { scope: 'global' };
  const conventionFilter = addUpdatedAfter(
    { status: { $in: PUBLISHED_STATUSES }, ...conventionScope },
    updatedAfter
  );

  const [instructionCandidates, codingConventions] = await Promise.all([
    InstructionSet.find(instructionFilter)
      .select(INSTRUCTION_SUMMARY_FIELDS)
      .sort({ key: 1, version: -1, updatedAt: -1 })
      .limit(boundedMaxItems * 4)
      .lean(),
    CodingConvention.find(conventionFilter)
      .select(CONVENTION_SUMMARY_FIELDS)
      .sort({ priority: -1, updatedAt: -1, key: 1 })
      .limit(boundedMaxItems)
      .lean(),
  ]);

  const instructionSets = latestVersionPerKey(
    instructionCandidates,
    boundedMaxItems
  );
  const revision = buildRevision([
    profile,
    project,
    task,
    ...instructionSets,
    ...codingConventions,
  ]);

  return {
    profile,
    project,
    task,
    instructionSets,
    codingConventions,
    revision,
    resolvedFor: {
      client,
      projectId: effectiveProjectId,
      taskId,
      workflowStage,
      updatedAfter: updatedAfter ? updatedAfter.toISOString() : null,
      maxItems: boundedMaxItems,
    },
  };
}

module.exports = {
  DEFAULT_MAX_ITEMS,
  MAX_MAX_ITEMS,
  resolveContext,
  clampMaxItems,
  latestVersionPerKey,
  buildRevision,
};
