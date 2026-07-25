'use strict';

const { randomUUID } = require('node:crypto');

const { DevOpsEvent } = require('../models');
const {
  EVENT_STAGES,
  EVENT_STATUSES,
  EVENT_PROVIDERS,
  EVENT_ENVIRONMENTS,
} = require('../models/devOpsEvent.model');
const { ResourceNotFoundError, ValidationError } = require('../utils/errors');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const SECRET_KEY_PATTERN =
  /token|password|secret|authorization|credential|private.?key|mongodb.?uri|config.?value|old.?value|new.?value/i;
const SECRET_VALUE_PATTERNS = [
  /^Bearer\s+/i,
  /^mongodb(?:\+srv)?:\/\//i,
  /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/,
  /logplex/i,
  /[?&](?:token|signature|sig|key|secret)=/i,
];

const WRITE_DEFAULTS = Object.freeze({
  appendEvent: { kind: 'event' },
  startRun: { kind: 'run-start', stage: 'implementation', status: 'running' },
  updateRun: { kind: 'run-update', stage: 'implementation', status: 'running' },
  completeRun: { kind: 'run-complete', stage: 'completion', status: 'completed' },
  recordVerification: { kind: 'verification', stage: 'verification', status: 'passed' },
  recordDeployment: { kind: 'deployment', stage: 'deployment', status: 'deployed' },
  recordRollback: { kind: 'rollback', stage: 'rollback', status: 'rolled-back' },
  recordIncident: { kind: 'incident-start', stage: 'incident', status: 'running' },
  resolveIncident: { kind: 'incident-resolved', stage: 'incident', status: 'resolved' },
  recordSecretRotation: {
    kind: 'secret-rotation',
    stage: 'security',
    status: 'completed',
  },
  attachEvidence: { kind: 'evidence-attachment', stage: 'operations', status: 'completed' },
});

const READ_OPERATIONS = Object.freeze([
  'listEvents',
  'getEvent',
  'getTimeline',
  'summarizeRelease',
  'listDeployments',
  'listIncidents',
  'getIncident',
]);

const WRITE_OPERATIONS = Object.freeze(Object.keys(WRITE_DEFAULTS));

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(field, message) {
  throw new ValidationError('Request validation failed.', [{ field, message }]);
}

function assertNoSecrets(value, path = 'event') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecrets(entry, `${path}[${index}]`));
    return;
  }

  if (!isPlainObject(value)) {
    if (
      typeof value === 'string' &&
      SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))
    ) {
      fail(path, 'Secret values and temporary provider URLs are not permitted.');
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      fail(`${path}.${key}`, 'Secret-bearing fields are not permitted.');
    }
    assertNoSecrets(nested, `${path}.${key}`);
  }
}

function parseLimit(raw) {
  if (raw === undefined || raw === '') {
    return DEFAULT_LIMIT;
  }

  if (!/^\d+$/.test(String(raw))) {
    fail('limit', 'Value must be an integer.');
  }

  const limit = Number(raw);
  if (limit < 1 || limit > MAX_LIMIT) {
    fail('limit', `Value must be between 1 and ${MAX_LIMIT}.`);
  }
  return limit;
}

function parseDate(raw, field) {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    fail(field, 'Value must be an ISO 8601 date-time.');
  }
  return new Date(timestamp);
}

function serializeEvent(event) {
  const value =
    event && typeof event.toObject === 'function'
      ? event.toObject({ versionKey: false })
      : { ...event };

  delete value._id;
  delete value.__v;

  for (const field of ['occurredAt', 'createdAt', 'updatedAt']) {
    if (value[field] instanceof Date) {
      value[field] = value[field].toISOString();
    }
  }

  return value;
}

function encodeCursor(event) {
  return Buffer.from(
    JSON.stringify({
      occurredAt:
        event.occurredAt instanceof Date
          ? event.occurredAt.toISOString()
          : event.occurredAt,
      eventId: event.eventId,
    }),
    'utf8'
  ).toString('base64url');
}

