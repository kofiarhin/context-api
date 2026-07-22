'use strict';

const express = require('express');
const helmet = require('helmet');

const { getEnv } = require('./config/env');
const { getHealth } = require('./controllers/health.controller');
const v1Router = require('./routes/v1');
const githubRouter = require('./routes/v1/github');

const correlationId = require('./middleware/correlationId');
const requestLogger = require('./middleware/requestLogger');
const queryLimits = require('./middleware/queryLimits');
const allowedMethods = require('./middleware/allowedMethods');
const requireDatabase = require('./middleware/requireDatabase');
const requireGithubActionAuth = require('./middleware/requireGithubActionAuth');
const requireGithubRepositoryAccess = require('./middleware/requireGithubRepositoryAccess');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { createCors, createRateLimiter } = require('./middleware/security');

const JSON_BODY_LIMIT = '10kb';
// File writes carry whole-file replacement content, so the GitHub namespace
// needs far more headroom than the context routes. It stays bounded well below
// the 250,000-character content limit's worst-case encoded size.
const GITHUB_JSON_BODY_LIMIT = '512kb';

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

  app.use(correlationId);
  app.use(requestLogger);
  app.use(queryLimits);

  app.get('/health', getHealth);

  // Rate limiting and the method allowlist apply to the whole versioned API.
  app.use('/api/v1', createRateLimiter(env), allowedMethods);

  // The GitHub gateway is mounted first, with its own parser and its own
  // authentication. It deliberately skips `requireDatabase`: these routes talk
  // to GitHub, so request handling does not depend on the database middleware.
  app.use(
    '/api/v1/github',
    express.json({ limit: GITHUB_JSON_BODY_LIMIT }),
    requireGithubActionAuth(env),
    requireGithubRepositoryAccess(env),
    githubRouter
  );

  app.use('/api/v1', express.json({ limit: JSON_BODY_LIMIT }), requireDatabase, v1Router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
module.exports.JSON_BODY_LIMIT = JSON_BODY_LIMIT;
module.exports.GITHUB_JSON_BODY_LIMIT = GITHUB_JSON_BODY_LIMIT;
