'use strict';

const { ValidationError } = require('../utils/errors');

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
  throw new ValidationError('Request validation failed.', [
    { field: 'cursor', message },
  ]);
}

function serializeCursorValue(field, value) {
  if (field === 'updatedAt') {
    return new Date(value).toISOString();
  }

  return value;
}

function parseCursorValue(field, value) {
  if (field === 'updatedAt') {
    const timestamp = Date.parse(value);

    if (Number.isNaN(timestamp)) {
      failCursor('Cursor is invalid or no longer supported.');
    }

    return new Date(timestamp);
  }

  if (field === 'version') {
    if (!Number.isInteger(value) || value < 1) {
      failCursor('Cursor is invalid or no longer supported.');
    }

    return value;
  }

  if (typeof value !== 'string' || value.length === 0) {
    failCursor('Cursor is invalid or no longer supported.');
  }

  return value;
}

function encodeCursor(record, modelName, sort) {
  const values = {};

  for (const field of Object.keys(sort)) {
    if (record[field] === undefined || record[field] === null) {
      failCursor('The current page cannot produce a stable cursor.');
    }

    values[field] = serializeCursorValue(field, record[field]);
  }

  return Buffer.from(JSON.stringify({ model: modelName, values }), 'utf8').toString(
    'base64url'
  );
}

function decodeCursor(rawCursor, modelName, sort) {
  if (!rawCursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'));
    const expectedFields = Object.keys(sort);
    const actualFields = Object.keys(parsed.values || {});

    if (
      parsed.model !== modelName ||
      actualFields.length !== expectedFields.length ||
      !expectedFields.every((field) => actualFields.includes(field))
    ) {
      failCursor('Cursor does not belong to this collection.');
    }

    return Object.fromEntries(
      expectedFields.map((field) => [
        field,
        parseCursorValue(field, parsed.values[field]),
      ])
    );
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

function applyCursor(filter, cursorValues, sort) {
  if (!cursorValues) {
    return filter;
  }

  const entries = Object.entries(sort);
  const clauses = entries.map(([field, direction], index) => {
    const clause = {};

    for (let prefixIndex = 0; prefixIndex < index; prefixIndex += 1) {
      const [prefixField] = entries[prefixIndex];
      clause[prefixField] = cursorValues[prefixField];
    }

    clause[field] = {
      [direction === -1 ? '$lt' : '$gt']: cursorValues[field],
    };

    return clause;
  });

  return { $and: [filter, { $or: clauses }] };
}

/**
 * Runs a bounded, lean collection query.
 *
 * Offset mode preserves the original page/pageSize contract and totals by
 * default. Cursor mode uses each domain's indexed stable sort, compact
 * summaries, and no count query unless the caller explicitly requests one.
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
  const cursorValues = isCursorMode
    ? decodeCursor(pagination.cursor, Model.modelName, sort)
    : null;
  const queryFilter = isCursorMode
    ? applyCursor(effectiveFilter, cursorValues, sort)
    : effectiveFilter;
  const queryLimit = isCursorMode ? requestedLimit + 1 : requestedLimit;

  let query = Model.find(queryFilter).sort(sort);

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
  const items = hasNextPage
    ? queriedItems.slice(0, requestedLimit)
    : queriedItems;
  const nextCursor = hasNextPage
    ? encodeCursor(items[items.length - 1], Model.modelName, sort)
    : null;

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
  SUMMARY_PROJECTIONS,
  escapeRegExp,
  encodeCursor,
  decodeCursor,
  applyUpdatedAfter,
  applyCursor,
  paginate,
};
