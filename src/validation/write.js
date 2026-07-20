'use strict';

const { getCrudDomain } = require('../config/crudDomains');
const { ValidationError } = require('../utils/errors');
const { validateIdentifierParam } = require('./common');

const MANAGED_FIELDS = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'archivedAt']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateWriteBody(domainName, mode, body) {
  const config = getCrudDomain(domainName);
  const details = [];

  if (!isPlainObject(body)) {
    throw new ValidationError('Request validation failed.', [
      { field: 'body', message: 'Request body must be a JSON object.' },
    ]);
  }

  const keys = Object.keys(body);

  if (mode === 'patch' && keys.length === 0) {
    details.push({ field: 'body', message: 'At least one field is required.' });
  }

  for (const field of keys) {
    if (MANAGED_FIELDS.has(field)) {
      details.push({
        field,
        message: 'Field is managed by the API and cannot be supplied.',
      });
      continue;
    }

    if (!config.Model.schema.path(field)) {
      details.push({ field, message: 'Unknown field.' });
    }
  }

  if (mode === 'create') {
    if (!Object.prototype.hasOwnProperty.call(body, config.identifierField)) {
      details.push({
        field: config.identifierField,
        message: 'Stable identifier is required.',
      });
    } else {
      try {
        validateIdentifierParam(body[config.identifierField], config.identifierField);
      } catch (error) {
        details.push(...error.details);
      }
    }
  }

  if (mode === 'patch' && Object.prototype.hasOwnProperty.call(body, config.identifierField)) {
    details.push({
      field: config.identifierField,
      message: 'Stable identifier is immutable.',
    });
  }

  if (details.length > 0) {
    throw new ValidationError('Request validation failed.', details);
  }

  return { ...body };
}

module.exports = { MANAGED_FIELDS, validateWriteBody };
