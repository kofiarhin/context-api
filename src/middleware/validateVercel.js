'use strict';

const { ValidationError } = require('../utils/errors');

const SAFE_ID = /^[A-Za-z0-9._:@/-]{1,240}$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function cleanObject(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object.`);
  return value;
}

function validateIdentifier(name, value) {
  if (typeof value !== 'string' || !SAFE_ID.test(value.trim())) {
    throw new ValidationError(`${name} is invalid.`);
  }
  return value.trim();
}

function validateDomain(value) {
  const domain = String(value || '').trim().toLowerCase();
  if (!DOMAIN.test(domain)) throw new ValidationError('domain is invalid.');
  return domain;
}

function normalize(source, kind) {
  const output = { ...cleanObject(source, kind) };
  const identifiers = ['teamId', 'project', 'projectId', 'deployment', 'variable', 'record'];
  for (const name of identifiers) {
    if (output[name] !== undefined) output[name] = validateIdentifier(name, output[name]);
  }
  if (output.domain !== undefined) output.domain = validateDomain(output.domain);
  if (output.alias !== undefined) output.alias = validateDomain(output.alias);
  if (output.limit !== undefined) {
    const limit = Number(output.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ValidationError('limit must be between 1 and 100.');
    output.limit = limit;
  }
  if (output.target !== undefined && !Array.isArray(output.target) && !['preview', 'production'].includes(output.target)) {
    throw new ValidationError('target is invalid.');
  }
  return output;
}

function merge(req, patch) {
  req.validated = { ...(req.validated || {}), ...patch };
}

function validateVercelQuery(req, res, next) {
  merge(req, { query: normalize(req.query, 'query') });
  next();
}

function validateVercelBody(req, res, next) {
  merge(req, { body: normalize(req.body === undefined ? {} : req.body, 'body') });
  next();
}

function validateVercelParams(req, res, next) {
  const params = {};
  for (const [name, value] of Object.entries(req.params || {})) {
    params[name] = name === 'domain' || name === 'alias' ? validateDomain(value) : validateIdentifier(name, value);
  }
  merge(req, { params });
  next();
}

module.exports = { validateVercelQuery, validateVercelBody, validateVercelParams, validateIdentifier, validateDomain };