function decodeCursor(raw) {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const occurredAt = parseDate(parsed.occurredAt, 'cursor');
    if (!occurredAt || typeof parsed.eventId !== 'string' || parsed.eventId.length === 0) {
      throw new Error('invalid');
    }
    return { occurredAt, eventId: parsed.eventId };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    fail('cursor', 'Cursor is invalid or no longer supported.');
    return null;
  }
}

function buildFilter(input = {}, extra = {}) {
  const filter = { ...extra };
  const allowed = [
    'eventId',
    'incidentId',
    'runId',
    'workKey',
    'projectId',
    'taskId',
    'stage',
    'status',
    'provider',
    'environment',
    'repository',
    'branch',
    'commitSha',
    'release',
    'deploymentId',
  ];

  for (const field of allowed) {
    if (input[field] !== undefined && input[field] !== '') {
      filter[field] = input[field];
    }
  }

  const since = parseDate(input.since, 'since');
  const until = parseDate(input.until, 'until');
  if (since || until) {
    filter.occurredAt = {
      ...(since ? { $gte: since } : {}),
      ...(until ? { $lte: until } : {}),
    };
  }

  return filter;
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
          { occurredAt: { $lt: cursor.occurredAt } },
          { occurredAt: cursor.occurredAt, eventId: { $lt: cursor.eventId } },
        ],
      },
    ],
  };
}

async function listBy(input = {}, extraFilter = {}) {
  const limit = parseLimit(input.limit);
  const cursor = decodeCursor(input.cursor);
  const filter = applyCursor(buildFilter(input, extraFilter), cursor);
  const queried = await DevOpsEvent.find(filter)
    .sort({ occurredAt: -1, eventId: -1 })
    .limit(limit + 1)
    .lean();
  const hasNextPage = queried.length > limit;
  const items = hasNextPage ? queried.slice(0, limit) : queried;

  return {
    data: items.map(serializeEvent),
    meta: {
      limit,
      hasNextPage,
      nextCursor:
        hasNextPage && items.length > 0 ? encodeCursor(items[items.length - 1]) : null,
    },
  };
}

function requireEventObject(raw) {
  if (!isPlainObject(raw)) {
    fail('event', 'Event must be a JSON object.');
  }
  return { ...raw };
}

function validateEnum(value, values, field) {
  if (!values.includes(value)) {
    fail(field, `Value must be one of: ${values.join(', ')}.`);
  }
}

function normalizeSecretRotation(event) {
  const allowed = new Set([
    'eventId',
    'runId',
    'workKey',
    'projectId',
    'taskId',
    'provider',
    'environment',
    'summary',
    'variableName',
    'actor',
    'reason',
    'evidence',
    'metadata',
    'occurredAt',
    'requestId',
    'correlationId',
  ]);
  const unknown = Object.keys(event).filter((key) => !allowed.has(key));

  if (unknown.length > 0) {
    fail(
      `event.${unknown[0]}`,
      'Secret-rotation events accept metadata only; secret values are forbidden.'
    );
  }

  for (const field of ['provider', 'variableName', 'actor', 'reason']) {
    if (typeof event[field] !== 'string' || event[field].trim() === '') {
      fail(`event.${field}`, 'Value is required.');
    }
  }

  return event;
}

