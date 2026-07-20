'use strict';

const createApp = require('./app');
const { getEnv } = require('./config/env');
const { connect, disconnect } = require('./config/database');
const logger = require('./utils/logger');

const SHUTDOWN_TIMEOUT_MS = 10000;

function registerShutdownHandlers(server) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info('shutdown.started', { signal });

    const timer = setTimeout(() => {
      logger.error('shutdown.timeout', { signal });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    try {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });

      await disconnect();
      logger.info('shutdown.complete', { signal });
      process.exit(0);
    } catch (error) {
      logger.error('shutdown.failed', { signal, errorName: error.name });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return shutdown;
}

async function start() {
  let env;

  try {
    env = getEnv();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
    return null;
  }

  try {
    await connect(env.mongodbUri, { autoIndex: !env.isProduction });
  } catch (error) {
    logger.error('startup.database_connection_failed', { errorName: error.name });
    process.exit(1);
    return null;
  }

  const app = createApp({ env });
  const server = app.listen(env.port, () => {
    logger.info('server.listening', { port: env.port, environment: env.nodeEnv });
  });

  registerShutdownHandlers(server);

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { start, registerShutdownHandlers };