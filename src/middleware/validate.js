'use strict';

const { validateIdentifierParam } = require('../validation/common');

/**
 * Validation runs as middleware so it always completes before a controller is
 * invoked (SPEC §10). Validators throw synchronously and Express routes the
 * resulting ValidationError to the centralized error handler.
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

module.exports = { validateQuery, validateParam };
