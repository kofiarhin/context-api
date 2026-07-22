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

function validateGithubParam(name) {
  return function githubParamValidator(req, res, next) {
    const params = { ...((req.validated || {}).params || {}) };
    params[name] = paramSchemas[name](req.params[name]);

    merge(req, { params });
    next();
  };
}

module.exports = { validateGithubQuery, validateGithubBody, validateGithubParam };
