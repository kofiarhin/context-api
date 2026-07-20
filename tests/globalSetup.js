'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * Starts one in-memory MongoDB instance for the whole run and publishes its URI
 * through the environment, which Jest propagates to worker processes.
 */
module.exports = async function globalSetup() {
  const server = await MongoMemoryServer.create();

  globalThis.__MONGO_SERVER__ = server;

  process.env.NODE_ENV = 'test';
  process.env.PORT = process.env.PORT || '4001';
  process.env.MONGODB_URI = server.getUri('context_api_test');
  // Keep limiting out of the way of functional suites; a dedicated suite builds
  // its own app with a low limit.
  process.env.RATE_LIMIT_MAX = '1000000';
};
