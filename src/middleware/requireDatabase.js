'use strict';

const { isConnected } = require('../config/database');
const { DatabaseUnavailableError } = require('../utils/errors');

/**
 * Short-circuits domain requests while the database is unreachable so callers
 * receive DATABASE_UNAVAILABLE rather than waiting for a driver timeout.
 */
function requireDatabase(req, res, next) {
  if (!isConnected()) {
    next(new DatabaseUnavailableError());
    return;
  }

  next();
}

module.exports = requireDatabase;
