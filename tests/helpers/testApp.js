'use strict';

const createApp = require('../../src/app');
const { loadEnv } = require('../../src/config/env');

/**
 * Builds an app bound to the test environment, with optional overrides so a
 * suite can exercise configuration-driven behavior such as CORS or rate limits.
 */
function buildTestApp(overrides = {}) {
  const env = { ...loadEnv(process.env), ...overrides };

  return createApp({ env });
}

module.exports = { buildTestApp };
