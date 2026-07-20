'use strict';

const { RouteNotFoundError } = require('../utils/errors');

function notFound(req, res, next) {
  next(new RouteNotFoundError(`Route ${req.method} ${req.path} was not found.`));
}

module.exports = notFound;
