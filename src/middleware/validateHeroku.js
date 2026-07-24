'use strict';

const { ValidationError } = require('../utils/errors');

const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_IDENTIFIER = 255;
const MAX_BODY_KEYS = 100;

function validateValue(name, value) {
  if (value === undefined || value === null) return;
  const string = String(value);
  if (!string || string.length > MAX_IDENTIFIER || CONTROL.test(string)) {
    throw new ValidationError(`Invalid Heroku ${name}.`);
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

function validateBody(body) {
  if (body === undefined || body === null) return;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Heroku request body must be an object.');
  }
  if (Object.keys(body).length > MAX_BODY_KEYS) {
    throw new ValidationError(`Heroku request body may contain at most ${MAX_BODY_KEYS} keys.`);
  }
  validateApproval(body.approval);
  if (body.quantity !== undefined && (!Number.isInteger(Number(body.quantity)) || Number(body.quantity) < 0)) {
    throw new ValidationError('Heroku dyno quantity must be a non-negative integer.');
  }
  for (const field of ['url', 'source_blob_url', 'callbackUrl']) {
    if (body[field] !== undefined) {
      let url;
      try {
        url = new URL(body[field]);
      } catch {
        throw new ValidationError(`Heroku ${field} must be a valid HTTPS URL.`);
      }
      if (url.protocol !== 'https:') throw new ValidationError(`Heroku ${field} must use HTTPS.`);
    }
  }
}

function validateHeroku(req, res, next) {
  try {
    for (const [name, value] of Object.entries(req.params || {})) validateValue(name, value);
    for (const [name, value] of Object.entries(req.query || {})) {
      if (Array.isArray(value)) value.forEach((item) => validateValue(name, item));
      else validateValue(name, value);
    }
    validateBody(req.body);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = validateHeroku;
module.exports.validateValue = validateValue;
module.exports.validateApproval = validateApproval;
module.exports.validateBody = validateBody;
