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
  constructor(
    message = 'This HTTP method is not supported for the requested route.',
    details = []
  ) {
    super('METHOD_NOT_ALLOWED', message, 405, details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'The request conflicts with an existing resource.', details = []) {
    super('RESOURCE_CONFLICT', message, 409, details);
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

/**
 * GitHub gateway errors.
 *
 * These are deliberately separate from the MongoDB-backed context errors so a
 * GitHub failure can never be confused with a domain record failure, and so the
 * translator can discard upstream bodies at one well-known boundary.
 */
class AuthenticationRequiredError extends AppError {
  constructor(message = 'A valid bearer token is required.', details = []) {
    super('AUTHENTICATION_REQUIRED', message, 401, details);
  }
}

class GithubForbiddenError extends AppError {
  constructor(message = 'The GitHub operation was denied.', details = []) {
    super('GITHUB_FORBIDDEN', message, 403, details);
  }
}

class GithubNotFoundError extends AppError {
  constructor(message = 'The requested GitHub resource was not found.', details = []) {
    super('GITHUB_NOT_FOUND', message, 404, details);
  }
}

class GithubConflictError extends AppError {
  constructor(
    message = 'The GitHub operation conflicts with the current repository state.',
    details = []
  ) {
    super('GITHUB_CONFLICT', message, 409, details);
  }
}

class UnsupportedContentError extends AppError {
  constructor(message = 'The repository content is not supported.', details = []) {
    super('UNSUPPORTED_CONTENT', message, 415, details);
  }
}

class GithubValidationError extends AppError {
  constructor(message = 'GitHub rejected the request as invalid.', details = []) {
    super('GITHUB_VALIDATION_ERROR', message, 422, details);
  }
}

class GithubUnavailableError extends AppError {
  constructor(message = 'GitHub is currently unavailable.', details = []) {
    super('GITHUB_UNAVAILABLE', message, 502, details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  ResourceNotFoundError,
  RouteNotFoundError,
  MethodNotAllowedError,
  ConflictError,
  AmbiguousResourceError,
  DatabaseUnavailableError,
  InternalServerError,
  AuthenticationRequiredError,
  GithubForbiddenError,
  GithubNotFoundError,
  GithubConflictError,
  UnsupportedContentError,
  GithubValidationError,
  GithubUnavailableError,
};
