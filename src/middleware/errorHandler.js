'use strict';

const logger = require('../utils/logger');
const { buildErrorBody } = require('../utils/responses');
const {
  AppError,
  ValidationError,
  ConflictError,
  DatabaseUnavailableError,
  InternalServerError,
} = require('../utils/errors');

const DATABASE_UNAVAILABLE_ERRORS = [
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
];

/**
 * Maps a non-application error onto the operational error hierarchy.
 *
 * Raw driver messages are discarded here rather than forwarded, because they can
 * embed host names and connection strings.
 */
function translate(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (DATABASE_UNAVAILABLE_ERRORS.includes(error.name)) {
    return new DatabaseUnavailableError();
  }

  if (error.code === 11000) {
    const fields = Object.keys(error.keyPattern || error.keyValue || {});
    const details = fields.map((field) => ({
      field,
      message: 'Value must be unique.',
    }));

    return new ConflictError('A resource with the same identifier already exists.', details);
  }

  if (error.name === 'CastError') {
    return new ValidationError('Request validation failed.', [
      { field: error.path, message: 'Value is not a valid identifier.' },
    ]);
  }

  if (error.name === 'StrictModeError') {
    return new ValidationError('Request validation failed.', [
      { field: error.path || 'body', message: 'Unknown field.' },
    ]);
  }

  if (error.name === 'ValidationError' && error.errors) {
    const details = Object.keys(error.errors).map((field) => ({
      field,
      message: 'Value failed schema validation.',
    }));

    return new ValidationError('Request validation failed.', details);
  }

  if (error.type === 'entity.parse.failed') {
    return new ValidationError('Request validation failed.', [
      { field: 'body', message: 'Request body is not valid JSON.' },
    ]);
  }

  if (error.type === 'entity.too.large') {
    return new ValidationError('Request validation failed.', [
      {
        field: 'body',
        message: 'Request body exceeds the configured size limit.',
      },
    ]);
  }

  return new InternalServerError();
}

function errorHandler(error, req, res, next) {
  const translated = translate(error);

  const logContext = {
    correlationId: req.correlationId,
    method: req.method,
    path: req.path,
    status: translated.statusCode,
    code: translated.code,
    errorName: error.name,
  };

  if (translated.statusCode >= 500) {
    // The stack stays in the log sink and never reaches the response body.
    logger.error('request.failed', { ...logContext, stack: error.stack });
  } else {
    logger.warn('request.rejected', logContext);
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(translated.statusCode).json(
    buildErrorBody({
      code: translated.code,
      message: translated.message,
      details: translated.details,
      correlationId: req.correlationId,
    })
  );
}

module.exports = errorHandler;
module.exports.translate = translate;
