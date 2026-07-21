'use strict';

const express = require('express');
const helmet = require('helmet');

const { getEnv } = require('./config/env');
const { getHealth } = require('./controllers/health.controller');
const v1Router = require('./routes/v1');

const correlationId = require('./middleware/correlationId');
const requestLogger = require('./middleware/requestLogger');
const queryLimits = require('./middleware/queryLimits');
const allowedMethods = require('./middleware/allowedMethods');
const requireDatabase = require('./middleware/requireDatabase');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { createCors, createRateLimiter } = require('./middleware/security');

const JSON_BODY_LIMIT = '10kb';

/**
 * Builds the Express application without binding a port, so tests can drive it
 * in-process.
 *
 * `options.env` allows a test to supply a configuration variant (for example a
 * low rate limit) without mutating process-wide state.
 */
function createApp(options = {}) {
  const env = options.env || getEnv();
  const app = express();

  app.disable('x-powered-by');
  // A fixed hop count keeps rate limiting keyed on a trustworthy client address.
  app.set('trust proxy', env.isProduction ? 1 : 'loopback');

  app.use(helmet());
  app.use(createCors(env));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use(correlationId);
  app.use(requestLogger);
  app.use(queryLimits);

  app.get('/health', getHealth);

  app.use('/api/v1', createRateLimiter(env), allowedMethods, requireDatabase, v1Router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
module.exports.JSON_BODY_LIMIT = JSON_BODY_LIMIT;
