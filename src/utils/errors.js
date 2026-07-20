'use strict';

/**
 * Application error base class.
 *
 * Every error surfaced to a client is translated through this hierarchy so the
 * centralized error middleware never has to inspect raw driver or framework
 * errors when building a response body.
 */
class AppError extends Error {
  constructor(code, message, statusCode, details = []) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Request validation failed.', details = []) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

class ResourceNotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.', details = []) {
    super('RESOURCE_NOT_FOUND', message, 404, details);
  }
}

class RouteNotFoundError extends AppError {
  constructor(message = 'The requested route was not found.', details = []) {
    super('ROUTE_NOT_FOUND', message, 404, details);
  }
}

class MethodNotAllowedError extends AppError {
  constructor(message = 'This API is read-only and only supports GET requests.', details = []) {
    super('METHOD_NOT_ALLOWED', message, 405, details);
  }
}

class AmbiguousResourceError extends AppError {
  constructor(message = 'The request matched more than one resource.', details = []) {
    super('AMBIGUOUS_RESOURCE', message, 409, details);
  }
}

class DatabaseUnavailableError extends AppError {
  constructor(message = 'The database is currently unavailable.', details = []) {
    super('DATABASE_UNAVAILABLE', message, 503, details);
  }
}

class InternalServerError extends AppError {
  constructor(message = 'An unexpected error occurred.', details = []) {
    super('INTERNAL_SERVER_ERROR', message, 500, details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  ResourceNotFoundError,
  RouteNotFoundError,
  MethodNotAllowedError,
  AmbiguousResourceError,
  DatabaseUnavailableError,
  InternalServerError,
};
