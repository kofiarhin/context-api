'use strict';

/**
 * Forwards rejected promises to the centralized error middleware.
 *
 * Express 5 already forwards async rejections, but wrapping keeps the intent
 * explicit and keeps handlers portable if the router changes.
 */
function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
