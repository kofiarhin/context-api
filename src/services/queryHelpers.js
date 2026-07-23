'use strict';

const { ValidationError } = require('../utils/errors');

const CURSOR_ID = /^[0-9a-fA-F]{24}$/;

const SUMMARY_PROJECTIONS = Object.freeze({
  CodingConvention: [
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
    'updatedAt',
  ].join(' '),
  Project: [
    'projectId',
    'slug',
    'name',
    'summary',
    'lifecycleState',
    'repositoryUrl',
    'liveUrl',
    'technologyStack',
    'currentFocus',
    'tags',
    'source',
    'status',
    'version',
    'updatedAt',
  ].join(' '),
  Task: [
    'taskId',
    'title',
    'projectId',
    'status',
    'priority',
    'dependencies',
    'tags',
    'source',
    'updatedAt',
  ].join(' '),
  InstructionSet: [
    'key',
    'title',
    'description',
    'workflowStage',
    'applicableClients',
    'tags',
    'source',
    'status',
    'version',
    'updatedAt',
  ].join(' '),
  IdeasHubContext: [
    'section',
    'title',
    'description',
    'tags',
    'source',
    'status',
    'version',
    'updatedAt',
  ].join(' '),
  GlossaryEntry: [
    'term',
    'normalizedKey',
    'definition',
    'scope',
    'tags',
    'source',
    'status',
    'version',
    'updatedAt',
  ].join(' '),
  Learning: [
    'learningId',
    'title',
    'category',
    'projectId',
    'reviewStatus',
    'supersedes',
    'description',
    'tags',
    'source',
    'status',
    'version',
    'updatedAt',
  ].join(' '),
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function failCursor(message) {
  throw new ValidationError('Request validation failed.', [{ field: 'cursor', message }]);
}

function encodeCursor(record) {
  if (!record || !record.updatedAt || !record._id) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({ updatedAt: new Date(record.updatedAt).toISOString(), id: String(record._id) }),
    'utf8'
  ).toString('base64url');
}

function decodeCursor(rawCursor) {
  if (!rawCursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'));
    const timestamp = Date.parse(parsed.updatedAt);

    if (Number.isNaN(timestamp) || typeof parsed.id !== 'string' || !CURSOR_ID.test(parsed.id)) {
      failCursor('Cursor is invalid or no longer supported.');
    }

    return { updatedAt: new Date(timestamp), id: parsed.id };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    failCursor('Cursor is invalid or no longer supported.');
    return null;
  }
}

function applyUpdatedAfter(filter, updatedAfter) {
  if (!updatedAfter) {
    return filter;
  }

  return { ...filter, updatedAt: { $gt: updatedAfter } };
}

function applyCursor(filter, cursor) {
  if (!cursor) {
    return filter;
  }

  return {
    $and: [
      filter,
      {
        $or: [
          { updatedAt: { $lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
        ],
      },
    ],
  };
}

/**
 * Runs a bounded, lean collection query.
 *
 * Offset mode preserves the original page/pageSize contract and totals by
 * default. Cursor mode uses updatedAt/_id keyset pagination, compact summaries,
 * and no count query unless the caller explicitly requests one.
 *
 * Archived records are hidden unless the caller explicitly filters by status.
 */
async function paginate(Model, filter, sort, pagination) {
  const baseFilter = Object.prototype.hasOwnProperty.call(filter, 'status')
    ? filter
    : { ...filter, status: { $ne: 'archived' } };
  const effectiveFilter = applyUpdatedAfter(baseFilter, pagination.updatedAfter);
  const includeTotal = pagination.includeTotal !== false;
  const isCursorMode = pagination.mode === 'cursor';
  const requestedLimit = isCursorMode ? pagination.limit : pagination.pageSize;
  const cursor = isCursorMode ? decodeCursor(pagination.cursor) : null;
  const queryFilter = isCursorMode ? applyCursor(effectiveFilter, cursor) : effectiveFilter;
  const querySort = isCursorMode ? { updatedAt: -1, _id: -1 } : sort;
  const queryLimit = isCursorMode ? requestedLimit + 1 : requestedLimit;

  let query = Model.find(queryFilter).sort(querySort);

  if (!isCursorMode) {
    query = query.skip(pagination.skip);
  }

  if (pagination.view === 'summary' && SUMMARY_PROJECTIONS[Model.modelName]) {
    query = query.select(SUMMARY_PROJECTIONS[Model.modelName]);
  }

  const [queriedItems, total] = await Promise.all([
    query.limit(queryLimit).lean(),
    includeTotal ? Model.countDocuments(effectiveFilter) : Promise.resolve(null),
  ]);

  const hasNextPage = isCursorMode && queriedItems.length > requestedLimit;
  const items = hasNextPage ? queriedItems.slice(0, requestedLimit) : queriedItems;
  const nextCursor = hasNextPage ? encodeCursor(items[items.length - 1]) : null;

  return {
    items,
    total,
    mode: pagination.mode,
    page: isCursorMode ? null : pagination.page,
    pageSize: isCursorMode ? null : pagination.pageSize,
    limit: isCursorMode ? requestedLimit : null,
    hasNextPage,
    nextCursor,
  };
}

module.exports = {
  CURSOR_ID,
  SUMMARY_PROJECTIONS,
  escapeRegExp,
  encodeCursor,
  decodeCursor,
  applyUpdatedAfter,
  applyCursor,
  paginate,
};
