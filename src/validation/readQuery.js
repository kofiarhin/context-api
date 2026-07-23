'use strict';

const { ValidationError } = require('../utils/errors');
const { validateQuery, PAGINATION_DEFAULTS } = require('./common');

const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_CURSOR_LENGTH = 1024;
const READ_VIEWS = ['summary', 'detail'];
const READ_KEYS = new Set([
  'page',
  'pageSize',
  'cursor',
  'limit',
  'includeTotal',
  'view',
  'updatedAfter',
]);

function parseSingleString(raw, field, details) {
  if (raw === undefined || raw === '') {
    return undefined;
  }

  if (Array.isArray(raw)) {
    details.push({ field, message: 'Parameter must be supplied at most once.' });
    return undefined;
  }

  if (typeof raw !== 'string') {
    details.push({ field, message: 'Value must be a string.' });
    return undefined;
  }

  return raw.trim();
}

function parseInteger(raw, field, fallback, details) {
  if (raw === undefined || raw === '') {
    return fallback;
  }

  if (Array.isArray(raw) || !/^\d+$/.test(String(raw))) {
    details.push({ field, message: 'Value must be an integer.' });
    return fallback;
  }

  const value = Number(raw);

  if (value < 1 || value > PAGINATION_DEFAULTS.maxPageSize) {
    details.push({
      field,
      message: `Value must be between 1 and ${PAGINATION_DEFAULTS.maxPageSize}.`,
    });
    return fallback;
  }

  return value;
}

function parsePage(raw, details) {
  if (raw === undefined || raw === '') {
    return PAGINATION_DEFAULTS.page;
  }

  if (Array.isArray(raw) || !/^\d+$/.test(String(raw))) {
    details.push({ field: 'page', message: 'Value must be an integer.' });
    return PAGINATION_DEFAULTS.page;
  }

  const value = Number(raw);

  if (value < 1 || value > PAGINATION_DEFAULTS.maxPage) {
    details.push({
      field: 'page',
      message: `Value must be between 1 and ${PAGINATION_DEFAULTS.maxPage}.`,
    });
    return PAGINATION_DEFAULTS.page;
  }

  return value;
}

function parseBoolean(raw, field, fallback, details) {
  const value = parseSingleString(raw, field, details);

  if (value === undefined) {
    return fallback;
  }

  if (value !== 'true' && value !== 'false') {
    details.push({ field, message: 'Value must be true or false.' });
    return fallback;
  }

  return value === 'true';
}

function fail(details) {
  throw new ValidationError('Request validation failed.', details);
}

function validateReadQuery(query, fieldSpecs) {
  const filterQuery = {};
  const details = [];

  for (const [key, value] of Object.entries(query)) {
    if (READ_KEYS.has(key)) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(fieldSpecs, key)) {
      details.push({ field: key, message: 'Unknown query parameter.' });
      continue;
    }

    filterQuery[key] = value;
  }

  if (details.length > 0) {
    fail(details);
  }

  const { filters } = validateQuery(filterQuery, fieldSpecs, {
    pagination: false,
  });
  const hasCursor = query.cursor !== undefined && query.cursor !== '';
  const hasLimit = query.limit !== undefined && query.limit !== '';
  const hasPage = query.page !== undefined && query.page !== '';
  const hasPageSize = query.pageSize !== undefined && query.pageSize !== '';
  const cursorMode = hasCursor || hasLimit;

  if (cursorMode && (hasPage || hasPageSize)) {
    details.push({
      field: 'pagination',
      message: 'Cursor pagination cannot be combined with page or pageSize.',
    });
  }

  const page = parsePage(query.page, details);
  const pageSize = parseInteger(
    query.pageSize,
    'pageSize',
    PAGINATION_DEFAULTS.pageSize,
    details
  );
  const limit = parseInteger(
    query.limit,
    'limit',
    PAGINATION_DEFAULTS.pageSize,
    details
  );
  const cursor = parseSingleString(query.cursor, 'cursor', details);

  if (
    cursor !== undefined &&
    (cursor.length > MAX_CURSOR_LENGTH || !CURSOR_PATTERN.test(cursor))
  ) {
    details.push({ field: 'cursor', message: 'Cursor is invalid.' });
  }

  const requestedView = parseSingleString(query.view, 'view', details);
  const view = requestedView || (cursorMode ? 'summary' : 'detail');

  if (!READ_VIEWS.includes(view)) {
    details.push({
      field: 'view',
      message: `Value must be one of: ${READ_VIEWS.join(', ')}.`,
    });
  }

  const includeTotal = parseBoolean(
    query.includeTotal,
    'includeTotal',
    !cursorMode,
    details
  );
  const updatedAfterRaw = parseSingleString(
    query.updatedAfter,
    'updatedAfter',
    details
  );
  let updatedAfter = null;

  if (updatedAfterRaw !== undefined) {
    const timestamp = Date.parse(updatedAfterRaw);

    if (Number.isNaN(timestamp)) {
      details.push({
        field: 'updatedAfter',
        message: 'Value must be an ISO-8601 date.',
      });
    } else {
      updatedAfter = new Date(timestamp);
    }
  }

  if (details.length > 0) {
    fail(details);
  }

  return {
    filters,
    pagination: {
      mode: cursorMode ? 'cursor' : 'offset',
      page,
      pageSize,
      skip: (page - 1) * pageSize,
      limit: cursorMode ? limit : pageSize,
      cursor: cursor || null,
      includeTotal,
      view,
      updatedAfter,
    },
  };
}

module.exports = {
  CURSOR_PATTERN,
  MAX_CURSOR_LENGTH,
  READ_VIEWS,
  READ_KEYS,
  validateReadQuery,
};
