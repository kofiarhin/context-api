'use strict';

const { validateIdentifierParam } = require('../validation/common');
const { validateWriteBody } = require('../validation/write');

/**
 * Validation runs as middleware so it always completes before a controller is
 * invoked. Validators throw synchronously and Express routes the resulting
 * ValidationError to the centralized error handler.
 */
function validateQuery(validator) {
  return function queryValidator(req, res, next) {
    const { filters, pagination } = validator(req.query);

    req.validated = { ...(req.validated || {}), filters, pagination };
    next();
  };
}

function validateParam(name) {
  return function paramValidator(req, res, next) {
    const value = validateIdentifierParam(req.params[name], name);

    req.validated = {
      ...(req.validated || {}),
      params: { ...((req.validated || {}).params || {}), [name]: value },
    };

    next();
  };
}

function validateBody(domainName, mode) {
  return function bodyValidator(req, res, next) {
    const body = validateWriteBody(domainName, mode, req.body);

    req.validated = { ...(req.validated || {}), body };
    next();
  };
}

module.exports = { validateQuery, validateParam, validateBody };
