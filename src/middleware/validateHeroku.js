'use strict';

const { ValidationError } = require('../utils/errors');

const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_IDENTIFIER = 255;
const MAX_BODY_KEYS = 100;
const DISPATCH_FIELDS = new Set(['params', 'query', 'body', 'approval', 'expectedEtag', 'range']);

function validateValue(name, value) {
  if (value === undefined || value === null) return;
  const string = String(value);
  if (!string || string.length > MAX_IDENTIFIER || CONTROL.test(string)) {
    throw new ValidationError(`Invalid Heroku ${name}.`);
  }
}

function validateMap(name, value) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`Heroku ${name} must be an object.`);
  }
  if (Object.keys(value).length > MAX_BODY_KEYS) {
    throw new ValidationError(`Heroku ${name} may contain at most ${MAX_BODY_KEYS} keys.`);
  }
  for (const [key, item] of Object.entries(value)) {
    validateValue(`${name} key`, key);
    if (name !== 'body' && item !== undefined && item !== null) {
      if (Array.isArray(item)) item.forEach((entry) => validateValue(`${name} ${key}`, entry));
      else if (typeof item !== 'object') validateValue(`${name} ${key}`, item);
    }
  }
}

function validateApproval(approval) {
  if (approval === undefined) return;
  if (!approval || typeof approval !== 'object' || Array.isArray(approval)) {
    throw new ValidationError('Heroku approval evidence must be an object.');
  }
  const allowed = new Set([
    'approvedBy',
    'authority',
    'workKey',
    'reason',
    'expectedResourceId',
    'expectedEtag',
    'expectedCurrentRelease',
  ]);
  for (const key of Object.keys(approval)) {
    if (!allowed.has(key)) throw new ValidationError(`Unknown Heroku approval field: ${key}.`);
    validateValue(`approval ${key}`, approval[key]);
  }
}

function validateMutationBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  if (
    body.quantity !== undefined &&
    (!Number.isInteger(Number(body.quantity)) || Number(body.quantity) < 0)
  ) {
    throw new ValidationError('Heroku dyno quantity must be a non-negative integer.');
  }
  for (const field of ['url', 'source_blob_url', 'callbackUrl']) {
    if (body[field] === undefined) continue;
    let url;
    try {
      url = new URL(body[field]);
    } catch {
      throw new ValidationError(`Heroku ${field} must be a valid HTTPS URL.`);
    }
    if (url.protocol !== 'https:') throw new ValidationError(`Heroku ${field} must use HTTPS.`);
  }
}

function validateBody(body, dispatch = false) {
  if (body === undefined || body === null) return;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Heroku request body must be an object.');
  }
  if (Object.keys(body).length > MAX_BODY_KEYS) {
    throw new ValidationError(`Heroku request body may contain at most ${MAX_BODY_KEYS} keys.`);
  }

  if (dispatch) {
    for (const key of Object.keys(body)) {
      if (!DISPATCH_FIELDS.has(key))
        throw new ValidationError(`Unknown Heroku dispatcher field: ${key}.`);
    }
    validateMap('params', body.params);
    validateMap('query', body.query);
    validateMap('body', body.body);
    validateMutationBody(body.body);
    validateApproval(body.approval);
    validateValue('expectedEtag', body.expectedEtag);
    validateValue('range', body.range);
    return;
  }

  validateApproval(body.approval);
  validateMutationBody(body);
}

function validateHeroku(req, res, next) {
  try {
    for (const [name, value] of Object.entries(req.params || {})) validateValue(name, value);
    for (const [name, value] of Object.entries(req.query || {})) {
      if (Array.isArray(value)) value.forEach((item) => validateValue(name, item));
      else validateValue(name, value);
    }
    validateBody(req.body, Boolean(req.params && req.params.operationId));
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = validateHeroku;
module.exports.validateValue = validateValue;
module.exports.validateMap = validateMap;
module.exports.validateApproval = validateApproval;
module.exports.validateBody = validateBody;
module.exports.validateMutationBody = validateMutationBody;
