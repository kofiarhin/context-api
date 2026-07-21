'use strict';

const { MethodNotAllowedError } = require('../utils/errors');

const ALLOWED_METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'DELETE'];
const ALLOW_HEADER = ALLOWED_METHODS.join(', ');

/**
 * The API exposes create, read, update, and soft-delete verbs. PUT is
 * deliberately unsupported because updates are partial, so rejecting unknown
 * verbs here produces a deterministic 405 instead of a misleading 404.
 *
 * This guard is environment-independent on purpose: a previous release wired a
 * GET-only variant of this middleware, which silently turned production into a
 * read-only API.
 */
function allowedMethods(req, res, next) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOW_HEADER);
    next(new MethodNotAllowedError());
    return;
  }

  next();
}

module.exports = allowedMethods;
module.exports.ALLOWED_METHODS = ALLOWED_METHODS;
module.exports.ALLOW_HEADER = ALLOW_HEADER;
