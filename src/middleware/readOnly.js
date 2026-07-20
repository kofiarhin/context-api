'use strict';

const { MethodNotAllowedError } = require('../utils/errors');

const ALLOWED_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * The MVP exposes read routes only. Rejecting write verbs here produces a
 * deterministic 405 instead of letting them fall through to a misleading 404.
 */
function readOnly(req, res, next) {
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', 'GET, HEAD, OPTIONS');
    next(new MethodNotAllowedError());
    return;
  }

  next();
}

module.exports = readOnly;
module.exports.ALLOWED_METHODS = ALLOWED_METHODS;
