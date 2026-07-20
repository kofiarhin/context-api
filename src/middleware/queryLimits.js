'use strict';

const { ValidationError } = require('../utils/errors');

const MAX_QUERY_STRING_LENGTH = 2048;

/**
 * Caps the raw query string before any parsing work happens, bounding the cost
 * of a request that arrives with an oversized filter payload.
 */
function queryLimits(req, res, next) {
  const queryStringIndex = req.originalUrl.indexOf('?');
  const queryString = queryStringIndex === -1 ? '' : req.originalUrl.slice(queryStringIndex + 1);

  if (queryString.length > MAX_QUERY_STRING_LENGTH) {
    next(
      new ValidationError('Request validation failed.', [
        {
          field: 'query',
          message: `Query string must not exceed ${MAX_QUERY_STRING_LENGTH} characters.`,
        },
      ])
    );
    return;
  }

  next();
}

module.exports = queryLimits;
module.exports.MAX_QUERY_STRING_LENGTH = MAX_QUERY_STRING_LENGTH;
