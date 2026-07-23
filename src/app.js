'use strict';

const express = require('express');
const helmet = require('helmet');

const { getEnv } = require('./config/env');
const { getHealth } = require('./controllers/health.controller');
const v1Router = require('./routes/v1');
const githubRouter = require('./routes/v1/github');
const vercelRouter = require('./routes/v1/vercel');

const correlationId = require('./middleware/correlationId');
const requestLogger = require('./middleware/requestLogger');
const queryLimits = require('./middleware/queryLimits');
const allowedMethods = require('./middleware/allowedMethods');
const requireDatabase = require('./middleware/requireDatabase');
const requireGithubActionAuth = require('./middleware/requireGithubActionAuth');
const requireGithubRepositoryAccess = require('./middleware/requireGithubRepositoryAccess');
const requireVercelActionAuth = require('./middleware/requireVercelActionAuth');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { createCors, createRateLimiter } = require('./middleware/security');

const JSON_BODY_LIMIT = '10kb';
const GITHUB_JSON_BODY_LIMIT = '512kb';
const VERCEL_JSON_BODY_LIMIT = '64kb';

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

  // Vercel operations use an independent bearer key and deliberately bypass
  // request-time MongoDB availability. Provider credentials remain server-side.
  app.use(
    '/api/v1/vercel',
    express.json({ limit: VERCEL_JSON_BODY_LIMIT }),
    requireVercelActionAuth(env, { source: options.vercelEnvSource }),
    vercelRouter
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