function normalizeWrite(operation, rawEvent, context = {}) {
  const defaults = WRITE_DEFAULTS[operation];
  if (!defaults) {
    fail('operation', 'Unknown DevOps log write operation.');
  }

  let event = requireEventObject(rawEvent);
  assertNoSecrets(event);

  if (operation === 'recordSecretRotation') {
    event = normalizeSecretRotation(event);
  }

  if (operation === 'recordIncident' && !event.incidentId) {
    event.incidentId = randomUUID();
  }

  if (operation === 'resolveIncident' && !event.incidentId) {
    fail('event.incidentId', 'Value is required.');
  }

  const normalized = {
    ...defaults,
    ...event,
    eventId: event.eventId || randomUUID(),
    provider: event.provider || 'manual',
    requestId: event.requestId || context.requestId || null,
    correlationId: event.correlationId || context.correlationId || null,
    occurredAt: parseDate(event.occurredAt, 'event.occurredAt') || new Date(),
  };

  for (const field of ['workKey', 'summary']) {
    if (typeof normalized[field] !== 'string' || normalized[field].trim() === '') {
      fail(`event.${field}`, 'Value is required.');
    }
  }

  validateEnum(normalized.stage, EVENT_STAGES, 'event.stage');
  validateEnum(normalized.status, EVENT_STATUSES, 'event.status');
  validateEnum(normalized.provider, EVENT_PROVIDERS, 'event.provider');
  if (normalized.environment !== undefined && normalized.environment !== null) {
    validateEnum(normalized.environment, EVENT_ENVIRONMENTS, 'event.environment');
  }

  assertNoSecrets(normalized);
  return normalized;
}

async function append(operation, event, context = {}) {
  const normalized = normalizeWrite(operation, event, context);
  const created = await DevOpsEvent.create(normalized);
  return serializeEvent(created);
}

async function getEvent(eventId) {
  if (typeof eventId !== 'string' || eventId.trim() === '') {
    fail('eventId', 'Value is required.');
  }

  const event = await DevOpsEvent.findOne({ eventId }).lean();
  if (!event) {
    throw new ResourceNotFoundError(`DevOps event "${eventId}" was not found.`);
  }
  return serializeEvent(event);
}

async function getIncident(incidentId) {
  if (typeof incidentId !== 'string' || incidentId.trim() === '') {
    fail('incidentId', 'Value is required.');
  }

  const events = await DevOpsEvent.find({ incidentId })
    .sort({ occurredAt: 1, eventId: 1 })
    .lean();
  if (events.length === 0) {
    throw new ResourceNotFoundError(`Incident "${incidentId}" was not found.`);
  }

  return {
    incidentId,
    currentStatus: events[events.length - 1].status,
    events: events.map(serializeEvent),
  };
}

async function summarizeRelease(release) {
  if (typeof release !== 'string' || release.trim() === '') {
    fail('release', 'Value is required.');
  }

  const events = await DevOpsEvent.find({ release })
    .sort({ occurredAt: 1, eventId: 1 })
    .lean();
  if (events.length === 0) {
    throw new ResourceNotFoundError(`Release "${release}" was not found.`);
  }

  const statuses = {};
  for (const event of events) {
    statuses[event.status] = (statuses[event.status] || 0) + 1;
  }

  return {
    release,
    currentStatus: events[events.length - 1].status,
    statuses,
    firstOccurredAt: serializeEvent(events[0]).occurredAt,
    lastOccurredAt: serializeEvent(events[events.length - 1]).occurredAt,
    events: events.map(serializeEvent),
  };
}

async function executeRead(operation, input = {}) {
  if (!READ_OPERATIONS.includes(operation)) {
    fail('operation', 'Unknown DevOps log read operation.');
  }

  if (operation === 'getEvent') {
    return getEvent(input.eventId);
  }
  if (operation === 'getIncident') {
    return getIncident(input.incidentId);
  }
  if (operation === 'summarizeRelease') {
    return summarizeRelease(input.release);
  }
  if (operation === 'getTimeline') {
    if (!input.workKey && !input.runId && !input.incidentId) {
      fail('workKey', 'A workKey, runId, or incidentId is required.');
    }
    return listBy(input);
  }
  if (operation === 'listDeployments') {
    return listBy(input, { kind: { $in: ['deployment', 'rollback'] } });
  }
  if (operation === 'listIncidents') {
    return listBy(input, { kind: { $in: ['incident-start', 'incident-resolved'] } });
  }

  return listBy(input);
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  READ_OPERATIONS,
  WRITE_OPERATIONS,
  WRITE_DEFAULTS,
  assertNoSecrets,
  encodeCursor,
  decodeCursor,
  serializeEvent,
  listBy,
  append,
  getEvent,
  getIncident,
  summarizeRelease,
  executeRead,
};
