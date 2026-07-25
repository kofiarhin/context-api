'use strict';

const { loadEnv } = require('../../src/config/env');

/**
 * Builds the controlled base environment every test app starts from.
 *
 * Only the core, non-provider values are read from `process.env` (the in-memory
 * MongoDB URI and rate-limit ceiling published by `tests/globalSetup.js`).
 * Provider gateway credentials a developer keeps in a local `.env` — GitHub,
 * Vercel, Heroku — are deliberately excluded so ordinary integration tests stay
 * deterministic regardless of the ambient environment. Provider-specific tests
 * opt back in through explicit overrides or dedicated env sources.
 */
function baseTestEnv() {
  return loadEnv({
    NODE_ENV: 'test',
    PORT: process.env.PORT || '4001',
    MONGODB_URI: process.env.MONGODB_URI,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || '1000000',
  });
}

module.exports = { baseTestEnv };
