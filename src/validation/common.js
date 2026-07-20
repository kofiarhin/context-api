'use strict';

const { ValidationError } = require('../utils/errors');

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_SEARCH_LENGTH = 128;

const PAGINATION_DEFAULTS = Object.freeze({
  page: 1,
  pageSize: 20,
  maxPage: 10000,
  maxPageSize: 100,
});

function fail(details) {
  throw new ValidationError('Request validation failed.', details);
}

/**
 * Validates a stable domain identifier taken from a route parameter.
 *
 * Database object IDs are intentionally not accepted here; every public route
 * addresses records by their stable domain key.
 */
function validateIdentifierParam(raw, field) {
  const value = typeof raw === 'string' ? raw.trim() : '';

  if (!value) {
    fail([{ field, message: 'Identifier is required.' }]);
  }

  if (value.length > MAX_IDENTIFIER_LENGTH) {
    fail([
      { field, message: `Identifier must not exceed ${MAX_IDENTIFIER_LENGTH} characters.` },
    ]);
  }

  if (!IDENTIFIER.test(value)) {
    fail([
      {
        field,
        message: 'Identifier may only contain letters, numbers, and the characters . _ : -',
      },
    ]);
  }

  return value;
}

function parseIntegerField(raw, field, { min, max, fallback }, details) {
  if (raw === undefined || raw === '') {
    return fallback;
  }

  if (!/^-?\d+$/.test(String(raw))) {
    details.push({ field, message: 'Value must be an integer.' });
    return fallback;
  }

  const value = Number(raw);

  if (value < min || value > max) {
    details.push({ field, message: `Value must be between ${min} and ${max}.` });
    return fallback;
  }

  return value;
}

const FIELD_PARSERS = {
  enum(raw, field, spec, details) {
    if (!spec.values.includes(raw)) {
      details.push({
        field,
        message: `Value must be one of: ${spec.values.join(', ')}.`,
      });
      return undefined;
    }

    return raw;
  },

  identifier(raw, field, spec, details) {
    if (raw.length > MAX_IDENTIFIER_LENGTH || !IDENTIFIER.test(raw)) {
      details.push({ field, message: 'Value is not a valid identifier.' });
      return undefined;
    }

    return raw;
  },

  search(raw, field, spec, details) {
    const maxLength = spec.maxLength || MAX_SEARCH_LENGTH;

    if (raw.length > maxLength) {
      details.push({ field, message: `Value must not exceed ${maxLength} characters.` });
      return undefined;
    }

    return raw;
  },

  isoDate(raw, field, spec, details) {
    const timestamp = Date.parse(raw);

    if (Number.isNaN(timestamp)) {
      details.push({ field, message: 'Value must be an ISO-8601 date.' });
      return undefined;
    }

    return new Date(timestamp);
  },
};

/**
 * Validates a query string against an explicit field allowlist.
 *
 * Unknown parameters and repeated parameters are rejected so that a typo in a
 * client filter surfaces as a 400 instead of silently widening the result set.
 */
function validateQuery(query, fieldSpecs, { pagination = true } = {}) {
  const details = [];
  const allowedKeys = new Set(Object.keys(fieldSpecs));

  if (pagination) {
    allowedKeys.add('page');
    allowedKeys.add('pageSize');
  }

  for (const key of Object.keys(query)) {
    if (!allowedKeys.has(key)) {
      details.push({ field: key, message: 'Unknown query parameter.' });
    }
  }

  const filters = {};

  for (const [field, spec] of Object.entries(fieldSpecs)) {
    const raw = query[field];

    if (raw === undefined || raw === '') {
      continue;
    }

    if (Array.isArray(raw)) {
      details.push({ field, message: 'Parameter must be supplied at most once.' });
      continue;
    }

    if (typeof raw !== 'string') {
      details.push({ field, message: 'Value must be a string.' });
      continue;
    }

    const parser = FIELD_PARSERS[spec.type];
    const parsed = parser(raw.trim(), field, spec, details);

    if (parsed !== undefined) {
      filters[spec.target || field] = parsed;
    }
  }

  let paginationResult = null;

  if (pagination) {
    const page = parseIntegerField(
      query.page,
      'page',
      { min: 1, max: PAGINATION_DEFAULTS.maxPage, fallback: PAGINATION_DEFAULTS.page },
      details
    );

    const pageSize = parseIntegerField(
      query.pageSize,
      'pageSize',
      { min: 1, max: PAGINATION_DEFAULTS.maxPageSize, fallback: PAGINATION_DEFAULTS.pageSize },
      details
    );

    paginationResult = { page, pageSize, skip: (page - 1) * pageSize, limit: pageSize };
  }

  if (details.length > 0) {
    fail(details);
  }

  return { filters, pagination: paginationResult };
}

module.exports = {
  IDENTIFIER,
  MAX_IDENTIFIER_LENGTH,
  MAX_SEARCH_LENGTH,
  PAGINATION_DEFAULTS,
  validateIdentifierParam,
  validateQuery,
};
