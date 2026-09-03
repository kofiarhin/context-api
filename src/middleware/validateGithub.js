'use strict';

const { querySchemas, bodySchemas, paramSchemas } = require('../validation/github.schemas');

/**
 * GitHub request validation middleware.
 *
 * Validators run before any controller, so a request that reaches the service
 * layer has already been normalized and allowlisted. Results are collected on
 * `req.validated` following the convention used by the context routes.
 */

function merge(req, patch) {
  req.validated = { ...(req.validated || {}), ...patch };
}

function validateGithubQuery(name) {
  return function githubQueryValidator(req, res, next) {
    merge(req, { query: querySchemas[name](req.query) });
    next();
  };
}

function validateGithubBody(name) {
  return function githubBodyValidator(req, res, next) {
    merge(req, { body: bodySchemas[name](req.body === undefined ? {} : req.body) });
    next();
  };
}

/**
 * Validates DELETE file input from query parameters when present, falling back
 * to the legacy JSON body contract for existing callers. Some HTTP clients and
 * OpenAPI runtimes do not reliably transmit bodies on DELETE requests.
 */
function validateGithubDeleteFile(req, res, next) {
  const hasQueryInput = Object.keys(req.query || {}).length > 0;
  const source = hasQueryInput ? req.query : req.body === undefined ? {} : req.body;

  merge(req, { body: bodySchemas.deleteFile(source) });
  next();
}

function validateGithubParam(name) {
  return function githubParamValidator(req, res, next) {
    const params = { ...((req.validated || {}).params || {}) };
    params[name] = paramSchemas[name](req.params[name]);

    merge(req, { params });
    next();
  };
}

module.exports = {
  validateGithubQuery,
  validateGithubBody,
  validateGithubDeleteFile,
  validateGithubParam,
};
