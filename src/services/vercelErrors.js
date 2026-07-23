'use strict';

const {
  VercelForbiddenError,
  VercelNotFoundError,
  VercelConflictError,
  VercelValidationError,
  VercelUnavailableError,
} = require('../utils/errors');

function safeMessage(payload) {
  const message = payload && payload.error && payload.error.message;
  return typeof message === 'string' && message.length <= 240 ? message : null;
}

function translateVercelError(status, payload) {
  const message = safeMessage(payload);
  if (status === 400 || status === 422) {
    return new VercelValidationError(message || 'Vercel rejected the request as invalid.');
  }
  if (status === 401 || status === 403) {
    return new VercelForbiddenError(message || 'The Vercel operation was denied.');
  }
  if (status === 404) {
    return new VercelNotFoundError(message || 'The requested Vercel resource was not found.');
  }
  if (status === 409) {
    return new VercelConflictError(message || 'The Vercel operation conflicts with current state.');
  }
  if (status === 429) {
    return new VercelUnavailableError('Vercel rate limited the request. Retry later.');
  }
  if (status === 504) {
    return new VercelUnavailableError('The Vercel request timed out.');
  }
  return new VercelUnavailableError();
}

module.exports = { translateVercelError };
