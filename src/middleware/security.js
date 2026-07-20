'use strict';

const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { buildErrorBody } = require('../utils/responses');

/**
 * Builds CORS options from an explicit allowlist.
 *
 * With no configured origins the API answers same-origin and non-browser
 * clients only; it never falls back to a permissive wildcard.
 */
function buildCorsOptions(env) {
  const allowlist = env.corsOrigins || [];

  return {
    origin(origin, callback) {
      if (!origin || allowlist.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
    maxAge: 600,
  };
}

function createCors(env) {
  return cors(buildCorsOptions(env));
}

function createRateLimiter(env) {
  return rateLimit({
    windowMs: env.rateLimitWindowMs,
    limit: env.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(req, res) {
      res.status(429).json(
        buildErrorBody({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please retry later.',
          correlationId: req.correlationId,
        })
      );
    },
  });
}

module.exports = { buildCorsOptions, createCors, createRateLimiter };
