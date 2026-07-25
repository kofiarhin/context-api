'use strict';

const { AppError } = require('../../utils/errors');

const MAP = {
  400: ['HEROKU_INVALID_REQUEST', 400, 'Heroku rejected the request.'],
  401: ['HEROKU_UNAUTHORIZED', 502, 'Heroku authentication failed.'],
  402: ['HEROKU_PAYMENT_REQUIRED', 402, 'Heroku requires billing verification for this operation.'],
  403: ['HEROKU_RESOURCE_FORBIDDEN', 403, 'The Heroku operation was denied.'],
  404: ['HEROKU_NOT_FOUND', 404, 'The requested Heroku resource was not found.'],
  409: ['HEROKU_CONFLICT', 409, 'The Heroku operation conflicts with current state.'],
  412: ['HEROKU_PRECONDITION_FAILED', 412, 'The Heroku resource changed before this operation completed.'],
  422: ['HEROKU_INVALID_REQUEST', 422, 'Heroku rejected the request as invalid.'],
  429: ['HEROKU_RATE_LIMITED', 429, 'The Heroku API rate limit was reached.'],
};

function translateHerokuError(status, requestId) {
  const [code, outputStatus, message] = MAP[status] || [
    status >= 500 ? 'HEROKU_UNAVAILABLE' : 'HEROKU_REQUEST_FAILED',
    status >= 500 ? 502 : status,
    status >= 500 ? 'Heroku is currently unavailable.' : 'The Heroku request failed.',
  ];
  return new AppError(code, message, outputStatus, requestId ? [{ requestId }] : []);
}

module.exports = { translateHerokuError };
