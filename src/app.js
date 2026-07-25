'use strict';

const express = require('express');
const helmet = require('helmet');

const { getEnv } = require('./config/env');
const { getHealth } = require('./controllers/health.controller');
const v1Router = require('./routes/v1');
const githubRouter = require('./routes/v1/github');
const vercelRouter = require('./routes/v1/vercel');
const herokuRouter = require('./routes/v1/heroku');
const zoroRouter = require('./routes/v1/zoro');

const correlationId = require('./middleware/correlationId');
const requestLogger = require('./middleware/requestLogger');
const queryLimits = require('./middleware/queryLimits');
const allowedMethods = require('./middleware/allowedMethods');
const requireDatabase = require('./middleware/requireDatabase');
const requireGithubActionAuth = require('./middleware/requireGithubActionAuth');
const requireGithubRepositoryAccess = require('./middleware/requireGithubRepositoryAccess');
const requireVercelActionAuth = require('./middleware/requireVercelActionAuth');
const requireHerokuActionAuth = require('./middleware/requireHerokuActionAuth');
const requireEngineeringActionAuth = require('./middleware/requireEngineeringActionAuth');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { createCors, createRateLimiter } = require('./middleware/security');

const JSON_BODY_LIMIT = '10kb';
const GITHUB_JSON_BODY_LIMIT = '512kb';
const VERCEL_JSON_BODY_LIMIT = '64kb';
const HEROKU_JSON_BODY_LIMIT = '256kb';
// The unified dispatcher can carry a whole-file GitHub write, so it needs the
// same headroom as the GitHub gateway rather than the 10kb context default.
const ZORO_JSON_BODY_LIMIT = '512kb';

function createApp(options = {}) {
  const env = options.env || getEnv();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.isProduction ? 1 : 'loopback');

  app.use(helmet());
  app.use(createCors(env));
  app.use(correlationId);
  app.use(requestLogger);
  app.use(queryLimits);

  app.get('/health', getHealth);
  app.use('/api/v1', createRateLimiter(env), allowedMethods);

  app.use(
    '/api/v1/github',
    express.json({ limit: GITHUB_JSON_BODY_LIMIT }),
    requireGithubActionAuth(env),
    requireGithubRepositoryAccess(env),
    githubRouter
  );

  app.use(
    '/api/v1/vercel',
    express.json({ limit: VERCEL_JSON_BODY_LIMIT }),
    requireVercelActionAuth(env, { source: options.vercelEnvSource }),
    vercelRouter
  );

  app.use(
    '/api/v1/heroku',
    express.json({ limit: HEROKU_JSON_BODY_LIMIT }),
    requireHerokuActionAuth(env, { source: options.herokuEnvSource }),
    herokuRouter
  );

  /**
   * The unified Zoro engineering dispatcher.
   *
   * Mounted alongside the provider gateways and ahead of `requireDatabase`: a
   * Mongo outage must not take the GitHub, Vercel, and Heroku dispatchers
   * offline. The database-backed dispatchers (context, engineering, opslog)
   * assert availability individually inside `zoroDispatcher`.
   */
  app.use(
    '/api/v1/zoro',
    express.json({ limit: ZORO_JSON_BODY_LIMIT }),
    requireEngineeringActionAuth(env, { source: options.engineeringEnvSource }),
    zoroRouter
  );

  app.use('/api/v1', express.json({ limit: JSON_BODY_LIMIT }), requireDatabase, v1Router);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
module.exports.JSON_BODY_LIMIT = JSON_BODY_LIMIT;
module.exports.GITHUB_JSON_BODY_LIMIT = GITHUB_JSON_BODY_LIMIT;
module.exports.VERCEL_JSON_BODY_LIMIT = VERCEL_JSON_BODY_LIMIT;
module.exports.HEROKU_JSON_BODY_LIMIT = HEROKU_JSON_BODY_LIMIT;
module.exports.ZORO_JSON_BODY_LIMIT = ZORO_JSON_BODY_LIMIT;
