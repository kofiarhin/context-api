'use strict';

const crypto = require('node:crypto');

const DevOpsLogEntry = require('../models/devopsLogEntry.model');
const { DEVOPS_LOG_STATES } = require('../utils/enums');
const { ConflictError, ValidationError } = require('../utils/errors');
const { serializeDevOpsLogEntry } = require('../serializers/devopsLog.serializer');
const { redactDetails, scrubString } = require('./zoro/zoroRedaction');
const { paginate } = require('./queryHelpers');

const SORT = { occurredAt: -1, entryId: 1 };
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MAX_REFERENCES = 20;
const STATES = new Set(DEVOPS_LOG_STATES);

function requireString(value, field, { maxLength, required = true }) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ValidationError(`${field} is required.`);
    }

    return null;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string.`);
  }

  const trimmed = value.trim();

  if (required && trimmed === '') {
    throw new ValidationError(`${field} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters.`);
  }

  return trimmed;
}

function requireIdentifier(value, field, { required = true } = {}) {
  const text = requireString(value, field, { maxLength: 128, required });

  if (text === null) {
    return null;
  }

  if (!IDENTIFIER.test(text)) {
    throw new ValidationError(`${field} is invalid.`);
  }

  return text;
}

/**
 * Validates the lifecycle state against the enum verbatim.
 *
 * No normalisation, aliasing, or fuzzy matching happens here on purpose. `failed`
 * and `blocked` mean different things, as do `passed`, `deployed`, `resolved`,
 * and `completed`; silently coercing a near-miss would corrupt the audit trail
 * that this log exists to provide.
 */
function requireState(value) {
  const state = requireString(value, 'state', { maxLength: 32 });

  if (!STATES.has(state)) {
    throw new ValidationError(`state must be one of: ${DEVOPS_LOG_STATES.join(', ')}.`);
  }

  return state;
}

function normalizeReferences(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError('references must be an array.');
  }

  if (value.length > MAX_REFERENCES) {
    throw new ValidationError(`references may contain at most ${MAX_REFERENCES} entries.`);
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ValidationError(`references[${index}] must be an object.`);
    }

    return {
      type: requireString(entry.type, `references[${index}].type`, { maxLength: 64 }),
      // A reference can legitimately be a URL, so it goes through the same
      // scrubber as everything else: a pre-signed or logplex URL is dropped.
      reference: scrubString(
        requireString(entry.reference, `references[${index}].reference`, { maxLength: 512 })
      ),
    };
  });
}

function normalizeOccurredAt(value) {
  if (value === undefined || value === null || value === '') {
    return new Date();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('occurredAt must be a valid ISO-8601 timestamp.');
  }

  return date;
}

/**
 * Appends one entry to the DevOps operations log.
 *
 * Every free-text field is scrubbed and the structured `details` payload is
 * recursively redacted before it reaches Mongoose, so secrets, authorization
 * headers, private keys, decrypted config vars, and temporary provider URLs are
 * removed at the only point where data enters the log.
 *
 * There is no companion update or delete: the log is append-only, and the model
 * refuses mutation even if a caller reaches past this service.
 */
async function appendEntry(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('An operations log entry object is required.');
  }

  const entry = {
    entryId: input.entryId
      ? requireIdentifier(input.entryId, 'entryId')
      : `opslog-${crypto.randomUUID()}`,
    operationId: requireString(input.operationId, 'operationId', { maxLength: 128 }),
    operation: requireString(input.operation, 'operation', { maxLength: 128, required: false }),
    state: requireState(input.state),
    summary: scrubString(requireString(input.summary, 'summary', { maxLength: 2000 })),
    actor: requireString(input.actor, 'actor', { maxLength: 128, required: false }),
    projectId: requireIdentifier(input.projectId, 'projectId', { required: false }),
    taskId: requireIdentifier(input.taskId, 'taskId', { required: false }),
    correlationId: requireString(input.correlationId, 'correlationId', {
      maxLength: 128,
      required: false,
    }),
    references: normalizeReferences(input.references),
    details: redactDetails(input.details),
    occurredAt: normalizeOccurredAt(input.occurredAt),
  };

  try {
    const created = await DevOpsLogEntry.create(entry);

    return serializeDevOpsLogEntry(created.toObject());
  } catch (error) {
    if (error && error.code === 11000) {
      // Re-posting an existing entryId must not overwrite history.
      throw new ConflictError(`An operations log entry "${entry.entryId}" already exists.`);
    }

    throw error;
  }
}

function buildFilter(filters = {}) {
  const filter = {};

  if (filters.operationId) {
    filter.operationId = filters.operationId;
  }

  if (filters.state) {
    filter.state = requireState(filters.state);
  }

  if (filters.projectId) {
    filter.projectId = requireIdentifier(filters.projectId, 'projectId');
  }

  if (filters.taskId) {
    filter.taskId = requireIdentifier(filters.taskId, 'taskId');
  }

  if (filters.actor) {
    filter.actor = requireString(filters.actor, 'actor', { maxLength: 128 });
  }

  return filter;
}

/**
 * Lists log entries newest-first.
 *
 * `paginate` normally hides `archived` records by injecting a status filter.
 * This collection has no `status` field at all — entries are never archived — so
 * the injected clause matches every document and is a harmless no-op, while
 * cursor and offset pagination behave exactly as they do elsewhere.
 */
async function listEntries(filters, pagination) {
  return paginate(DevOpsLogEntry, buildFilter(filters), SORT, pagination);
}

async function getEntryById(entryId) {
  return DevOpsLogEntry.findOne({ entryId: requireIdentifier(entryId, 'entryId') }).lean();
}

module.exports = {
  appendEntry,
  listEntries,
  getEntryById,
  buildFilter,
  SORT,
};
